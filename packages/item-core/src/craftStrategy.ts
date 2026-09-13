import type { CraftCatalog } from './catalog'
import type { CraftImplicitTargetValues } from './implicitTargets'
import { craftAffixLimit } from './jewels'
import { type CraftRarity, type CraftResult, type CraftState, createCraftState } from './rehearsal'
import {
  type CraftStrategyAction,
  type CraftStrategyWorkAction,
  checkCraftStrategyAction,
  readCraftStrategyAction,
} from './strategyActions'

export type { CraftStrategyAction, CraftStrategyWorkAction } from './strategyActions'

import {
  analyzeCraftTargets,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
} from './targets'

export type CraftStrategyCondition =
  | { kind: 'selected-targets'; modIds: string[]; min: number; value: boolean }
  | { kind: 'socket-count' | 'open-sockets'; min: number; max: number }
  | { kind: 'always' }
  | { kind: 'rarity'; value: CraftRarity }
  | { kind: 'targets-met'; value: boolean }
  | { kind: 'open-prefix' | 'open-suffix'; min: number }
  | { kind: 'affix-count'; min: number }
  | { kind: 'desecration-stage'; value: 'none' | 'unrevealed' | 'offered' }
export interface CraftStrategyRule {
  conditions: CraftStrategyCondition[]
  action: CraftStrategyAction
}
export interface CraftStrategy {
  maxSteps: number
  rules: CraftStrategyRule[]
}
export interface CraftStrategyGoals {
  targetModIds?: readonly string[]
  targetValues?: readonly CraftTargetValues[]
  targetAlternatives?: readonly CraftTargetAlternative[]
  targetImplicitValues?: readonly CraftImplicitTargetValues[]
  targetFracturedModId?: string
  minimumTargetCount?: number
}
export type CraftStrategyDecision =
  | {
      kind: 'action'
      ruleIndex: number
      action: CraftStrategyWorkAction
    }
  | { kind: 'stop'; reason: 'step-limit' }
  | { kind: 'stop'; reason: 'rule'; ruleIndex: number }
  | { kind: 'blocked'; message: string; ruleIndex?: number }
  | { kind: 'unmatched' }

function keys(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  )
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function readCondition(value: unknown): CraftStrategyCondition | null {
  if (!keys(value, ['kind', 'value', 'min', 'max', 'modIds'])) return null
  if (
    value.kind === 'selected-targets' &&
    keys(value, ['kind', 'modIds', 'min', 'value']) &&
    Array.isArray(value.modIds) &&
    value.modIds.length >= 1 &&
    value.modIds.length <= 6 &&
    value.modIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 512) &&
    new Set(value.modIds).size === value.modIds.length &&
    integer(value.min, 1, value.modIds.length) &&
    typeof value.value === 'boolean'
  )
    return {
      kind: 'selected-targets',
      modIds: [...value.modIds],
      min: value.min,
      value: value.value,
    }
  if (
    (value.kind === 'socket-count' || value.kind === 'open-sockets') &&
    keys(value, ['kind', 'min', 'max']) &&
    integer(value.min, 0, 3) &&
    integer(value.max, 0, 3) &&
    value.min <= value.max
  )
    return { kind: value.kind, min: value.min, max: value.max }
  if (value.kind === 'affix-count' && keys(value, ['kind', 'min']) && integer(value.min, 0, 6))
    return { kind: 'affix-count', min: value.min }
  if (
    value.kind === 'desecration-stage' &&
    keys(value, ['kind', 'value']) &&
    (value.value === 'none' || value.value === 'unrevealed' || value.value === 'offered')
  )
    return { kind: 'desecration-stage', value: value.value }
  if (value.kind === 'always' && keys(value, ['kind'])) return { kind: 'always' }
  if (
    value.kind === 'rarity' &&
    keys(value, ['kind', 'value']) &&
    (value.value === 'normal' || value.value === 'magic' || value.value === 'rare')
  )
    return { kind: 'rarity', value: value.value }
  if (
    value.kind === 'targets-met' &&
    keys(value, ['kind', 'value']) &&
    typeof value.value === 'boolean'
  )
    return { kind: 'targets-met', value: value.value }
  if (
    (value.kind === 'open-prefix' || value.kind === 'open-suffix') &&
    keys(value, ['kind', 'min']) &&
    integer(value.min, 1, 3)
  )
    return { kind: value.kind, min: value.min }
  return null
}
/** 只保存条件与动作，派生决策由当前装备和历史重新计算。 */
export function readCraftStrategy(value: unknown): CraftResult<CraftStrategy> {
  if (!keys(value, ['maxSteps', 'rules']) || !integer(value.maxSteps, 1, 1000))
    return fail('条件指引的步骤上限必须是 1–1000 的整数，且不能包含未知字段。')
  if (!Array.isArray(value.rules) || value.rules.length < 1 || value.rules.length > 12)
    return fail('条件指引需要 1–12 条规则。')
  const rules: CraftStrategyRule[] = []
  for (const [index, input] of value.rules.entries()) {
    if (
      !keys(input, ['conditions', 'action']) ||
      !Array.isArray(input.conditions) ||
      input.conditions.length < 1 ||
      input.conditions.length > 4
    )
      return fail(`规则 ${index + 1} 需要 1–4 个条件，且不能包含未知字段。`)
    const conditions = input.conditions.map(readCondition)
    if (
      conditions.some((condition) => condition === null) ||
      new Set(conditions.map((condition) => condition?.kind)).size !== conditions.length
    )
      return fail(`规则 ${index + 1} 的条件无效或类型重复。`)
    const action = readCraftStrategyAction(input.action)
    if (!action) return fail(`规则 ${index + 1} 的动作或预兆组合无效。`)
    rules.push({ conditions: conditions as CraftStrategyCondition[], action })
  }
  return { ok: true, value: { maxSteps: value.maxSteps, rules } }
}

export function evaluateCraftStrategy(
  catalog: CraftCatalog,
  state: CraftState,
  strategy: CraftStrategy,
  appliedSteps: number,
  goals: CraftStrategyGoals = {},
): CraftResult<CraftStrategyDecision> {
  const configuration = readCraftStrategy(strategy)
  if (!configuration.ok) return configuration
  if (!integer(appliedSteps, 0, 1000)) return fail('当前历史步数无效。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const result = (value: CraftStrategyDecision): CraftResult<CraftStrategyDecision> => ({
    ok: true,
    value,
  })
  if (appliedSteps >= strategy.maxSteps) return result({ kind: 'stop', reason: 'step-limit' })
  // 失联引用不等于未达成，反向条件也不能利用被删除目标继续加工。
  for (const [ruleIndex, rule] of strategy.rules.entries()) {
    const missing = rule.conditions.flatMap((condition) =>
      condition.kind === 'selected-targets'
        ? condition.modIds.filter((id) => !goals.targetModIds?.includes(id))
        : [],
    )
    if (missing.length)
      return result({
        kind: 'blocked',
        ruleIndex,
        message: `规则引用的目标已移除：${missing.join('、')}。请重新加入目标，或编辑该条件。`,
      })
  }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('当前基底不在制作目录中。')
  const capacity = craftAffixLimit(base, state.rarity)
  const counts = { prefix: 0, suffix: 0 }
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  for (const affix of state.affixes) {
    const kind = mods.get(affix.modId)?.kind
    if (kind) counts[kind]++
  }
  if (state.pendingDesecration) counts[state.pendingDesecration.kind]++
  let targetsMet = false
  const matchedTargets = new Set<string>()
  if (
    strategy.rules.some((rule) =>
      rule.conditions.some(
        (condition) => condition.kind === 'targets-met' || condition.kind === 'selected-targets',
      ),
    )
  ) {
    const advice = analyzeCraftTargets(
      catalog,
      checked.value,
      goals.targetModIds ?? [],
      goals.targetValues,
      goals.targetAlternatives,
      undefined,
      goals.targetImplicitValues,
      goals.targetFracturedModId,
      goals.minimumTargetCount,
    )
    if (!advice.ok) return advice
    for (const target of advice.value.targets) if (target.matched) matchedTargets.add(target.modId)
    targetsMet =
      !state.pendingDesecration &&
      (goals.targetModIds?.length ?? 0) + (goals.targetImplicitValues?.length ?? 0) > 0 &&
      craftTargetsSatisfied(advice.value, goals.minimumTargetCount, goals.targetFracturedModId)
  }
  const matches = (condition: CraftStrategyCondition): boolean => {
    if (condition.kind === 'selected-targets')
      return (
        condition.modIds.filter((id) => matchedTargets.has(id)).length >= condition.min ===
        condition.value
      )
    if (condition.kind === 'socket-count' || condition.kind === 'open-sockets') {
      if (state.sockets === undefined) return false
      const count =
        condition.kind === 'socket-count'
          ? state.sockets.length
          : state.sockets.filter((id) => id === null).length
      return count >= condition.min && count <= condition.max
    }
    if (condition.kind === 'affix-count')
      return state.affixes.length + (state.pendingDesecration ? 1 : 0) >= condition.min
    if (condition.kind === 'desecration-stage')
      return (
        (state.pendingDesecration
          ? state.pendingDesecration.options
            ? 'offered'
            : 'unrevealed'
          : 'none') === condition.value
      )
    if (condition.kind === 'always') return true
    if (condition.kind === 'rarity') return state.rarity === condition.value
    if (condition.kind === 'targets-met') return targetsMet === condition.value
    const side = condition.kind === 'open-prefix' ? 'prefix' : 'suffix'
    return capacity - counts[side] >= condition.min
  }
  const ruleIndex = strategy.rules.findIndex((rule) => rule.conditions.every(matches))
  const rule = strategy.rules[ruleIndex]
  if (!rule) return result({ kind: 'unmatched' })
  if (rule.action.kind === 'stop') return result({ kind: 'stop', reason: 'rule', ruleIndex })
  const action = rule.action
  const checkedAction = checkCraftStrategyAction(catalog, checked.value, action)
  return checkedAction.ok
    ? result({ kind: 'action', ruleIndex, action })
    : result({ kind: 'blocked', ruleIndex, message: checkedAction.error })
}
