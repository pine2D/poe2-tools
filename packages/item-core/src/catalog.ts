import type { AlloyCatalog } from './alloys'
import type { FluxCatalog } from './fluxes'
import { isBasicJewel, isRadiusJewel } from './jewels'
import type { RuneforgingCatalog } from './runeforgingCatalog'

/** 制作目录仅提供生成资格；概率数据必须单独建立来源。 */
export interface CatalogBase {
  id: string
  name: string
  type: string
  tags: string[]
  requirements: Record<string, number>
  properties: Record<string, number>
  implicit: string | null
  implicitTags: string[][]
  sourceQuality: number | null
  socketLimit: number | null
  hidden: boolean
  runeforged: boolean
  subType?: string
  variantList?: string[]
  grantedSkillsHaveNoReservation?: boolean
  charmLimit?: number
  spirit?: number
  flask?: Record<string, number>
  charm?: { duration: number; chargesUsed: number; chargesMax: number; buff: string[] }
  variant?: {
    visibility: 'visible' | 'hidden' | 'mixed'
    declarations: { sourcePath: string; index: number; hidden: boolean }[]
  }
}

export interface CatalogModifierData {
  id: string
  name: string
  group: string
  level: number
  lines: string[]
  statOrder: number[]
  tags: string[]
  addsTags: string[]
  eligibility: { tag: string; value: 0 | 1 }[]
  tradeHashes: Record<string, string[]>
}

export interface CatalogMod extends CatalogModifierData {
  jewelOnly?: true
  radiusJewelOnly?: true
  craftedOnly?: true
  desecratedOnly?: true
  kind: 'prefix' | 'suffix'
}

/** 独立腐化层；特殊腐化的空资格不等于普通瓦尔可选。 */
export interface CatalogCorruption extends CatalogModifierData {
  kind: 'corrupted' | 'special-corrupted'
}

/** 来源类别映射不等于可执行规则；tierLevel 尚不用于任何等级门槛。 */
export interface CatalogEssence {
  id: string
  name: string
  type: string
  tierLevel: number
  mods: Record<string, string>
}

export type CatalogLiquidEmotionJewel = 'Ruby' | 'Sapphire' | 'Emerald' | 'Diamond'

/** 材料映射只保存来源声明，不代表对应珠宝制作当前可执行。 */
export interface CatalogLiquidEmotion {
  id: string
  name: string
  radiusJewel: boolean
  /** 来源分层，不是装备物等门槛。 */
  tierLevel: number
  mods: Record<
    CatalogLiquidEmotionJewel,
    {
      prefix?: string
      suffix?: string
    }
  >
}

/** 来源名称和类别组成项目身份；所有限制仅保留声明，不推断缺省含义。 */
export interface CatalogAugment {
  id: string
  name: string
  category: string
  type: 'Rune' | 'SoulCore' | 'Idol' | 'AbyssalEye' | 'CongealedMist'
  localMod: boolean
  /** 仅有 Bonded 的来源类别没有普通效果，lines 和 statOrder 均为空数组。 */
  lines: string[]
  statOrder: number[]
  tradeHashes: Record<string, string[]>
  levelReq: number
  limit?: number
  limitId?: string
  isSocketBound?: boolean
  canSocketInChakraSlots?: boolean
  canSocketInUniqueItems?: boolean
  canSocketInJewellery?: boolean
  canSocketInCorruptedSanctified?: boolean
  bonded?: { lines: string[]; statOrder: number[] }
}

export interface CraftCatalog {
  /** 运行时独立接入的 gray 关系，不属于 primary 生成文件。 */
  runeforging?: RuneforgingCatalog
  alloys?: AlloyCatalog
  fluxes?: FluxCatalog
  _meta: {
    schemaVersion: 2
    tier: 'primary'
    sourceCommit: string
    gameVersion: string | null
    generatedAt: string
    weightStatus: 'unknown'
    sources: { path: string; url: string; sha256: string }[]
    /** 名称源独立于固定 PoB 提交；静态响应未声明游戏版本。 */
    nameSources?: {
      locale: 'en' | 'zh-CN' | 'zh-TW'
      url: string
      sha256: string
      fetchedAt: string
      gameVersion: null
    }[]
    excludedDesecratedMods?: { id: string; reason: string }[]
    excludedJewelMods?: { id: string; reason: string }[]
    excludedBases: { id: string; reason: string }[]
  }
  bases: CatalogBase[]
  modifiers: CatalogMod[]
  corruptions?: CatalogCorruption[]
  augments?: CatalogAugment[]
  essences?: CatalogEssence[]
  liquidEmotions?: CatalogLiquidEmotion[]
  localizedNames?: { 'zh-CN': Record<string, string>; 'zh-TW': Record<string, string> }
  /** 按完整目录行保存，每项对应一个数字（含固定条件）；缺行不推断可缩放。 */
  scalability?: Record<string, CatalogStatScalar[]>
}

export interface CatalogStatScalar {
  scalable: boolean
  formats: string[]
}

export function searchBases(
  bases: readonly CatalogBase[],
  query: string,
  translations: Record<string, string>,
  limit = 40,
): CatalogBase[] {
  const needle = query.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(Boolean)
  const normalized = (base: CatalogBase) => [
    base.name.toLowerCase(),
    (translations[base.name] ?? '').toLowerCase(),
  ]
  const score = (base: CatalogBase) => (normalized(base).some((name) => name === needle) ? 0 : 1)
  return bases
    .filter(
      (base) =>
        !base.hidden &&
        words.every((word) =>
          `${base.name} ${translations[base.name] ?? ''} ${base.type}`.toLowerCase().includes(word),
        ),
    )
    .sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id, 'en'))
    .slice(0, Math.max(0, limit))
}

export interface PoolEntry {
  mod: CatalogMod
  reasons: ('level' | 'conflict')[]
}

/** Genesis Tree 专属生成上下文不是基底的普通制作资格；保留源规则首匹配顺序。 */
export function hasCraftModEligibility(
  base: CatalogBase,
  mod: CatalogMod,
  addedTags: readonly string[] = [],
): boolean {
  if (mod.craftedOnly) return false
  // 珠宝与装备采用不同来源域，动态标签不能跨域注入候选。
  if ((base.type === 'Jewel') !== (mod.jewelOnly === true)) return false
  if (base.type === 'Jewel' && !(mod.radiusJewelOnly ? isRadiusJewel(base) : isBasicJewel(base)))
    return false
  // 每次只判断一条词缀；直接查询短标签数组，避免遍历目录时重复分配 Set。
  return (
    mod.eligibility.find(
      (rule) =>
        rule.tag !== 'genesis_tree_caster' &&
        rule.tag !== 'genesis_tree_minion' &&
        (base.tags.includes(rule.tag) || addedTags.includes(rule.tag)),
    )?.value === 1
  )
}

/** 已有 Genesis 身份只认首饰基底自身的源标签，不接受动态生成标签注入。 */
export function hasGenesisModEligibility(base: CatalogBase, mod: CatalogMod): boolean {
  if (mod.craftedOnly || mod.desecratedOnly || !['Ring', 'Belt'].includes(base.type)) return false
  const rule = mod.eligibility.find((entry) => base.tags.includes(entry.tag))
  return (
    rule?.value === 1 && (rule.tag === 'genesis_tree_caster' || rule.tag === 'genesis_tree_minion')
  )
}

/** 已有身份不等同于普通操作可以重新生成。亵渎来源仍须单独使用生成资格。 */
export function hasExistingModEligibility(base: CatalogBase, mod: CatalogMod): boolean {
  if (mod.craftedOnly) return false
  return hasCraftModEligibility(base, mod) || hasGenesisModEligibility(base, mod)
}

export function inspectModPool(
  base: CatalogBase,
  modifiers: readonly CatalogMod[],
  itemLevel: number,
  occupiedGroups: readonly string[] = [],
  addedTags: readonly string[] = [],
  source: 'ordinary' | 'desecrated' = 'ordinary',
): PoolEntry[] {
  if (!Number.isInteger(itemLevel) || itemLevel < 1 || itemLevel > 100)
    throw new Error('物品等级必须是 1–100 的整数')
  const groups = new Set(occupiedGroups)
  return modifiers.flatMap((mod) => {
    if (source === 'ordinary' && mod.desecratedOnly) return []
    // 顺序属于源规则：default 也可出现在中间，不能排序或把拒绝项提前。
    if (!hasCraftModEligibility(base, mod, addedTags)) return []
    const reasons: PoolEntry['reasons'] = []
    if (mod.level > itemLevel) reasons.push('level')
    if (groups.has(mod.group)) reasons.push('conflict')
    return [{ mod, reasons }]
  })
}
