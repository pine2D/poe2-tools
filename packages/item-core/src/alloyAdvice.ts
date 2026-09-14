import { prepareAlloyCraft } from './alloyCraft'
import { inspectCraftAlloys } from './alloys'
import type { CraftCatalog } from './catalog'
import { type AlloyCraftOperation, applyCraftStep } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import type { CraftResult, CraftState } from './rehearsal'
import { sovereignTargetSupport } from './sovereignTargetSupport'
import { matchedCraftTargetIds } from './targetProgress'
import {
  analyzeCraftTargets,
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
export function analyzeAlloyTargets(
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
): CraftResult<AlloyAdviceStep[]> {
  if (
    !catalog.alloys ||
    state.rarity !== 'rare' ||
    state.corrupted ||
    state.pendingDesecration ||
    state.affixes.some((affix) => affix.crafted)
  )
    return { ok: true, value: [] }
  const progress = analyzeCraftTargets(
    catalog,
    state,
    ids,
    values,
    alternatives,
    undefined,
    [],
    options.fracturedTargetId,
    options.minimumTargetCount,
  )
  if (!progress.ok) return progress
  if (craftTargetsSatisfied(progress.value, options.minimumTargetCount, options.fracturedTargetId))
    return { ok: true, value: [] }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false, error: '当前基底不在制作目录中。' }
  const groups = ids.map((id) => [
    id,
    ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? []),
  ])
  const existing = new Set(state.affixes.map((entry) => entry.modId))
  const missing = new Set(groups.filter((group) => !group.some((id) => existing.has(id))).flat())
  const present = groups.flat().filter((id) => existing.has(id))
  const steps: AlloyAdviceStep[] = []
  const support = sovereignTargetSupport(
    catalog,
    state,
    values,
    options.minimumTargetCount !== undefined && options.minimumTargetCount < ids.length,
  )
  const beforeMatched = progress.value.targets
    .filter((target) => target.matched)
    .map((target) => target.modId)
  for (const entry of inspectCraftAlloys(catalog, base)) {
    const supporting = support?.mod.id === entry.mod?.id
    if (!entry.mod || (!missing.has(entry.mod.id) && !supporting)) continue
    const prepared = prepareAlloyCraft(catalog, state, entry.alloy.id)
    if (!prepared.ok) continue
    const numbers = minimumCraftTargetRolls(
      catalog,
      state,
      entry.mod,
      values.find((value) => value.modId === entry.mod?.id),
    )
    const outcomes =
      supporting && support
        ? support.contexts.map((context) => [context.value])
        : numbers === null
          ? []
          : [numbers]
    const removableIds = prepared.value.removableAffixes.map((affix) => affix.modId)
    const atRiskTargetIds = present.filter((id) => removableIds.includes(id))
    for (const removeModId of removableIds) {
      for (const numbers of outcomes) {
        if (options.consumeCandidate && !options.consumeCandidate())
          return { ok: true, value: steps }
        const operation: AlloyCraftOperation = {
          kind: 'alloy',
          alloyId: entry.alloy.id,
          removeModId,
          values: [...numbers],
        }
        const applied = applyCraftStep(catalog, state, operation)
        if (!applied.ok) continue
        const matchedTargetIds = matchedCraftTargetIds(
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
        steps.push({
          operation,
          targetModId: entry.mod.id,
          lostTargetIds: present.filter(
            (id) =>
              id === removeModId ||
              groups.some(
                (group, index) =>
                  group.includes(id) &&
                  beforeMatched.includes(ids[index] ?? '') &&
                  !matchedTargetIds.includes(ids[index] ?? ''),
              ),
          ),
          atRiskTargetIds: [...atRiskTargetIds],
          gainedTargetIds,
          matchedTargetIds,
        })
      }
    }
  }
  steps.sort(
    (a, b) =>
      a.lostTargetIds.length - b.lostTargetIds.length ||
      a.atRiskTargetIds.length - b.atRiskTargetIds.length ||
      b.matchedTargetIds.length - a.matchedTargetIds.length ||
      a.operation.alloyId.localeCompare(b.operation.alloyId, 'en') ||
      a.operation.removeModId.localeCompare(b.operation.removeModId, 'en') ||
      (a.operation.values[0] ?? 0) - (b.operation.values[0] ?? 0),
  )
  return { ok: true, value: steps }
}
