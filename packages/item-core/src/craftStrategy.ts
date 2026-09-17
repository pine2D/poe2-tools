import { craftAffixSpace } from './affixCapacity'
import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import type { CraftImplicitTargetValues } from './implicitTargets'
import { type CraftProperty, readCraftProperty } from './itemProperties'
import { readCraftGrantedSkillLevel } from './perfectFlux'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import {
  type CraftStrategyAction,
  type CraftStrategyWorkAction,
  checkCraftStrategyAction,
  readCraftStrategyAction,
} from './strategyActions'
import { readWeightedProperties } from './weightedProperties'

export type { CraftStrategyAction, CraftStrategyWorkAction } from './strategyActions'

import {
  analyzeCraftTargets,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
} from './targets'

export type { CraftStrategyCondition, CraftStrategyLeafCondition } from './strategyConditions'

import {
  type CraftStrategyCondition,
  craftStrategyLeaves,
  readStrategyConditions,
} from './strategyConditions'

export interface CraftStrategyRule {
  stageId?: string
  nextStageId?: string
  onBlockedStageId?: string
  conditions: CraftStrategyCondition[]
  action: CraftStrategyAction
}
export interface CraftStrategy {
  flow?: { stages: { id: string; name: string }[]; entryStageId: string }
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
export type CraftStrategyDecision = (
  | {
      kind: 'action'
      ruleIndex: number
      action: CraftStrategyWorkAction
    }
  | { kind: 'stop'; reason: 'step-limit' }
  | { kind: 'stop'; reason: 'rule'; ruleIndex: number }
  | { kind: 'blocked'; message: string; ruleIndex?: number }
  | { kind: 'unmatched' }
) & { route?: { ruleIndex: number; from: string; to: string; blockedReason?: string }[] }

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

/** 只保存条件与动作，派生决策由当前装备和历史重新计算。 */
export function readCraftStrategy(value: unknown): CraftResult<CraftStrategy> {
  try {
    if (!isPlainProjectJSON(value)) return fail('条件指引必须使用可无损保存的普通 JSON 字段。')
  } catch {
    return fail('条件指引结构无效。')
  }
  if (!keys(value, ['maxSteps', 'rules', 'flow']) || !integer(value.maxSteps, 1, 1000))
    return fail('条件指引的步骤上限必须是 1–1000 的整数，且不能包含未知字段。')
  if (!Array.isArray(value.rules) || value.rules.length < 1 || value.rules.length > 12)
    return fail('条件指引需要 1–12 条规则。')
  const rules: CraftStrategyRule[] = []
  let flow: CraftStrategy['flow']
  if (Object.hasOwn(value, 'flow')) {
    const input = value.flow
    if (
      !keys(input, ['stages', 'entryStageId']) ||
      !Array.isArray(input.stages) ||
      input.stages.length < 1 ||
      input.stages.length > 12 ||
      !input.stages.every(
        (stage) =>
          keys(stage, ['id', 'name']) &&
          typeof stage.id === 'string' &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(stage.id) &&
          typeof stage.name === 'string' &&
          stage.name.trim().length > 0 &&
          stage.name.length <= 80,
      ) ||
      new Set(input.stages.map((stage) => stage.id)).size !== input.stages.length ||
      !input.stages.some((stage) => stage.id === input.entryStageId)
    )
      return fail('阶段需要 1–12 个唯一 ID、有效名称及存在的入口阶段。')
    flow = {
      stages: input.stages.map((stage) => ({ id: stage.id, name: stage.name })),
      entryStageId: input.entryStageId as string,
    }
  }
  for (const [index, input] of value.rules.entries()) {
    if (
      !keys(input, ['conditions', 'action', 'stageId', 'nextStageId', 'onBlockedStageId']) ||
      !Array.isArray(input.conditions) ||
      input.conditions.length < 1 ||
      input.conditions.length > 4
    )
      return fail(`规则 ${index + 1} 需要 1–4 个条件，且不能包含未知字段。`)
    const conditions = readStrategyConditions(input.conditions)
    if (!conditions)
      return fail(
        `规则 ${index + 1} 的条件无效：最多 32 个节点、4 层嵌套，每组 1–4 项；顶层叶子类型不能重复。`,
      )
    const action = readCraftStrategyAction(input.action)
    if (!action) return fail(`规则 ${index + 1} 的动作或预兆组合无效。`)
    if (
      flow
        ? !flow.stages.some((stage) => stage.id === input.stageId) ||
          (Object.hasOwn(input, 'nextStageId') &&
            (action.kind === 'stop' ||
              !flow.stages.some((stage) => stage.id === input.nextStageId)))
        : Object.hasOwn(input, 'stageId') || Object.hasOwn(input, 'nextStageId')
    )
      return fail(`规则 ${index + 1} 的阶段归属或下一阶段无效。`)
    if (action.kind === 'jump' && (!flow || typeof input.nextStageId !== 'string'))
      return fail(`规则 ${index + 1} 的纯跳转必须指定已有阶段。`)
    if (
      Object.hasOwn(input, 'onBlockedStageId') &&
      (!flow ||
        action.kind === 'stop' ||
        action.kind === 'jump' ||
        !flow.stages.some((stage) => stage.id === input.onBlockedStageId))
    )
      return fail(`规则 ${index + 1} 的无法执行转向必须属于工作动作并引用已有阶段。`)
    rules.push({
      conditions,
      action,
      ...(flow ? { stageId: input.stageId as string } : {}),
      ...(typeof input.nextStageId === 'string' ? { nextStageId: input.nextStageId } : {}),
      ...(typeof input.onBlockedStageId === 'string'
        ? { onBlockedStageId: input.onBlockedStageId }
        : {}),
    })
  }
  return { ok: true, value: { maxSteps: value.maxSteps, rules, ...(flow ? { flow } : {}) } }
}

export function evaluateCraftStrategy(
  catalog: CraftCatalog,
  state: CraftState,
  strategy: CraftStrategy,
  appliedSteps: number,
  goals: CraftStrategyGoals = {},
  stageId = strategy.flow?.entryStageId,
): CraftResult<CraftStrategyDecision> {
  return evaluateCraftStrategyWithTargets(
    catalog,
    state,
    strategy,
    appliedSteps,
    {
      targetIds: goals.targetModIds ?? [],
      inspect: (current) => {
        const advice = analyzeCraftTargets(
          catalog,
          current,
          goals.targetModIds ?? [],
          goals.targetValues,
          goals.targetAlternatives,
          undefined,
          goals.targetImplicitValues,
          goals.targetFracturedModId,
          goals.minimumTargetCount,
        )
        if (!advice.ok) return advice
        return {
          ok: true,
          value: {
            matchedTargetIds: advice.value.targets
              .filter((target) => target.matched)
              .map((target) => target.modId),
            targetsMet:
              !state.pendingDesecration &&
              (goals.targetModIds?.length ?? 0) + (goals.targetImplicitValues?.length ?? 0) > 0 &&
              craftTargetsSatisfied(
                advice.value,
                goals.minimumTargetCount,
                goals.targetFracturedModId,
              ),
          },
        }
      },
    },
    stageId,
  )
}

/** 包内部计算视图：引用字符串保持调用方身份，控制流不解释为目录类型。 */
export interface StrategyTargetView {
  targetIds: readonly string[]
  missingMessage?: (missing: string[]) => string
  inspect: (
    state: CraftState,
  ) => CraftResult<{ matchedTargetIds: readonly string[]; targetsMet: boolean }>
}

/** 新旧入口分别校验目标引用及计算达成；共享其他条件、动作预检和阶段控制流。 */
export function evaluateCraftStrategyWithTargets(
  catalog: CraftCatalog,
  state: CraftState,
  strategy: CraftStrategy,
  appliedSteps: number,
  targets: StrategyTargetView,
  stageId = strategy.flow?.entryStageId,
): CraftResult<CraftStrategyDecision> {
  const configuration = readCraftStrategy(strategy)
  if (!configuration.ok) return configuration
  if (strategy.flow && !strategy.flow.stages.some((stage) => stage.id === stageId))
    return fail('当前阶段不在流程中。')
  if (!integer(appliedSteps, 0, 1000)) return fail('当前历史步数无效。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const route: NonNullable<CraftStrategyDecision['route']> = []
  const result = (value: CraftStrategyDecision): CraftResult<CraftStrategyDecision> => ({
    ok: true,
    value: route.length ? { ...value, route: [...route] } : value,
  })
  if (appliedSteps >= strategy.maxSteps) return result({ kind: 'stop', reason: 'step-limit' })
  // 失联引用不等于未达成，反向条件也不能利用被删除目标继续加工。
  for (const [ruleIndex, rule] of strategy.rules.entries()) {
    const missing = craftStrategyLeaves(rule.conditions).flatMap((condition) =>
      condition.kind === 'selected-targets'
        ? condition.modIds.filter((id) => !targets.targetIds.includes(id))
        : [],
    )
    if (missing.length)
      return result({
        kind: 'blocked',
        ruleIndex,
        message:
          targets.missingMessage?.(missing) ??
          `规则引用的目标已移除：${missing.join('、')}。请重新加入目标，或编辑该条件。`,
      })
  }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('当前基底不在制作目录中。')
  const space = craftAffixSpace(catalog, state)
  let targetsMet = false
  const matchedTargets = new Set<string>()
  if (
    strategy.rules.some((rule) =>
      craftStrategyLeaves(rule.conditions).some(
        (condition) => condition.kind === 'targets-met' || condition.kind === 'selected-targets',
      ),
    )
  ) {
    const progress = targets.inspect(checked.value)
    if (!progress.ok) return progress
    for (const id of progress.value.matchedTargetIds) matchedTargets.add(id)
    targetsMet = progress.value.targetsMet
  }
  const propertyValues = new Map<CraftProperty, number | null>()
  const matches = (condition: CraftStrategyCondition): boolean | null => {
    if (condition.kind === 'weighted-properties') {
      const result = readWeightedProperties(catalog, checked.value, condition.terms)
      return result.ok
        ? result.value >= condition.min &&
            (condition.max === undefined || result.value <= condition.max)
        : null
    }
    if (condition.kind === 'corruption-state')
      return (
        (checked.value.twiceCorrupted ? 'twice' : checked.value.corrupted ? 'once' : 'none') ===
        condition.value
      )
    if (condition.kind === 'granted-skill-level') {
      const skill = readCraftGrantedSkillLevel(catalog, checked.value)
      const level = skill.ok ? skill.value.level : null
      return level === null
        ? null
        : level >= condition.min && (condition.max === undefined || level <= condition.max)
    }
    if (condition.kind === 'quality') {
      const value =
        condition.source === 'ordinary' ? checked.value.quality : checked.value.catalyst?.quality
      if (value === undefined) return null
      if (condition.catalystId !== undefined && checked.value.catalyst?.id !== condition.catalystId)
        return false
      return value >= condition.min && (condition.max === undefined || value <= condition.max)
    }
    if (condition.kind === 'item-property') {
      if (!propertyValues.has(condition.property)) {
        const result = readCraftProperty(catalog, checked.value, condition.property)
        propertyValues.set(condition.property, result.ok ? result.value : null)
      }
      const value = propertyValues.get(condition.property)
      return value === null || value === undefined
        ? null
        : value >= condition.min && (condition.max === undefined || value <= condition.max)
    }
    if (condition.kind === 'not') {
      const matched = matches(condition.condition)
      return matched === null ? null : !matched
    }
    if (condition.kind === 'all' || condition.kind === 'any') {
      const values = condition.conditions.map(matches)
      if (condition.kind === 'all')
        return values.includes(false) ? false : values.includes(null) ? null : true
      return values.includes(true) ? true : values.includes(null) ? null : false
    }
    if (condition.kind === 'selected-targets')
      return (
        condition.modIds.filter((id) => matchedTargets.has(id)).length >= condition.min ===
        condition.value
      )
    if (condition.kind === 'socket-count' || condition.kind === 'open-sockets') {
      if (state.sockets === undefined) return null
      const count =
        condition.kind === 'socket-count'
          ? state.sockets.length
          : state.sockets.filter((id) => id === null).length
      return count >= condition.min && count <= condition.max
    }
    if (condition.kind === 'desecrated-count') {
      const pending = state.pendingDesecration
      const count =
        condition.source === 'revealed'
          ? state.affixes.filter((affix) => affix.desecrated).length
          : pending?.putrefaction
            ? pending.putrefaction.prefix + pending.putrefaction.suffix
            : Number(Boolean(pending))
      return count >= condition.min && count <= condition.max
    }
    if (condition.kind === 'affix-count') {
      const pending = state.pendingDesecration
      const hidden = pending?.putrefaction
        ? pending.putrefaction.prefix + pending.putrefaction.suffix
        : Number(Boolean(pending))
      return state.affixes.length + hidden >= condition.min
    }
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
    return space[side] >= condition.min
  }
  let currentStage = stageId
  const visited = new Set<string>()
  while (true) {
    if (currentStage) visited.add(currentStage)
    const ruleIndex = strategy.rules.findIndex(
      (rule) =>
        (!strategy.flow || rule.stageId === currentStage) &&
        rule.conditions.every((condition) => matches(condition) === true),
    )
    const rule = strategy.rules[ruleIndex]
    if (!rule) return result({ kind: 'unmatched' })
    if (rule.action.kind === 'stop') return result({ kind: 'stop', reason: 'rule', ruleIndex })
    let destination = rule.nextStageId
    let blockedReason: string | undefined
    if (rule.action.kind !== 'jump') {
      const action = rule.action
      const checkedAction = checkCraftStrategyAction(catalog, checked.value, action)
      if (checkedAction.ok) return result({ kind: 'action', ruleIndex, action })
      if (!rule.onBlockedStageId)
        return result({ kind: 'blocked', ruleIndex, message: checkedAction.error })
      destination = rule.onBlockedStageId
      blockedReason = checkedAction.error
    }
    // 跳转与预检不通过的转向都未消费材料，共用重复阶段检测。
    if (!currentStage || !destination) return fail('转向缺少阶段。')
    route.push({
      ruleIndex,
      from: currentStage,
      to: destination,
      ...(blockedReason ? { blockedReason } : {}),
    })
    if (visited.has(destination))
      return result({
        kind: 'blocked',
        ruleIndex,
        message: '检测到不消耗材料的阶段循环，请修改跳转目的或条件。',
      })
    currentStage = destination
  }
}
