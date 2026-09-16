import type { CraftCatalog } from './catalog'
import { analyzeCraftImplicitTargets, type CraftImplicitTargetValues } from './implicitTargets'
import type { CraftResult, CraftState } from './rehearsal'
import { definitionTargetIdsForMods, targetDefinitionChanges } from './targetDefinitionAdvice'
import { type CraftTargetDefinitions, validateTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'
import {
  type CraftTargetRoute,
  type CraftTargetRouteOptions,
  type CraftTargetRouteStep,
  type CraftTargetRoutes,
  planCraftTargetContext,
} from './targetRoutes'

export type CraftDefinitionRouteOptions = Omit<CraftTargetRouteOptions, 'minimumTargetCount'>

export interface CraftDefinitionRouteStep
  extends Omit<
    CraftTargetRouteStep,
    | 'matchedTargetIds'
    | 'gainedTargetIds'
    | 'lostTargetIds'
    | 'atRiskTargetIds'
    | 'rerolledTargetIds'
  > {
  matchedTargetIds: string[]
  gainedTargetIds: string[]
  lostTargetIds: string[]
  atRiskTargetIds: string[]
  rerolledTargetIds: string[]
  affectedModIds: string[]
  atRiskModIds: string[]
  rerolledModIds: string[]
}
export interface CraftDefinitionRoute extends Omit<CraftTargetRoute, 'steps'> {
  steps: CraftDefinitionRouteStep[]
}
export interface CraftDefinitionRoutes extends Omit<CraftTargetRoutes, 'routes'> {
  routes: CraftDefinitionRoute[]
}

/** 有界候选与预算复用旧引擎；新目标变化从各步骤的真实前后状态计算，不重复回放。 */
export function planTargetDefinitionRoutes(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  options: CraftDefinitionRouteOptions = {},
  implicitValues: readonly CraftImplicitTargetValues[] = [],
  capacityContext?: CraftState,
): CraftResult<CraftDefinitionRoutes> {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.hasOwn(options, 'minimumTargetCount')
  )
    return { ok: false, error: '路线配置无效；所需目标数量只能来自完整目标定义。' }
  const checked = validateTargetDefinitions(catalog, state, definitions, capacityContext)
  if (!checked.ok) return checked
  const config = checked.value
  const result = planCraftTargetContext(
    catalog,
    state,
    config.targets.map((target) => target.targetId),
    config.values,
    [],
    {
      ...options,
      ...(config.minimumTargetCount === undefined
        ? {}
        : { minimumTargetCount: config.minimumTargetCount }),
    },
    implicitValues,
    config.fracturedTargetId,
    config,
    capacityContext,
  )
  if (!result.ok) return result
  const completed = (current: CraftState): CraftResult<boolean> => {
    const implicit = analyzeCraftImplicitTargets(catalog, current, implicitValues)
    if (!implicit.ok) return implicit
    return {
      ok: true,
      value:
        current.pendingDesecration === undefined &&
        evaluateTargetDefinitions(catalog, current, config).satisfied &&
        implicit.value.every((target) => target.matched),
    }
  }
  const initial = completed(state)
  if (!initial.ok) return initial
  for (const route of result.value.routes) {
    const final = completed(route.finalState)
    if (!final.ok) return final
    if (!final.value) return { ok: false, error: '候选路线终点未满足独立目标定义。' }
  }
  return {
    ok: true,
    value: {
      ...result.value,
      alreadyMatched: (config.targets.length > 0 || implicitValues.length > 0) && initial.value,
      routes: result.value.routes.map((route) => {
        let before = state
        const steps = route.steps.map((step): CraftDefinitionRouteStep => {
          const {
            lostTargetIds: legacyAffectedModIds,
            affectedModIds = legacyAffectedModIds,
            atRiskTargetIds: atRiskModIds,
            rerolledTargetIds: rerolledModIds,
            ...rest
          } = step
          const changes = targetDefinitionChanges(catalog, before, step.state, config)
          before = step.state
          return {
            ...rest,
            ...changes,
            affectedModIds,
            atRiskModIds,
            rerolledModIds,
            atRiskTargetIds: definitionTargetIdsForMods(config, atRiskModIds),
            rerolledTargetIds: definitionTargetIdsForMods(config, rerolledModIds),
          }
        })
        return { ...route, steps }
      }),
    },
  }
}
