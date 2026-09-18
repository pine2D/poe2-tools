import { appendCraftAffix, resolveCraftAffix } from './affixIdentity'
import { type CatalogMod, type CraftCatalog, inspectModPool } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { isBasicJewel } from './jewels'
import { isVaalJewelAffixChange, type VaalJewelAffixChange } from './jewelVaalAffixRules'
import { craftModsConflict } from './modConflicts'
import { renderNumericLines } from './numeric'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

export { isVaalJewelAffixChange, type VaalJewelAffixChange } from './jewelVaalAffixRules'

function supportedState(catalog: CraftCatalog, state: CraftState): CraftResult<CraftState> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (state.corrupted) return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || !isBasicJewel(base) || state.rarity !== 'rare')
    return { ok: false, error: '瓦尔增删词缀目前仅支持普通稀有珠宝。' }
  if (
    state.pendingDesecration ||
    state.affixes.some((a) => a.fractured || a.crafted || a.desecrated)
  )
    return { ok: false, error: '破裂、工艺及亵渎珠宝的瓦尔增删交互尚未核实。' }
  const counts = { prefix: 0, suffix: 0 }
  for (const affix of state.affixes) {
    const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
    if (!mod || ++counts[mod.kind] > 2)
      return { ok: false, error: '已有超固有容量珠宝的瓦尔增删交互尚未核实。' }
  }
  const corrupted = createCraftState(catalog, { ...checked.value, corrupted: true })
  return corrupted.ok ? checked : corrupted
}

/** 只为单次腐化结果生成普通词缀候选，不改变常规新增容量。 */
export function vaalJewelAffixCandidates(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<CatalogMod[]> {
  const checked = supportedState(catalog, state)
  if (!checked.ok) return checked
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false, error: '珠宝基底不存在。' }
  const existing = state.affixes.flatMap((affix) =>
    catalog.modifiers.filter((mod) => mod.id === affix.modId),
  )
  const candidates = inspectModPool(
    base,
    catalog.modifiers,
    state.itemLevel,
    existing.map((mod) => mod.group),
    existing.flatMap((mod) => mod.addsTags),
  ).flatMap(({ mod, reasons }) => {
    if (reasons.length || existing.some((entry) => craftModsConflict(entry, mod))) return []
    const appended = appendCraftAffix(checked.value, { modId: mod.id, lines: mod.lines })
    return appended.ok && createCraftState(catalog, { ...appended.value, corrupted: true }).ok
      ? [mod]
      : []
  })
  return { ok: true, value: candidates }
}

export function applyVaalJewelAffixChange(
  catalog: CraftCatalog,
  state: CraftState,
  change: VaalJewelAffixChange,
): CraftResult<CraftState> {
  if (!isVaalJewelAffixChange(change)) return { ok: false, error: '瓦尔珠宝增删字段无效。' }
  const checked = supportedState(catalog, state)
  if (!checked.ok) return checked
  if (change.outcome === 'remove') {
    const selected = resolveCraftAffix(checked.value, {
      modId: change.removeModId,
      ...(change.removeAffixId === undefined ? {} : { affixId: change.removeAffixId }),
    })
    if (!selected.ok) return selected
    return createCraftState(catalog, {
      ...checked.value,
      corrupted: true,
      affixes: checked.value.affixes.filter((_, index) => index !== selected.value.index),
    })
  }
  const candidates = vaalJewelAffixCandidates(catalog, checked.value)
  if (!candidates.ok) return candidates
  const mod = candidates.value.find((entry) => entry.id === change.modId)
  if (!mod) return { ok: false, error: '请选择当前可用的瓦尔新增珠宝词缀。' }
  const lines = renderNumericLines(mod.lines, change.values)
  if (!lines.ok) return lines
  const appended = appendCraftAffix(checked.value, { modId: mod.id, lines: lines.value })
  return appended.ok ? createCraftState(catalog, { ...appended.value, corrupted: true }) : appended
}
