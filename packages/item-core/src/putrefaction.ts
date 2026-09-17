import { influenceBoneError } from './influenceRunes'
export const PUTREFACTION_OMEN_NAME = 'Omen of Putrefaction'

import { craftAffixCapacities, usesJewelCapacity } from './affixCapacity'
import { boneBaseError, type CraftBone, isCraftBone } from './boneRules'
import type { CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import { desecrationSourceHash } from './desecration'
import { isBasicJewel, isRadiusJewel } from './jewels'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

/** 暂只开放有直接依据的固有容量，避免推定增容或特殊工艺组合。 */
export function putrefactionCapacityError(catalog: CraftCatalog, state: CraftState): string | null {
  const influenceError = influenceBoneError(catalog, state, { putrefaction: true })
  if (influenceError) return influenceError
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return '基底不在目录中。'
  const craftedCapacity = craftedModifierCapacity(catalog, state)
  if (!craftedCapacity.ok) return craftedCapacity.error
  if (craftedCapacity.value !== 1) return '腐烂预兆尚未支持特殊工艺容量组合。'
  const capacity = craftAffixCapacities(catalog, state)
  const expected = isBasicJewel(base) ? 2 : 3
  if (
    isRadiusJewel(base) ||
    usesJewelCapacity(catalog, state) ||
    capacity.prefix !== expected ||
    capacity.suffix !== expected
  )
    return '腐烂预兆尚未支持特殊容量或范围珠宝。'
  return null
}

export function preparePutrefaction(
  catalog: CraftCatalog,
  state: CraftState,
  boneId: CraftBone,
): CraftResult<{
  removedAffixes: CraftAffix[]
  retainedAffixes: CraftAffix[]
  slots: { prefix: number; suffix: number }
}> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (!isCraftBone(boneId) || !boneId.startsWith('preserved_'))
    return { ok: false, error: '腐烂预兆目前只支持保存完好的骨骼。' }
  if (
    state.corrupted ||
    state.rarity !== 'rare' ||
    state.pendingDesecration ||
    state.affixes.some((affix) => affix.desecrated)
  )
    return { ok: false, error: '腐烂预兆需要未腐化且没有亵渎属性的稀有装备。' }
  if (desecrationSourceHash(catalog) === null)
    return { ok: false, error: '缺少可信的亵渎来源指纹。' }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false, error: '基底不在目录中。' }
  const error =
    boneBaseError(base, state.itemLevel, boneId) ?? putrefactionCapacityError(catalog, state)
  if (error) return { ok: false, error }
  const retainedAffixes = checked.value.affixes.filter((affix) => affix.fractured)
  const removedAffixes = checked.value.affixes.filter((affix) => !affix.fractured)
  const slots = craftAffixCapacities(catalog, state)
  for (const affix of retainedAffixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod) return { ok: false, error: '破裂属性不在目录中。' }
    slots[mod.kind]--
  }
  return { ok: true, value: { retainedAffixes, removedAffixes, slots } }
}
