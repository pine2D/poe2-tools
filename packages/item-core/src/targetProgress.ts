import type { CraftCatalog } from './catalog'
import { matchesTargetInterval, projectCraftTargetValues } from './effectiveTargetValues'
import type { CraftAffix, CraftState } from './rehearsal'
import type { StatValueBounds } from './statScalability'
import { assignCraftTargets } from './targetAssignment'
import type { CraftTargetDefinitions } from './targetDefinitions'
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

/** 已校验目标的计算视图，不包含持久编辑游标。 */
type CraftTargetConditions = Pick<
  CraftTargetDefinitions,
  'targets' | 'alternatives' | 'values' | 'fracturedTargetId' | 'minimumTargetCount'
>

export interface CraftTargetDefinitionProgress {
  matches: { targetId: string; modId: string; affixIndex: number; affixId?: string }[]
  unmatchedTargetIds: string[]
  requiredMatched: boolean
  satisfied: boolean
}

/** 调用方验证状态与目标资格；逐实例建边，一对一分配后判断显式目标达成。 */
export function evaluateTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetConditions,
): CraftTargetDefinitionProgress {
  const candidates = definitions.targets.map((target) => {
    const modIds = [
      target.modId,
      ...(definitions.alternatives.find((entry) => entry.targetId === target.targetId)?.modIds ??
        []),
    ]
    return {
      targetId: target.targetId,
      affixIndexes: modIds.flatMap((modId) =>
        inspectCraftTargetInstances(
          catalog,
          state,
          modId,
          definitions.values.find(
            (entry) => entry.targetId === target.targetId && entry.modId === modId,
          ),
          target.targetId === definitions.fracturedTargetId,
        )
          .filter((entry) => entry.matched)
          .map((entry) => entry.index),
      ),
    }
  })
  const assigned = assignCraftTargets(candidates, definitions.fracturedTargetId)
  const required = definitions.minimumTargetCount ?? definitions.targets.length
  return {
    ...assigned,
    matches: assigned.matches.map((match) => {
      // 边只取自上方当前数组；分配器不创造新索引。
      const affix = state.affixes[match.affixIndex] as CraftAffix
      return {
        ...match,
        modId: affix.modId,
        ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
      }
    }),
    satisfied:
      Number.isInteger(required) &&
      required >= 0 &&
      required <= definitions.targets.length &&
      assigned.matches.length >= required &&
      assigned.requiredMatched,
  }
}

/** 仅本次计算使用的临时适配；持久目标身份必须从完整校验后的工厂初始化。 */
function legacyTargetConditions(
  ids: readonly string[],
  groups: readonly (readonly string[])[],
  values: readonly CraftTargetValues[],
  fracturedTargetId?: string,
): CraftTargetConditions {
  const targets = ids.map((modId, index) => ({ targetId: `t${index + 1}`, modId }))
  const fractured = targets.find((target) => target.modId === fracturedTargetId)
  return {
    targets,
    alternatives: targets.map((target, index) => ({
      targetId: target.targetId,
      modIds: (groups[index] ?? []).filter((id) => id !== target.modId),
    })),
    values: targets.flatMap((target, index) =>
      values
        .filter((entry) => groups[index]?.includes(entry.modId))
        .map((entry) => ({ ...entry, targetId: target.targetId })),
    ),
    ...(fractured === undefined ? {} : { fracturedTargetId: fractured.targetId }),
  }
}

/** 输入目标和状态已由调用方验证；保留旧主类型 ID 与顺序，实际使用一对一分配。 */
export function matchedCraftTargetIds(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  groups: readonly (readonly string[])[],
  values: readonly CraftTargetValues[],
  fracturedTargetId?: string,
): string[] {
  const definitions = legacyTargetConditions(ids, groups, values, fracturedTargetId)
  const progress = evaluateTargetDefinitions(catalog, state, definitions)
  const matched = new Set(progress.matches.map((entry) => entry.targetId))
  return definitions.targets
    .filter((target) => matched.has(target.targetId))
    .map((target) => target.modId)
}
