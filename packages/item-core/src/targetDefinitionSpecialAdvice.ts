import { type AlloyAdviceStep, analyzeAlloyTargetContext } from './alloyAdvice'
import { analyzeBoneTargetContext, type CraftBoneAdviceStep } from './boneAdvice'
import type { CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { analyzeEssenceTargetContext, type EssenceAdviceStep } from './essenceAdvice'
import {
  analyzeEssencePreparationContext,
  type EssencePreparationAdvice,
  type EssencePreparationRoute,
} from './essencePreparation'
import type { CraftResult, CraftState } from './rehearsal'
import { definitionTargetIdsForMods, targetDefinitionChanges } from './targetDefinitionAdvice'
import { specialTargetContext } from './targetDefinitionSpecialContext'
import {
  type CraftTargetDefinitions,
  projectTargetDefinitions,
  validateTargetDefinitions,
} from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

export interface DefinitionSpecialAdviceProgress {
  targetIds: string[]
  matchedTargetIds: string[]
  gainedTargetIds: string[]
  lostTargetIds: string[]
  atRiskTargetIds: string[]
  /** 原建议中涉及的实际接受档位，不能据此断言独立目标丢失。 */
  affectedModIds: string[]
  atRiskModIds: string[]
}
export interface DefinitionBoneAdviceStep
  extends Omit<CraftBoneAdviceStep, 'lostTargetIds' | 'atRiskTargetIds'>,
    DefinitionSpecialAdviceProgress {}
export interface DefinitionEssenceAdviceStep
  extends Omit<EssenceAdviceStep, 'lostTargetIds' | 'atRiskTargetIds'>,
    DefinitionSpecialAdviceProgress {}
export interface DefinitionAlloyAdviceStep
  extends Omit<
      AlloyAdviceStep,
      'lostTargetIds' | 'atRiskTargetIds' | 'matchedTargetIds' | 'gainedTargetIds'
    >,
    DefinitionSpecialAdviceProgress {}
export interface DefinitionEssencePreparationRoute extends Omit<EssencePreparationRoute, 'final'> {
  final: DefinitionEssenceAdviceStep
  /** 整条路径的真实目标变化；final 单独描述准备完成后的最后一步。 */
  matchedTargetIds: string[]
  gainedTargetIds: string[]
  lostTargetIds: string[]
}
export interface DefinitionEssencePreparationAdvice
  extends Omit<EssencePreparationAdvice, 'routes'> {
  routes: DefinitionEssencePreparationRoute[]
}

function legacyAdviceOptions(legacy: ReturnType<typeof projectTargetDefinitions>) {
  return {
    ...(legacy.minimumTargetCount === undefined
      ? {}
      : { minimumTargetCount: legacy.minimumTargetCount }),
    ...(legacy.targetFracturedModId === undefined
      ? {}
      : { fracturedTargetId: legacy.targetFracturedModId }),
  }
}

type SpecialStep = {
  operation: CraftStep
  lostTargetIds: string[]
  atRiskTargetIds: string[]
}

/** 只对共用引擎已产生的操作回放，不生成或重新搜索候选。 */
function describeStep<T extends SpecialStep>(
  catalog: CraftCatalog,
  before: CraftState,
  definitions: CraftTargetDefinitions,
  step: T,
  modIds: string[],
): CraftResult<T & DefinitionSpecialAdviceProgress> {
  const after = applyCraftStep(catalog, before, step.operation)
  if (!after.ok) return after
  return {
    ok: true,
    value: {
      ...step,
      targetIds: specialTargetContext(catalog, before, definitions).targetIdsForMods(modIds),
      ...targetDefinitionChanges(catalog, before, after.value, definitions),
      affectedModIds: [...step.lostTargetIds],
      atRiskModIds: [...step.atRiskTargetIds],
      atRiskTargetIds: definitionTargetIdsForMods(definitions, step.atRiskTargetIds),
    },
  }
}

function analyzeSteps<T extends SpecialStep>(
  catalog: CraftCatalog,
  state: CraftState,
  input: CraftTargetDefinitions,
  analyze: (legacy: ReturnType<typeof projectTargetDefinitions>) => CraftResult<T[]>,
  targetMods: (step: T) => string[],
  capacityContext?: CraftState,
): CraftResult<(T & DefinitionSpecialAdviceProgress)[]> {
  const checked = validateTargetDefinitions(catalog, state, input, capacityContext)
  if (!checked.ok) return checked
  const result = analyze(projectTargetDefinitions(checked.value))
  if (!result.ok) return result
  const steps: (T & DefinitionSpecialAdviceProgress)[] = []
  for (const step of result.value) {
    const described = describeStep(catalog, state, checked.value, step, targetMods(step))
    if (!described.ok) return described
    steps.push(described.value)
  }
  return { ok: true, value: steps }
}

export function analyzeBoneTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  capacityContext?: CraftState,
): CraftResult<DefinitionBoneAdviceStep[]> {
  return analyzeSteps(
    catalog,
    state,
    definitions,
    (legacy) =>
      analyzeBoneTargetContext(
        catalog,
        state,
        legacy.targetModIds,
        legacy.targetValues,
        legacy.targetAlternatives,
        legacyAdviceOptions(legacy),
        definitions,
      ),
    (step) => step.targetModIds,
    capacityContext,
  )
}

export function analyzeEssenceTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  capacityContext?: CraftState,
): CraftResult<DefinitionEssenceAdviceStep[]> {
  return analyzeSteps(
    catalog,
    state,
    definitions,
    (legacy) =>
      analyzeEssenceTargetContext(
        catalog,
        state,
        legacy.targetModIds,
        legacy.targetValues,
        legacy.targetAlternatives,
        legacyAdviceOptions(legacy),
        definitions,
      ),
    (step) => [step.targetModId],
    capacityContext,
  )
}

export function analyzeAlloyTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  capacityContext?: CraftState,
): CraftResult<DefinitionAlloyAdviceStep[]> {
  return analyzeSteps(
    catalog,
    state,
    definitions,
    (legacy) =>
      analyzeAlloyTargetContext(
        catalog,
        state,
        legacy.targetModIds,
        legacy.targetValues,
        legacy.targetAlternatives,
        legacyAdviceOptions(legacy),
        definitions,
      ),
    (step) => [step.targetModId],
    capacityContext,
  )
}

export function analyzeEssencePreparationDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  capacityContext?: CraftState,
): CraftResult<DefinitionEssencePreparationAdvice> {
  const checked = validateTargetDefinitions(catalog, state, definitions, capacityContext)
  if (!checked.ok) return checked
  const config = checked.value
  const legacy = projectTargetDefinitions(config)
  const result = analyzeEssencePreparationContext(
    catalog,
    state,
    legacy.targetModIds,
    legacy.targetValues,
    legacy.targetAlternatives,
    legacyAdviceOptions(legacy),
    config,
  )
  if (!result.ok) return result
  const initial = evaluateTargetDefinitions(catalog, state, config).matches.map(
    (match) => match.targetId,
  )
  const routes: DefinitionEssencePreparationRoute[] = []
  for (const route of result.value.routes) {
    let current = state
    for (const operation of route.preparations) {
      const next = applyCraftStep(catalog, current, operation)
      if (!next.ok) return next
      current = next.value
    }
    const final = describeStep(catalog, current, config, route.final, [route.final.targetModId])
    if (!final.ok) return final
    // 最终步骤已经求出完整匹配集合，无需为整条路径再次回放。
    routes.push({
      ...route,
      final: final.value,
      matchedTargetIds: final.value.matchedTargetIds,
      gainedTargetIds: final.value.matchedTargetIds.filter((id) => !initial.includes(id)),
      lostTargetIds: initial.filter((id) => !final.value.matchedTargetIds.includes(id)),
    })
  }
  return { ok: true, value: { ...result.value, routes } }
}
