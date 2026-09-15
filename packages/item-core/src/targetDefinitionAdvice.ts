import type { CraftCatalog } from './catalog'
import type { CraftImplicitTargetValues } from './implicitTargets'
import type { CraftOmen } from './omens'
import { type CraftResult, type CraftState, prepareCraftOperation } from './rehearsal'
import { definitionFluxSourceModIds } from './targetDefinitionRolls'
import { type CraftTargetDefinitions, validateTargetDefinitions } from './targetDefinitions'
import { type CraftTargetDefinitionProgress, evaluateTargetDefinitions } from './targetProgress'
import { analyzeCraftTargetContext, type CraftAdvice, type CraftAdviceStep } from './targets'

export interface CraftDefinitionAdviceStep
  extends Omit<CraftAdviceStep, 'lostTargetIds' | 'rerolledTargetIds'> {
  /** 本步骤分别可选的独立目标；实际候选档位仍见 targetModIds。 */
  targetIds: string[]
  /** 移除或重置准备态造成的达成损失，尚未包含用户随后选择的新增结果。 */
  lostTargetIds: string[]
  /** 已有接受档位被移除或数值失配的说明，不代表独立目标必定丢失。 */
  affectedModIds: string[]
  rerolledTargetIds?: string[]
  rerolledModIds?: string[]
}

export interface CraftDefinitionAdvice extends Omit<CraftAdvice, 'targets' | 'steps'> {
  targets: (CraftAdvice['targets'][number] & { targetId: string })[]
  steps: CraftDefinitionAdviceStep[]
  progress: CraftTargetDefinitionProgress
  pendingDesecration: boolean
}

/** 包内说明投影：调用方先验证定义，同一接受档位可关联多个独立目标。 */
export function definitionTargetIdsForMods(
  definitions: CraftTargetDefinitions,
  modIds: readonly string[],
): string[] {
  const included = new Set(modIds)
  return definitions.targets
    .filter(
      (target) =>
        included.has(target.modId) ||
        definitions.alternatives.some(
          (entry) =>
            entry.targetId === target.targetId && entry.modIds.some((id) => included.has(id)),
        ),
    )
    .map((target) => target.targetId)
}

/** 包内纯计算；不验证或授权新状态，另一实例接替匹配不算目标丢失。 */
export function targetDefinitionChanges(
  catalog: CraftCatalog,
  before: CraftState,
  after: CraftState,
  definitions: CraftTargetDefinitions,
): { matchedTargetIds: string[]; gainedTargetIds: string[]; lostTargetIds: string[] } {
  const previous = evaluateTargetDefinitions(catalog, before, definitions).matches.map(
    (match) => match.targetId,
  )
  const matchedTargetIds = evaluateTargetDefinitions(catalog, after, definitions).matches.map(
    (match) => match.targetId,
  )
  return {
    matchedTargetIds,
    gainedTargetIds: matchedTargetIds.filter((id) => !previous.includes(id)),
    lostTargetIds: previous.filter((id) => !matchedTargetIds.includes(id)),
  }
}

/** 完整定义决定数量与必选破裂，固有条件和待揭示状态独立阻止完成。 */
export function definitionTargetsSatisfied(advice: CraftDefinitionAdvice): boolean {
  return (
    !advice.pendingDesecration &&
    advice.progress.satisfied &&
    (advice.implicitTargets ?? []).every((target) => target.matched)
  )
}

/** 新入口先完整验证定义；共用引擎直接消费独立条件和匹配，实际候选仍遵守制作规则。 */
export function analyzeTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  omen?: CraftOmen,
  implicitValues: readonly CraftImplicitTargetValues[] = [],
): CraftResult<CraftDefinitionAdvice> {
  const checked = validateTargetDefinitions(catalog, state, definitions)
  if (!checked.ok) return checked
  const config = checked.value
  const analyzed = analyzeCraftTargetContext(
    catalog,
    state,
    config.targets.map((target) => target.targetId),
    config.values,
    [],
    omen,
    implicitValues,
    config.fracturedTargetId,
    config.minimumTargetCount,
    config,
  )
  if (!analyzed.ok) return analyzed
  const progress = evaluateTargetDefinitions(catalog, state, config)
  const steps: CraftDefinitionAdviceStep[] = []
  for (const step of analyzed.value.steps) {
    const selector =
      step.removeModId === undefined
        ? undefined
        : {
            modId: step.removeModId,
            ...(step.removeAffixId === undefined ? {} : { affixId: step.removeAffixId }),
          }
    const prepared = prepareCraftOperation(catalog, state, step.currency, selector, step.omen)
    if (!prepared.ok) return prepared
    const { lostTargetIds: affectedModIds, rerolledTargetIds: rerolledModIds, ...rest } = step
    steps.push({
      ...rest,
      targetIds: config.targets
        .filter((target) => {
          if (progress.matches.some((match) => match.targetId === target.targetId)) return false
          const accepted = [
            target.modId,
            ...(config.alternatives.find((entry) => entry.targetId === target.targetId)?.modIds ??
              []),
          ]
          return [...accepted, ...definitionFluxSourceModIds(catalog, state, accepted)].some((id) =>
            step.targetModIds.includes(id),
          )
        })
        .map((target) => target.targetId),
      lostTargetIds: targetDefinitionChanges(catalog, state, prepared.value.state, config)
        .lostTargetIds,
      affectedModIds,
      ...(rerolledModIds === undefined
        ? {}
        : {
            rerolledModIds,
            rerolledTargetIds: definitionTargetIdsForMods(config, rerolledModIds),
          }),
    })
  }
  return {
    ok: true,
    value: {
      ...analyzed.value,
      targets: analyzed.value.targets.map((target, index) => {
        // 共用引擎保留已验证主目标顺序；身份只取自完整定义。
        const definition = config.targets[index] as CraftTargetDefinitions['targets'][number]
        const match = progress.matches.find((entry) => entry.targetId === definition.targetId)
        const { matchedAffixId: _, ...rest } = target
        return {
          ...rest,
          targetId: definition.targetId,
          matched: match !== undefined,
          ...(match?.affixId === undefined ? {} : { matchedAffixId: match.affixId }),
        }
      }),
      steps,
      progress,
      pendingDesecration: state.pendingDesecration !== undefined,
    },
  }
}
