import type { CraftCatalog } from './catalog'
import { matchesTargetInterval, projectCraftTargetValues } from './effectiveTargetValues'
import type { CraftAffix, CraftState } from './rehearsal'
import type { StatValueBounds } from './statScalability'
import type { CraftTargetValues } from './targets'

export interface CraftTargetInstanceStatus {
  index: number
  affix: CraftAffix
  actual: (StatValueBounds | null)[] | null
  matched: boolean
}

/** 调用方校验目录、目标和状态；同一实例独立满足全部数值及破裂条件。 */
export function inspectCraftTargetInstances(
  catalog: CraftCatalog,
  state: CraftState,
  modId: string,
  goal?: CraftTargetValues,
  fractureRequired = false,
): CraftTargetInstanceStatus[] {
  const mod = catalog.modifiers.find((entry) => entry.id === modId)
  if (!mod) return []
  const bounds = goal?.bounds ?? []
  return state.affixes.flatMap((affix, index) => {
    if (affix.modId !== modId) return []
    const projection = bounds.length
      ? projectCraftTargetValues(catalog, state, mod, goal, affix.lines)
      : null
    const read = projection?.ok ? projection.value.read(affix.lines) : null
    const actual = read?.ok ? read.value : null
    return [
      {
        index,
        affix,
        actual,
        matched:
          (!fractureRequired || affix.fractured === true) &&
          bounds.every((bound) => matchesTargetInterval(actual?.[bound.index], bound)),
      },
    ]
  })
}

/** 保留已有目标身份丢失语义，同时核对移除或增效变化后的真实达成情况。 */
export function lostCraftTargetIds(
  catalog: CraftCatalog,
  before: CraftState,
  after: CraftState,
  ids: readonly string[],
  groups: readonly (readonly string[])[],
  values: readonly CraftTargetValues[],
  fracturedTargetId?: string,
): string[] {
  const accepted = new Set(groups.flat())
  const present = [
    ...new Set(
      before.affixes.filter((affix) => accepted.has(affix.modId)).map((affix) => affix.modId),
    ),
  ]
  const previous = new Set(
    matchedCraftTargetIds(catalog, before, ids, groups, values, fracturedTargetId),
  )
  const next = new Set(
    matchedCraftTargetIds(catalog, after, ids, groups, values, fracturedTargetId),
  )
  return present.filter(
    (modId) =>
      !after.affixes.some((affix) => affix.modId === modId) ||
      ids.some((id, index) => groups[index]?.includes(modId) && previous.has(id) && !next.has(id)),
  )
}

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
    groups[index]?.some((acceptedId) =>
      inspectCraftTargetInstances(
        catalog,
        state,
        acceptedId,
        values.find((entry) => entry.modId === acceptedId),
        id === fracturedTargetId,
      ).some((entry) => entry.matched),
    ),
  )
}
