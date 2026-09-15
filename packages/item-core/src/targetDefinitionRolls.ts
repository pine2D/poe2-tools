import type { CatalogMod, CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import type { PreparedFluxCraft } from './fluxCraft'
import { fluxCatalogSignature, inspectFluxes } from './fluxes'
import { type CraftImplicitTargetValues, implicitTargetRolls } from './implicitTargets'
import { type CraftAffix, type CraftState, prepareCraftOperation } from './rehearsal'
import type { CraftTargetDefinitions } from './targetDefinitions'
import type { CraftTargetValues } from './targets'

/** 反解候选逐条尝试同类型目标的条件；每个上下文仍保留其他类型条件，不合并界限。 */
export function targetValueCandidateContexts(
  definitions: CraftTargetDefinitions,
  onOmitted: () => void,
): CraftTargetValues[][] {
  const byMod = new Map<string, CraftTargetValues[]>()
  for (const value of definitions.values)
    byMod.set(value.modId, [...(byMod.get(value.modId) ?? []), value])
  let contexts: CraftTargetValues[][] = [[]]
  for (const values of byMod.values()) {
    const next: CraftTargetValues[][] = []
    for (const context of contexts)
      for (const value of values) {
        if (next.length === 64) {
          onOmitted()
          break
        }
        next.push([...context, value])
      }
    contexts = next
  }
  return contexts
}

export function definitionFluxSourceModIds(
  catalog: CraftCatalog,
  state: CraftState,
  modIds: readonly string[],
): string[] {
  const base = catalog.bases.find((base) => base.id === state.baseId)
  if (
    !base ||
    !catalog.fluxes ||
    state.nextAffixId === undefined ||
    fluxCatalogSignature(catalog) === null
  )
    return []
  return [
    ...new Set(
      inspectFluxes(catalog.fluxes, catalog, base).flatMap((entry) =>
        entry.fromMod && entry.toMod && modIds.includes(entry.toMod.id) ? [entry.fromMod.id] : [],
      ),
    ),
  ]
}

export function definitionModRollOptions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  mod: CatalogMod,
  lines?: readonly string[],
  includeDefault = false,
): number[][] {
  const targets = definitions.targets.filter(
    (target) =>
      target.modId === mod.id ||
      definitions.alternatives.some(
        (alternative) =>
          alternative.targetId === target.targetId && alternative.modIds.includes(mod.id),
      ),
  )
  const goals = targets.map((target) =>
    definitions.values.find(
      (value) => value.targetId === target.targetId && value.modId === mod.id,
    ),
  )
  if (includeDefault || !goals.length) goals.push(undefined)
  const numbers = goals
    .map((goal) => minimumCraftTargetRolls(catalog, state, mod, goal, lines))
    .filter((value): value is number[] => value !== null)
  return numbers.filter(
    (value, index) =>
      numbers.findIndex((other) => JSON.stringify(value) === JSON.stringify(other)) === index,
  )
}

/** 每个真实实例分别尝试其接受目标的条件；搜索统一预算限制组合，不将同类型条件合并。 */
export function* nativeTargetRollOperations(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: CraftTargetDefinitions,
  request:
    | { kind: 'flux'; prepared: PreparedFluxCraft }
    | {
        kind: 'divine'
        implicitValues: readonly CraftImplicitTargetValues[]
        fixed?: { affixIndex: number; values: number[] }
      },
  consume: () => boolean,
): Generator<CraftStep> {
  const entries: { affix: CraftAffix; mod: CatalogMod }[] = []
  if (request.kind === 'flux') {
    for (const change of request.prepared.changes)
      entries.push({ affix: change.affix, mod: change.toMod })
  } else {
    if (!prepareCraftOperation(catalog, state, 'divine').ok) return
    for (const affix of state.affixes) {
      if (affix.fractured) continue
      const mod = catalog.modifiers.find((mod) => mod.id === affix.modId)
      if (!mod) return
      entries.push({ affix, mod })
    }
  }
  const options = entries.map(({ affix, mod }) => {
    if (
      request.kind === 'divine' &&
      request.fixed &&
      state.affixes.indexOf(affix) === request.fixed.affixIndex
    )
      return [request.fixed.values]
    return definitionModRollOptions(
      catalog,
      state,
      definitions,
      mod,
      request.kind === 'divine' ? affix.lines : undefined,
      true,
    )
  })
  const implicit =
    request.kind === 'divine' ? implicitTargetRolls(catalog, state, request.implicitValues) : null
  if (implicit && !implicit.ok) return
  let exhausted = false
  function* choose(
    index: number,
    rolls: { affixId?: string; modId: string; values: number[] }[],
  ): Generator<CraftStep> {
    if (index === entries.length) {
      if (!consume()) {
        exhausted = true
        return
      }
      if (request.kind === 'flux') {
        const identified: { affixId: string; modId: string; values: number[] }[] = []
        for (const roll of rolls) {
          if (roll.affixId === undefined) return
          identified.push({ ...roll, affixId: roll.affixId })
        }
        yield { kind: 'flux', fluxId: request.prepared.flux.id, rolls: identified }
      } else {
        yield {
          currency: 'divine',
          modIds: [],
          rolls,
          ...(implicit?.ok && implicit.value.length ? { implicitValues: implicit.value } : {}),
        }
      }
      return
    }
    const entry = entries[index]
    if (!entry) return
    for (const values of options[index] ?? []) {
      if (exhausted) return
      yield* choose(index + 1, [
        ...rolls,
        {
          modId: entry.mod.id,
          values,
          ...(entry.affix.affixId === undefined ? {} : { affixId: entry.affix.affixId }),
        },
      ])
    }
  }
  yield* choose(0, [])
}
