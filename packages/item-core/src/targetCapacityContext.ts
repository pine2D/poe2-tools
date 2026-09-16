import type { CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import { type CraftState, createCraftState } from './rehearsal'
import { serleCapacity } from './serleRune'
import { validateStoredTargetDefinitions } from './targetDefinitions'

/** 只选择一件真实历史装备；不同时间点的孔位与容量绝不合并。 */
export function findTargetCapacityContext(
  catalog: CraftCatalog,
  states: readonly CraftState[],
  definitions: unknown,
): CraftState | undefined {
  const candidates: { state: CraftState; score: number; fits: boolean }[] = []
  for (const state of states) {
    if (state.destroyed) continue
    const crafted = craftedModifierCapacity(catalog, state)
    const suffix = serleCapacity(catalog, state)
    if (!crafted.ok || !suffix.ok || (crafted.value === 1 && suffix.value === 0)) continue
    const checked = createCraftState(catalog, state)
    if (!checked.ok) continue
    candidates.push({
      state: checked.value,
      // 同时具备两种容量优先；仅双工艺时也保留实际工艺占用所需的来源。
      score: (crafted.value - 1) * 2 + suffix.value,
      fits: validateStoredTargetDefinitions(catalog, state.baseId, definitions, checked.value).ok,
    })
  }
  const fitting = candidates.filter((candidate) => candidate.fits)
  return (fitting.length ? fitting : candidates).sort((a, b) => a.score - b.score).at(-1)?.state
}
