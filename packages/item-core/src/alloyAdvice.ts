import { prepareAlloyCraft } from './alloyCraft'
import { inspectCraftAlloys } from './alloys'
import type { CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import { type AlloyCraftOperation, applyCraftStep } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import type { CraftResult, CraftState } from './rehearsal'
import { sovereignTargetSupport } from './sovereignTargetSupport'
import { specialTargetContext } from './targetDefinitionSpecialContext'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { lostCraftTargetIds, matchedCraftTargetIds } from './targetProgress'
import {
  analyzeCraftTargetContext,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
} from './targets'

export interface AlloyAdviceStep {
  operation: AlloyCraftOperation
  targetModId: string
  lostTargetIds: string[]
  atRiskTargetIds: string[]
  gainedTargetIds: string[]
  matchedTargetIds: string[]
}

/** 只给已完整回放的指定结果；风险覆盖可移除池，不声称随机成功率。 */
export function analyzeAlloyTargetContext(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: {
    consumeCandidate?: () => boolean
    minimumTargetCount?: number
    fracturedTargetId?: string
    includePreparatory?: boolean
  } = {},
  definitions?: CraftTargetDefinitions,
): CraftResult<AlloyAdviceStep[]> {
  const native = definitions ? specialTargetContext(catalog, state, definitions) : undefined
  if (!catalog.alloys || state.rarity !== 'rare' || state.corrupted || state.pendingDesecration)
    return { ok: true, value: [] }
  const capacity = craftedModifierCapacity(catalog, state)
  if (!capacity.ok) return capacity
  if (state.affixes.filter((affix) => affix.crafted).length >= capacity.value)
    return { ok: true, value: [] }
  const progress = analyzeCraftTargetContext(
    catalog,
    state,
    ids,
    values,
    alternatives,
    undefined,
    [],
    options.fracturedTargetId,
    options.minimumTargetCount,
    definitions,
  )
  if (!progress.ok) return progress
  if (
    native
      ? native.progress.satisfied
      : craftTargetsSatisfied(progress.value, options.minimumTargetCount, options.fracturedTargetId)
  )
    return { ok: true, value: [] }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false, error: '当前基底不在制作目录中。' }
  const groups =
    native?.groups.map((group) => group.modIds) ??
    ids.map((id) => [id, ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? [])])
  const existing = new Set(state.affixes.map((entry) => entry.modId))
  const missing =
    native?.missing ??
    new Set(groups.filter((group) => !group.some((id) => existing.has(id))).flat())
  const present = groups.flat().filter((id) => existing.has(id))
  const steps: AlloyAdviceStep[] = []
  const losses = new Map<AlloyCraftOperation, number>()
  const risks = new Map<AlloyCraftOperation, number>()
  const support = sovereignTargetSupport(
    catalog,
    state,
    values,
    options.minimumTargetCount !== undefined && options.minimumTargetCount < ids.length,
  )
  const beforeMatched =
    native?.progress.matches.map((match) => match.targetId) ??
    progress.value.targets.filter((target) => target.matched).map((target) => target.modId)
  for (const entry of inspectCraftAlloys(catalog, base)) {
    const supporting = support?.mod.id === entry.mod?.id
    if (!entry.mod || (!missing.has(entry.mod.id) && !supporting)) continue
    const prepared = prepareAlloyCraft(catalog, state, entry.alloy.id)
    if (!prepared.ok) continue
    const numbers = native
      ? null
      : minimumCraftTargetRolls(
          catalog,
          state,
          entry.mod,
          values.find((value) => value.modId === entry.mod?.id),
        )
    const outcomes =
      supporting && support
        ? support.contexts.map((context) => [context.value])
        : native
          ? native.rolls(state, entry.mod)
          : numbers === null
            ? []
            : [numbers]
    const removable = prepared.value.removableAffixes
    const atRiskTargetIds =
      native?.risk(removable) ??
      present.filter((id) => removable.some((affix) => affix.modId === id))
    for (const removed of removable) {
      for (const numbers of outcomes) {
        if (options.consumeCandidate && !options.consumeCandidate())
          return { ok: true, value: steps }
        const operation: AlloyCraftOperation = {
          kind: 'alloy',
          alloyId: entry.alloy.id,
          removeModId: removed.modId,
          ...(removed.affixId === undefined ? {} : { removeAffixId: removed.affixId }),
          values: [...numbers],
        }
        const applied = applyCraftStep(catalog, state, operation)
        if (!applied.ok) continue
        const matchedTargetIds = native
          ? native.matched(applied.value)
          : matchedCraftTargetIds(
              catalog,
              applied.value,
              ids,
              groups,
              values,
              options.fracturedTargetId,
            )
        const gainedTargetIds = matchedTargetIds.filter((id) => !beforeMatched.includes(id))
        if (
          supporting &&
          !missing.has(entry.mod.id) &&
          !options.includePreparatory &&
          !gainedTargetIds.length
        )
          continue
        const lost = new Set(
          native
            ? native.affected(applied.value)
            : lostCraftTargetIds(
                catalog,
                state,
                applied.value,
                ids,
                groups,
                values,
                options.fracturedTargetId,
              ),
        )
        if (native) {
          losses.set(operation, native.lost(applied.value).length)
          risks.set(
            operation,
            native.groups.filter((group) => group.modIds.some((id) => atRiskTargetIds.includes(id)))
              .length,
          )
        }
        steps.push({
          operation,
          targetModId: entry.mod.id,
          lostTargetIds: native ? [...lost] : present.filter((id) => lost.has(id)),
          atRiskTargetIds: [...atRiskTargetIds],
          gainedTargetIds,
          matchedTargetIds,
        })
      }
    }
  }
  steps.sort(
    (a, b) =>
      (losses.get(a.operation) ?? a.lostTargetIds.length) -
        (losses.get(b.operation) ?? b.lostTargetIds.length) ||
      (risks.get(a.operation) ?? a.atRiskTargetIds.length) -
        (risks.get(b.operation) ?? b.atRiskTargetIds.length) ||
      b.matchedTargetIds.length - a.matchedTargetIds.length ||
      a.operation.alloyId.localeCompare(b.operation.alloyId, 'en') ||
      a.operation.removeModId.localeCompare(b.operation.removeModId, 'en') ||
      (a.operation.values[0] ?? 0) - (b.operation.values[0] ?? 0),
  )
  return { ok: true, value: steps }
}

/** 旧入口不接受独立定义，保留原资格与输出合同。 */
export function analyzeAlloyTargets(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: NonNullable<Parameters<typeof analyzeAlloyTargetContext>[5]> = {},
) {
  return analyzeAlloyTargetContext(catalog, state, ids, values, alternatives, options)
}
