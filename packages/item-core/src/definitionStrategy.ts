import type { CraftCatalog } from './catalog'
import { equivalentProjectJSON, isPlainProjectJSON } from './craftProjectJSON'
import { applyCraftStep, type CraftStep } from './craftSteps'
import {
  type CraftStrategy,
  type CraftStrategyDecision,
  type CraftStrategyRule,
  evaluateCraftStrategyWithTargets,
  readCraftStrategy,
} from './craftStrategy'
import { analyzeCraftImplicitTargets, type CraftImplicitTargetValues } from './implicitTargets'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { requiresSerleProjectVersion } from './serleProjectVersion'
import { serleCapacity } from './serleRune'
import type { CraftStrategyLeafCondition } from './strategyConditions'
import { replayStrategyStages } from './strategyStages'
import {
  type CraftTargetDefinitions,
  targetNumber,
  validateTargetDefinitions,
} from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

export type DefinitionCraftStrategyLeafCondition =
  | Exclude<CraftStrategyLeafCondition, { kind: 'selected-targets' }>
  | { kind: 'selected-targets'; targetIds: string[]; min: number; value: boolean }
export type DefinitionCraftStrategyCondition =
  | DefinitionCraftStrategyLeafCondition
  | { kind: 'all'; conditions: DefinitionCraftStrategyCondition[] }
  | { kind: 'any'; conditions: DefinitionCraftStrategyCondition[] }
  | { kind: 'not'; condition: DefinitionCraftStrategyCondition }
export interface DefinitionCraftStrategyRule extends Omit<CraftStrategyRule, 'conditions'> {
  conditions: DefinitionCraftStrategyCondition[]
}
export interface DefinitionCraftStrategy extends Omit<CraftStrategy, 'rules'> {
  rules: DefinitionCraftStrategyRule[]
}
export interface DefinitionCraftStrategyGoals {
  definitions: CraftTargetDefinitions
  targetImplicitValues?: readonly CraftImplicitTargetValues[]
}
const fail = (error: string): CraftResult<never> => ({ ok: false, error })

/** 只换引用字段名，原 tN 值原样进入共用语法与控制流；从不投影为 modId。 */
function referenceFields(input: unknown, toInternal: boolean, depth = 0): unknown {
  if (depth > 16 || input === undefined) throw Error('条件指引不能包含缺省值或过深结构。')
  if (Array.isArray(input) && input.length > 32) throw Error('条件指引数组超出结构上限。')
  if (Array.isArray(input))
    return Array.from(input, (entry) => referenceFields(entry, toInternal, depth + 1))
  if (input === null || typeof input !== 'object') return input
  const value = input as Record<string, unknown>
  const selected = value.kind === 'selected-targets'
  const from = toInternal ? 'targetIds' : 'modIds'
  const to = toInternal ? 'modIds' : 'targetIds'
  if (selected && toInternal) {
    if (
      Object.hasOwn(value, to) ||
      !Array.isArray(value[from]) ||
      !value[from].every((id) => targetNumber(id) !== null)
    )
      throw Error('指定目标条件必须使用合法独立 targetIds，不能混入 modIds。')
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      selected && key === from ? to : key,
      referenceFields(entry, toInternal, depth + 1),
    ]),
  )
}

export function readDefinitionCraftStrategy(input: unknown): CraftResult<DefinitionCraftStrategy> {
  try {
    if (!isPlainProjectJSON(input)) return fail('条件指引必须使用可无损保存的普通 JSON 字段。')
    const parsed = readCraftStrategy(referenceFields(input, true))
    return parsed.ok
      ? { ok: true, value: referenceFields(parsed.value, false) as DefinitionCraftStrategy }
      : parsed
  } catch {
    return fail('独立目标条件指引字段、引用或嵌套结构无效。')
  }
}

function readGoals(
  catalog: CraftCatalog,
  state: CraftState,
  input: DefinitionCraftStrategyGoals,
  capacityContext?: CraftState,
) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    (Object.hasOwn(input, 'targetImplicitValues') && !Array.isArray(input.targetImplicitValues)) ||
    Object.entries(input).some(
      ([key, value]) =>
        !['definitions', 'targetImplicitValues'].includes(key) || value === undefined,
    )
  )
    return fail('独立目标指引配置无效，不能混用旧目标字段。')
  const definitions = validateTargetDefinitions(catalog, state, input.definitions, capacityContext)
  if (!definitions.ok) return definitions
  const implicit = analyzeCraftImplicitTargets(catalog, state, input.targetImplicitValues ?? [])
  if (!implicit.ok) return implicit
  return { ok: true as const, value: { definitions: definitions.value, implicit: implicit.value } }
}

/** capacityContext 仅接收调用方已核对历史中的真实状态；当前数值与操作仍使用 state。 */
export function evaluateDefinitionCraftStrategy(
  catalog: CraftCatalog,
  state: CraftState,
  strategy: DefinitionCraftStrategy,
  appliedSteps: number,
  goals: DefinitionCraftStrategyGoals,
  stageId = strategy.flow?.entryStageId,
  capacityContext?: CraftState,
): CraftResult<CraftStrategyDecision> {
  const parsed = readDefinitionCraftStrategy(strategy)
  if (!parsed.ok) return parsed
  const checked = readGoals(catalog, state, goals, capacityContext)
  if (!checked.ok) return checked
  const { definitions, implicit } = checked.value
  return evaluateCraftStrategyWithTargets(
    catalog,
    state,
    referenceFields(parsed.value, true) as CraftStrategy,
    appliedSteps,
    {
      targetIds: definitions.targets.map((target) => target.targetId),
      missingMessage: (ids) =>
        `规则引用的目标已移除：${ids.join('、')}。请编辑该条件，重新选择目标。`,
      inspect: () => {
        const progress = evaluateTargetDefinitions(catalog, state, definitions)
        return {
          ok: true,
          value: {
            matchedTargetIds: progress.matches.map((match) => match.targetId),
            targetsMet:
              !state.pendingDesecration &&
              definitions.targets.length + implicit.length > 0 &&
              progress.satisfied &&
              implicit.every((target) => target.matched),
          },
        }
      },
    },
    stageId,
  )
}

/** 外来未来快照不能授权容量；按实际操作完整重放，并逐态核对。 */
function verifiedSerleHistoryContext(
  catalog: CraftCatalog,
  states: readonly CraftState[],
  operations: readonly CraftStep[],
): CraftResult<CraftState | undefined> {
  if (!states[0] || states.length !== operations.length + 1 || operations.length > 1000)
    return fail('容量来源历史的状态与操作数量不一致。')
  const initial = createCraftState(catalog, states[0])
  if (!initial.ok) return initial
  let current = initial.value
  let capacityContext: CraftState | undefined
  for (let index = 0; index < states.length; index++) {
    if (!equivalentProjectJSON(current, states[index]))
      return fail('容量来源历史与实际制作回放不一致。')
    if (!current.destroyed) {
      const capacity = serleCapacity(catalog, current)
      if (!capacity.ok) return capacity
      if (capacity.value === 1) capacityContext = current
    }
    const operation = operations[index]
    if (operation) {
      const next = applyCraftStep(catalog, current, operation)
      if (!next.ok) return next
      current = next.value
    }
  }
  return { ok: true, value: capacityContext }
}

export function definitionStrategyStageAt(
  catalog: CraftCatalog,
  states: readonly CraftState[],
  operations: readonly CraftStep[],
  strategy: DefinitionCraftStrategy,
  startStep: number,
  cursor: number,
  goals: DefinitionCraftStrategyGoals,
): CraftResult<string | undefined> {
  const parsed = readDefinitionCraftStrategy(strategy)
  if (!parsed.ok) return parsed
  const current = states[cursor]
  if (!current) return fail('阶段回放缺少当前状态。')
  // 已验证历史的摧毁终点沿用紧邻操作前状态；新目标资格不能退回更早的数值上下文。
  const previous = operations[cursor - 1]
  if (
    current.destroyed &&
    (!previous ||
      !('kind' in previous) ||
      (previous.kind !== 'extraction' &&
        (previous.kind !== 'architect' || previous.outcome !== 'destroy')))
  )
    return fail('摧毁终点缺少紧邻的建筑师摧毁或萃取步骤。')
  const context = current.destroyed ? states[cursor - 1] : current
  if (!context) return fail('阶段回放缺少实际操作前状态。')
  let capacityContext: CraftState | undefined
  if (
    goals &&
    requiresSerleProjectVersion(
      { baseId: context.baseId, affixes: goals.definitions?.targets },
      catalog,
    )
  ) {
    const history = verifiedSerleHistoryContext(catalog, states, operations)
    if (!history.ok) return history
    capacityContext = history.value
  }
  const checked = readGoals(catalog, context, goals, capacityContext)
  if (!checked.ok) return checked
  return replayStrategyStages(
    states,
    operations,
    referenceFields(parsed.value, true) as CraftStrategy,
    startStep,
    cursor,
    (state, index, stageId) =>
      evaluateDefinitionCraftStrategy(
        catalog,
        state,
        parsed.value,
        index,
        goals,
        stageId,
        capacityContext,
      ),
  )
}
