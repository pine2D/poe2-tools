import type { CraftCatalog } from './catalog'
import { isRadiusJewel } from './jewels'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import type { ItemDocument } from './types'

export type JewelRadius = 'Small' | 'Medium' | 'Large' | 'Very Large'
export const JEWEL_RADIUS_LABELS: Record<JewelRadius, string> = {
  Small: '小',
  Medium: '中',
  Large: '大',
  'Very Large': '超大',
}
// 中文标题为工具接受语法；实际国服高级复制格式仍待样本验收。
export const JEWEL_RADIUS_HEADER = /^(?:Radius|范围|範圍|半径|半徑)\s*[:：]/i
const UPGRADES = [
  { id: 'JewelRadiusMediumSize', size: 'Medium' },
  { id: 'JewelRadiusLargeSize', size: 'Large' },
  { id: 'CraftedJewelRadiusExtraLargeSize', size: 'Very Large' },
] as const

/** 半径仅从当前装备派生，不使用来源原文的旧面板，也不计算树上覆盖。 */
export function estimateJewelRadius(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<JewelRadius | null> {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || !isRadiusJewel(base)) return { ok: true, value: null }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  let size: JewelRadius = 'Small'
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return { ok: false, error: '范围词缀缺少目录对应。' }
    const upgrade = UPGRADES.find((entry) => entry.id === mod.id)
    if (!upgrade && !mod.lines.some((line) => /upgrades radius/i.test(line))) continue
    if (
      !upgrade ||
      size !== 'Small' ||
      mod.kind !== 'prefix' ||
      mod.group !== 'JewelRadiusLargerRadius' ||
      !mod.radiusJewelOnly ||
      (upgrade.size === 'Very Large' && (!mod.craftedOnly || !affix.crafted)) ||
      mod.lines.length !== 1 ||
      mod.lines[0] !== `Upgrades Radius to ${upgrade.size}`
    )
      return { ok: false, error: '半径升级与已核对的范围规则不一致。' }
    size = upgrade.size
  }
  return { ok: true, value: size }
}

export function importedJewelRadiusError(
  catalog: CraftCatalog,
  state: CraftState,
  item: ItemDocument,
): string | null {
  const lines = item.blocks
    .flatMap((block) => block.lines)
    .map((line) => line.raw.trim())
    .filter((line) => JEWEL_RADIUS_HEADER.test(line))
  if (!lines.length) return null
  const radius = estimateJewelRadius(catalog, state)
  if (!radius.ok) return radius.error
  if (radius.value === null) return '非范围珠宝不能包含半径属性。'
  if (lines.length !== 1) return '半径属性重复，需核对完整来源文本。'
  const value = lines[0]
    ?.replace(JEWEL_RADIUS_HEADER, '')
    .trim()
    .replace(/\s*\(augmented\)$/i, '')
    .trim()
  const size = (Object.keys(JEWEL_RADIUS_LABELS) as JewelRadius[]).find(
    (key) => key.toLowerCase() === value?.toLowerCase() || JEWEL_RADIUS_LABELS[key] === value,
  )
  return size === radius.value ? null : '半径属性与当前范围词缀不一致或格式尚未支持。'
}
