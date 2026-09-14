import type { CraftCatalog } from './catalog'
import { craftAffixLimit, isBasicJewel, isRadiusJewel } from './jewels'
import { isLiquidEmotionMappedMod, jewelCapacityModKind } from './liquidEmotions'
import type { CraftState } from './rehearsal'

/** 已有增容状态用于来源与版本门禁；来源损坏也不能绕开门禁。 */
export function usesJewelCapacity(catalog: CraftCatalog, state: CraftState): boolean {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || (!isBasicJewel(base) && !isRadiusJewel(base)) || state.rarity !== 'rare')
    return false
  const counts = { prefix: 0, suffix: 0 }
  for (const affix of state.affixes) {
    if (
      ['CraftedJewelAdditionalPrefixAllowed', 'CraftedJewelAdditionalSuffixAllowed'].includes(
        affix.modId,
      )
    )
      return true
    const kind = catalog.modifiers.find((mod) => mod.id === affix.modId)?.kind
    if (kind && ++counts[kind] > 2) return true
  }
  return false
}

/** 当前新增上限独立于已有状态上限，只接受精确授权且保留 crafted 身份的增容工艺。 */
export function craftAffixCapacities(
  catalog: CraftCatalog,
  state: CraftState,
): { prefix: number; suffix: number } {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { prefix: 0, suffix: 0 }
  const limit = craftAffixLimit(base, state.rarity)
  const capacity = { prefix: limit, suffix: limit }
  if ((!isBasicJewel(base) && !isRadiusJewel(base)) || state.rarity !== 'rare') return capacity
  for (const affix of state.affixes) {
    if (!affix.crafted) continue
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    const kind = mod ? jewelCapacityModKind(mod) : null
    if (kind && isLiquidEmotionMappedMod(catalog, base, affix.modId))
      capacity[kind === 'prefix' ? 'suffix' : 'prefix'] = 3
  }
  return capacity
}

/** 当前可新增组数同时受侧别与总量限制；两侧空位不能重复占用同一全局位置。 */
export function craftAffixSpace(
  catalog: CraftCatalog,
  state: CraftState,
): { prefix: number; suffix: number; total: number } {
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { prefix: 0, suffix: 0, total: 0 }
  const capacity = craftAffixCapacities(catalog, state)
  const counts = { prefix: 0, suffix: 0 }
  for (const affix of state.affixes) {
    const kind = catalog.modifiers.find((mod) => mod.id === affix.modId)?.kind
    if (kind) counts[kind]++
  }
  if (state.pendingDesecration) counts[state.pendingDesecration.kind]++
  const totalLimit =
    (isBasicJewel(base) || isRadiusJewel(base)) && state.rarity === 'rare'
      ? 5
      : capacity.prefix + capacity.suffix
  const remaining = Math.max(0, totalLimit - counts.prefix - counts.suffix)
  const prefix = Math.min(remaining, Math.max(0, capacity.prefix - counts.prefix))
  const suffix = Math.min(remaining, Math.max(0, capacity.suffix - counts.suffix))
  return { prefix, suffix, total: Math.min(remaining, prefix + suffix) }
}
