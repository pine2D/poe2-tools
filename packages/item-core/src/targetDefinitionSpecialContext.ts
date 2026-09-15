import type { CatalogMod, CraftCatalog } from './catalog'
import type { CraftAffix, CraftState } from './rehearsal'
import { definitionFluxSourceModIds, definitionModRollOptions } from './targetDefinitionRolls'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

/** 包内计算视图；入口先验证完整定义，候选始终按各 tN 的独立条件构造。 */
export function specialTargetContext(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
) {
  const groups = definitions.targets.map((target) => ({
    ...target,
    modIds: [
      target.modId,
      ...(definitions.alternatives.find((entry) => entry.targetId === target.targetId)?.modIds ??
        []),
    ],
  }))
  const progress = evaluateTargetDefinitions(catalog, state, definitions)
  const missingMods = groups
    .filter((group) => progress.unmatchedTargetIds.includes(group.targetId))
    .flatMap((group) => group.modIds)
  const candidateModIds = (modIds: readonly string[]) => [
    ...modIds,
    ...definitionFluxSourceModIds(catalog, state, modIds),
  ]
  const missing = new Set(candidateModIds(missingMods))
  const targetIdsForMods = (modIds: readonly string[]) =>
    groups
      .filter((group) => candidateModIds(group.modIds).some((id) => modIds.includes(id)))
      .map((group) => group.targetId)
  const matched = (next: CraftState) =>
    evaluateTargetDefinitions(catalog, next, definitions).matches.map((match) => match.targetId)
  const previous = progress.matches.map((match) => match.targetId)
  const lost = (next: CraftState) => {
    const current = matched(next)
    return previous.filter((id) => !current.includes(id))
  }
  const rolls = (current: CraftState, mod: CatalogMod, includeDefault = false): number[][] =>
    definitionModRollOptions(catalog, current, definitions, mod, undefined, includeDefault)
  const affected = (next: CraftState) => {
    const lostIds = lost(next)
    return [
      ...new Set(
        state.affixes
          .filter(
            (affix) =>
              groups.some((group) => group.modIds.includes(affix.modId)) &&
              (!next.affixes.some((after) => after.modId === affix.modId) ||
                groups.some(
                  (group) => group.modIds.includes(affix.modId) && lostIds.includes(group.targetId),
                )),
          )
          .map((affix) => affix.modId),
      ),
    ]
  }
  const risk = (removable: readonly CraftAffix[]) => [
    ...new Set(
      removable
        .filter((affix) => groups.some((group) => group.modIds.includes(affix.modId)))
        .map((affix) => affix.modId),
    ),
  ]
  return {
    groups,
    progress,
    missing,
    matched,
    lost,
    rolls,
    affected,
    risk,
    candidateModIds,
    targetIdsForMods,
  }
}
