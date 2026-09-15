import type { CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import {
  type CraftStrategy,
  type CraftStrategyDecision,
  type CraftStrategyGoals,
  evaluateCraftStrategy,
  readCraftStrategy,
} from './craftStrategy'
import type { CraftResult, CraftState } from './rehearsal'
import type { CraftStrategyWorkAction } from './strategyActions'

/** 阶段跟随实际操作身份；候选展示、回响重选和草稿都不算动作完成。 */
export function operationMatchesStrategyAction(
  state: CraftState,
  action: CraftStrategyWorkAction,
  step: CraftStep,
): boolean {
  if (action.kind === 'currency')
    return !('kind' in step) && action.currency === step.currency && action.omen === step.omen
  if (!('kind' in step)) return false
  if (action.kind === 'reveal') return step.kind === 'desecration-reveal'
  if (action.kind === 'alloy') return step.kind === 'alloy' && action.alloyId === step.alloyId
  if (action.kind === 'liquid-emotion')
    return step.kind === 'liquid-emotion' && action.emotionId === step.emotionId
  if (action.kind === 'essence')
    return (
      step.kind === 'essence' && action.essenceId === step.essenceId && action.omen === step.omen
    )
  if (action.kind === 'desecrate')
    return (
      step.kind === 'desecrate' &&
      action.boneId === step.boneId &&
      action.directionOmen === step.directionOmen &&
      action.lichOmen === step.lichOmen
    )
  if (action.kind === 'socket')
    return (
      step.kind === 'socket' &&
      action.augmentId === step.augmentId &&
      step.socketIndex ===
        (action.socketIndex === 'first-empty' ? state.sockets?.indexOf(null) : action.socketIndex)
    )
  return step.kind === action.kind
}

export function validStrategyStartStep(
  strategy: CraftStrategy | undefined,
  value: unknown,
  operationCount: number,
): boolean {
  return strategy?.flow
    ? typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= operationCount
    : value === undefined
}

/** states 来自已校验的实际历史，阶段不作为外来派生状态保存。 */
export function strategyStageAt(
  catalog: CraftCatalog,
  states: readonly CraftState[],
  operations: readonly CraftStep[],
  strategy: CraftStrategy,
  startStep: number,
  cursor: number,
  goals: CraftStrategyGoals = {},
): CraftResult<string | undefined> {
  const checked = readCraftStrategy(strategy)
  if (!checked.ok) return checked
  return replayStrategyStages(
    states,
    operations,
    strategy,
    startStep,
    cursor,
    (state, index, stageId) =>
      evaluateCraftStrategy(catalog, state, strategy, index, goals, stageId),
  )
}

/** 包内部阶段回放；策略由入口校验，真实操作与状态不做重建。 */
export function replayStrategyStages(
  states: readonly CraftState[],
  operations: readonly CraftStep[],
  strategy: CraftStrategy,
  startStep: number,
  cursor: number,
  evaluate: (
    state: CraftState,
    index: number,
    stageId: string,
  ) => CraftResult<CraftStrategyDecision>,
): CraftResult<string | undefined> {
  if (!strategy.flow) return { ok: true, value: undefined }
  if (
    !validStrategyStartStep(strategy, startStep, operations.length) ||
    states.length !== operations.length + 1 ||
    operations.length > 1000 ||
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    cursor > operations.length
  )
    return { ok: false, error: '阶段起点或历史游标无效。' }
  let stageId = strategy.flow.entryStageId
  for (let index = startStep; index < cursor; index++) {
    const state = states[index],
      operation = operations[index]
    if (!state || !operation) return { ok: false, error: '阶段回放缺少实际操作。' }
    const result = evaluate(state, index, stageId)
    if (!result.ok) return result
    if (
      result.value.kind === 'action' &&
      operationMatchesStrategyAction(state, result.value.action, operation)
    )
      stageId =
        strategy.rules[result.value.ruleIndex]?.nextStageId ??
        strategy.rules[result.value.ruleIndex]?.stageId ??
        stageId
  }
  return { ok: true, value: stageId }
}
