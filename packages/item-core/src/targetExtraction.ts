import { type CraftAffixSelector, resolveCraftAffix } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { validateCraftFractureTarget } from './fractureTargets'
import { readNumericValues } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { type CraftTargetValues, validateCraftTargets, validateCraftTargetValues } from './targets'

export interface ExtractedCraftTargets {
  targetModIds: string[]
  targetValues: CraftTargetValues[]
  targetFracturedModId?: string
}

/** 从已核对的当前装备提取目标；精确值不推断属性的优劣方向。 */
export function extractCraftTargets(
  catalog: CraftCatalog,
  state: CraftState,
  selections: readonly (string | CraftAffixSelector)[],
  copyValues: boolean,
  copyFracture: boolean,
): CraftResult<ExtractedCraftTargets> {
  const checkedState = createCraftState(catalog, state)
  if (!checkedState.ok) return checkedState
  if (!Array.isArray(selections) || selections.length > 6)
    return { ok: false, error: '请选择至多六组当前装备上的词缀。' }
  const affixes: CraftState['affixes'] = []
  for (const selection of selections) {
    const selector = typeof selection === 'string' ? { modId: selection } : selection
    if (
      selector === null ||
      typeof selector !== 'object' ||
      Array.isArray(selector) ||
      Object.keys(selector).some((key) => key !== 'modId' && key !== 'affixId')
    )
      return { ok: false, error: '词缀选择只能包含类型 ID 与实例 ID。' }
    const resolved = resolveCraftAffix(checkedState.value, selector)
    if (!resolved.ok) return resolved
    affixes.push(resolved.value.affix)
  }
  const ids = affixes.map((affix) => affix.modId)
  const checkedIds = validateCraftTargets(catalog, checkedState.value.baseId, ids)
  if (!checkedIds.ok) return checkedIds
  if (ids.length === 0) return { ok: false, error: '请至少选择一组当前装备上的词缀。' }
  const values: CraftTargetValues[] = []
  let fractured: string | undefined
  for (const affix of affixes) {
    const id = affix.modId
    const mod = catalog.modifiers.find((entry) => entry.id === id)
    if (!mod) return { ok: false, error: `当前装备没有词缀 ${id}。` }
    if (copyValues) {
      const rolls = readNumericValues(mod.lines, affix.lines)
      if (!rolls.ok || rolls.value.some((value) => value === null))
        return { ok: false, error: `${id} 缺少可核对的实际基础数值；可关闭精确数值，只提取档位。` }
      if (rolls.value.length > 0)
        values.push({
          modId: id,
          bounds: rolls.value.map((value, index) => ({
            index,
            min: value as number,
            max: value as number,
          })),
        })
    }
    if (copyFracture && affix.fractured) fractured = id
  }
  const checkedValues = validateCraftTargetValues(catalog, state.baseId, ids, values)
  if (!checkedValues.ok) return checkedValues
  if (fractured !== undefined) {
    const checked = validateCraftFractureTarget(catalog, ids, [], fractured)
    if (!checked.ok) return checked
  }
  return {
    ok: true,
    value: {
      targetModIds: checkedIds.value,
      targetValues: checkedValues.value,
      ...(fractured === undefined ? {} : { targetFracturedModId: fractured }),
    },
  }
}
