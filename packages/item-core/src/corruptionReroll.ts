import type { CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE, isVaalReplacement, type VaalReplacement } from './corruptionRules'
import { renderNumericLines } from './numeric'
import {
  addCraftAffix,
  type CraftResult,
  type CraftState,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'

function supportedState(catalog: CraftCatalog, state: CraftState): CraftResult<CraftState> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (state.corrupted) return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  if (state.pendingDesecration) return { ok: false, error: '待揭示亵渎的腐化重选尚未支持。' }
  if (!['magic', 'rare'].includes(state.rarity) || state.affixes.length === 0)
    return { ok: false, error: '腐化重选需要至少一组显式词缀的魔法或稀有装备。' }
  if (state.affixes.some((affix) => affix.fractured || affix.crafted || affix.desecrated))
    return { ok: false, error: '破裂、工艺及亵渎词缀的腐化重选交互尚未核实。' }
  // 同其他瓦尔结果核对最终腐化入口，不能先在特殊孔装备上编辑序列。
  const corrupted = createCraftState(catalog, { ...checked.value, corrupted: true })
  return corrupted.ok ? checked : corrupted
}

/** 顺序重选只借用已验证的普通移除、资格与容量逻辑，不引入混沌或预兆消费。 */
export function prepareVaalReplacement(
  catalog: CraftCatalog,
  state: CraftState,
  removeModId: string,
): CraftResult<CraftState> {
  const checked = supportedState(catalog, state)
  if (!checked.ok) return checked
  const prepared = prepareCraftOperation(catalog, checked.value, 'annulment', removeModId)
  return prepared.ok ? { ok: true, value: prepared.value.state } : prepared
}

/** 空列表仅用于编辑器起点；完整瓦尔操作在 isVaalCraftOperation 中要求 1–3 次。 */
export function replayVaalReplacements(
  catalog: CraftCatalog,
  state: CraftState,
  replacements: readonly VaalReplacement[],
): CraftResult<CraftState> {
  const checked = supportedState(catalog, state)
  if (!checked.ok) return checked
  if (
    !Array.isArray(replacements) ||
    replacements.length > 3 ||
    !replacements.every(isVaalReplacement)
  )
    return { ok: false, error: '腐化替换序列无效，最多指定三次。' }
  let current = checked.value
  for (const entry of replacements) {
    const removed = prepareVaalReplacement(catalog, current, entry.removeModId)
    if (!removed.ok) return removed
    const added = addCraftAffix(catalog, removed.value, entry.modId)
    if (!added.ok) return added
    const mod = catalog.modifiers.find((mod) => mod.id === entry.modId)
    if (!mod) return { ok: false, error: '重选词缀不存在。' }
    const rendered = renderNumericLines(mod.lines, entry.values)
    if (!rendered.ok) return rendered
    const next = createCraftState(catalog, {
      ...added.value,
      affixes: added.value.affixes.map((affix) =>
        affix.modId === mod.id ? { ...affix, lines: rendered.value } : affix,
      ),
    })
    if (!next.ok) return next
    current = next.value
  }
  return { ok: true, value: current }
}
