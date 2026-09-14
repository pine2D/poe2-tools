import type { CatalogBase, CraftCatalog } from './catalog'
import { jewelEffectModKind } from './jewelEffectRules'
import { isBasicJewel } from './jewels'
import { isLiquidEmotionMappedMod } from './liquidEmotions'
import type { CraftResult, CraftState } from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'
import type { ItemDocument } from './types'

// 固定 PoB Item.lua 的品质类别、英文描述符与标签，材料译名沿用官方静态目录。
export const CATALYSTS = [
  { id: 'Flesh', descriptor: 'Life', label: '生命', tags: ['life'] },
  { id: 'Neural', descriptor: 'Mana', label: '魔力', tags: ['mana'] },
  {
    id: 'Carapace',
    descriptor: 'Defence',
    label: '防御',
    tags: ['defences', 'armour', 'evasion', 'energyshield'],
  },
  { id: "Uul-Netol's", descriptor: 'Physical', label: '物理', tags: ['physical'] },
  { id: "Xoph's", descriptor: 'Fire', label: '火焰', tags: ['fire'] },
  { id: "Tul's", descriptor: 'Cold', label: '冰霜', tags: ['cold'] },
  { id: "Esh's", descriptor: 'Lightning', label: '闪电', tags: ['lightning'] },
  { id: "Chayula's", descriptor: 'Chaos', label: '混沌', tags: ['chaos'] },
  { id: 'Reaver', descriptor: 'Attack', label: '攻击', tags: ['attack'] },
  { id: 'Sibilant', descriptor: 'Caster', label: '施法', tags: ['caster'] },
  { id: 'Skittering', descriptor: 'Speed', label: '速度', tags: ['speed'] },
  { id: 'Adaptive', descriptor: 'Attribute', label: '属性', tags: ['attribute'] },
  { id: 'Necrotic', descriptor: 'Minion', label: '召唤生物', tags: ['minion'] },
] as const

export interface CatalystQuality {
  id: string
  quality: number
  /** 用户核对了未知类型或声明搜索起点，不是一次材料施加。 */
  declared?: true
}

export const CATALYST_QUALITY_HEADER = /^(?:Quality|品质|品質)\s*[(（]/i

export function readCatalystQuality(item: ItemDocument): CraftResult<
  | {
      id: string | null
      quality: number
      raw: string
    }
  | undefined
> {
  const properties = item.blocks
    .filter((block) => block.kind === 'properties')
    .flatMap((block) => block.lines)
  const lines = properties.filter((line) => CATALYST_QUALITY_HEADER.test(line.raw.trim()))
  if (lines.length === 0) return { ok: true, value: undefined }
  if (
    lines.length !== 1 ||
    properties.some((line) => /^(?:Quality|品质|品質)\s*[:：]/i.test(line.raw.trim()))
  )
    return { ok: false, error: '品质属性重复，或同时存在普通品质与催化品质。' }
  const raw = lines[0]?.raw.trim() ?? ''
  const match = raw.match(
    /^(?:Quality|品质|品質)\s*(?:\(([^()（）]+)\)|（([^()（）]+)）)\s*[:：]\s*\+?(\d+)%\s*(?:\(augmented\))?$/i,
  )
  const quality = Number(match?.[3])
  if (!match || !Number.isInteger(quality) || quality < 0 || quality > 40)
    return { ok: false, error: '催化品质格式无效，数值应为 0–40 的整数。' }
  const descriptor = (match[1] ?? match[2] ?? '').trim()
  const definition = CATALYSTS.find(
    (entry) => `${entry.descriptor} Modifiers`.toLowerCase() === descriptor.toLowerCase(),
  )
  return { ok: true, value: { id: definition?.id ?? null, quality, raw } }
}

export function isCatalystQuality(value: unknown): value is CatalystQuality {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).every((key) => ['id', 'quality', 'declared'].includes(key)) &&
    CATALYSTS.some((entry) => entry.id === record.id) &&
    typeof record.quality === 'number' &&
    Number.isInteger(record.quality) &&
    record.quality >= 0 &&
    record.quality <= 40 &&
    (!Object.hasOwn(record, 'declared') || record.declared === true)
  )
}

export function catalystQualityLimit(base: CatalogBase): number | null {
  const jewel = isBasicJewel(base)
  if (!['Ring', 'Amulet'].includes(base.type) && !jewel) return null
  if (
    base.hidden ||
    base.runeforged ||
    base.variantList !== undefined ||
    (base.sourceQuality !== null && base.sourceQuality !== 0)
  )
    return null
  const breach =
    base.id === 'Breach Ring' && base.type === 'Ring' && base.implicit === '+20% to Maximum Quality'
  if (!breach && /quality/i.test(base.implicit ?? '')) return null
  return breach ? 40 : 20
}

export function catalystStateError(catalog: CraftCatalog, state: CraftState): string | null {
  if (state.catalyst === undefined) return null
  if (!isCatalystQuality(state.catalyst)) return '催化品质字段无效。'
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const limit = base ? catalystQualityLimit(base) : null
  if (limit === null) return '此基底的催化品质规则尚未支持。'
  if (state.quality !== undefined) return '催化品质不能同时作为普通品质保存。'
  if (state.catalyst.quality > limit) return `此基底的催化品质上限为 ${limit}%。`
  if (statScalabilitySourceHash(catalog) === null) return '催化品质需要可信的属性缩放来源指纹。'
  if (
    state.affixes.some(
      (affix) =>
        !(
          affix.crafted &&
          base &&
          catalog.modifiers.some(
            (mod) =>
              mod.id === affix.modId &&
              jewelEffectModKind(mod) !== null &&
              isLiquidEmotionMappedMod(catalog, base, mod.id),
          )
        ) &&
        affix.lines.some((line) =>
          /quality|modifier magnitudes|effect of (?:prefix|suffix)/i.test(line),
        ),
    )
  )
    return '此装备另有尚未核对的品质或词缀增效规则。'
  return null
}
