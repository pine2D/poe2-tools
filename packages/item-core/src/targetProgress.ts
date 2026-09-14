import type { CraftCatalog } from './catalog'
import { matchesTargetInterval, projectCraftTargetValues } from './effectiveTargetValues'
import type { CraftState } from './rehearsal'
import type { CraftTargetValues } from './targets'

/** 输入目标和状态已由调用方验证；只计算达成情况，不递归生成下一步建议。 */
export function matchedCraftTargetIds(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  groups: readonly (readonly string[])[],
  values: readonly CraftTargetValues[],
  fracturedTargetId?: string,
): string[] {
  return ids.filter((id, index) =>
    groups[index]?.some((acceptedId) => {
      const affix = state.affixes.find((entry) => entry.modId === acceptedId)
      const mod = catalog.modifiers.find((entry) => entry.id === acceptedId)
      if (!affix || !mod || (id === fracturedTargetId && !affix.fractured)) return false
      const goal = values.find((entry) => entry.modId === acceptedId)
      if (!goal?.bounds.length) return true
      const projection = projectCraftTargetValues(catalog, state, mod, goal, affix.lines)
      const actual = projection.ok ? projection.value.read(affix.lines) : null
      return (
        actual?.ok === true &&
        goal.bounds.every((bound) => matchesTargetInterval(actual.value[bound.index], bound))
      )
    }),
  )
}
