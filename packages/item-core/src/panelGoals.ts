import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { readCraftProperty } from './itemProperties'
import type { CraftResult, CraftState } from './rehearsal'
import { type CraftStrategyLeafCondition, readStrategyConditions } from './strategyConditions'
import { readWeightedProperties } from './weightedProperties'

export type CraftPanelGoal = Extract<
  CraftStrategyLeafCondition,
  { kind: 'item-property' | 'weighted-properties' }
>

export interface CraftPanelGoalStatus {
  goal: CraftPanelGoal
  actual: CraftResult<number>
  matched: boolean
}

/** 只比较完全相同的指标；保留加权求和顺序，避免浮点重排改变边界语义。 */
export function craftPanelGoalConflict(goals: readonly CraftPanelGoal[]): string | null {
  const keys = goals.map((goal) =>
    JSON.stringify(
      goal.kind === 'item-property'
        ? [goal.kind, goal.property]
        : [goal.kind, goal.terms.map(({ property, weight }) => [property, weight])],
    ),
  )
  for (const [index, goal] of goals.entries()) {
    for (let previous = 0; previous < index; previous++) {
      const other = goals[previous]
      if (!other || keys[previous] !== keys[index]) continue
      if (goal.min > (other.max ?? Infinity) || other.min > (goal.max ?? Infinity))
        return `面板目标 ${previous + 1} 与面板目标 ${index + 1} 的范围没有交集，无法同时达成；请调整或移除其中一项。`
    }
  }
  return null
}

/** 仅允许既有面板叶子条件；先检查 JSON，再逐项借用条件解析器构造副本。 */
export function readCraftPanelGoals(input: unknown): CraftResult<CraftPanelGoal[]> {
  const fail = (): CraftResult<never> => ({
    ok: false,
    error: '面板目标必须是最多 8 项有效的单项或加权面板条件。',
  })
  try {
    if (!isPlainProjectJSON(input) || !Array.isArray(input) || input.length > 8) return fail()
    const goals: CraftPanelGoal[] = []
    for (const entry of input) {
      const goal = readStrategyConditions([entry])?.[0]
      if (!goal || (goal.kind !== 'item-property' && goal.kind !== 'weighted-properties'))
        return fail()
      goals.push(goal)
    }
    return { ok: true, value: goals }
  } catch {
    return fail()
  }
}

/** 输入目标已经校验；分数只供有限搜索排序，不表示概率或可达性。 */
export function evaluateCraftPanelGoals(
  catalog: CraftCatalog,
  state: CraftState,
  goals: readonly CraftPanelGoal[],
): { statuses: CraftPanelGoalStatus[]; satisfied: boolean; score: number } {
  let score = 0
  const statuses = goals.map((goal): CraftPanelGoalStatus => {
    const actual =
      goal.kind === 'item-property'
        ? readCraftProperty(catalog, state, goal.property)
        : readWeightedProperties(catalog, state, goal.terms)
    const matched =
      actual.ok && actual.value >= goal.min && (goal.max === undefined || actual.value <= goal.max)
    if (matched) score += 1
    else if (actual.ok) {
      const boundary = actual.value < goal.min ? goal.min : (goal.max ?? goal.min)
      const distance = Math.abs(actual.value - boundary)
      score += 1 / (1 + distance / Math.max(1, Math.abs(boundary)))
    }
    return { goal, actual, matched }
  })
  return { statuses, satisfied: statuses.every((status) => status.matched), score }
}
