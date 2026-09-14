import type { CatalogMod, CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import {
  matchesTargetInterval,
  minimumCraftTargetRolls,
  projectCraftTargetValues,
} from './effectiveTargetValues'
import { craftModsConflict } from './modConflicts'
import { CRAFT_OMEN_RULES, type CraftOmen } from './omens'
import {
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
  removableCraftAffixes,
} from './rehearsal'
import { sovereignTargetSupport } from './sovereignTargetSupport'
import type { CraftTargetValues } from './targets'

/** 君王增效的准备候选；只生成真实通货步骤，最终达成由路线完整回放判定。 */
export function sovereignRouteContext(
  catalog: CraftCatalog,
  initial: CraftState,
  groups: string[][],
  values: readonly CraftTargetValues[],
  onOmitted: () => void,
  minimumTargetCount = groups.length,
  fracturedTargetId?: string,
) {
  const available = sovereignTargetSupport(catalog, initial, values, true) !== null
  const accepted = new Set(groups.flat())
  const targets = catalog.modifiers.filter((mod) => accepted.has(mod.id))
  const goal = (id: string) => values.find((entry) => entry.modId === id)
  const satisfied = (state: CraftState, mod: CatalogMod, lines: readonly string[]) => {
    if (!goal(mod.id)?.bounds.length) return true
    const projection = projectCraftTargetValues(catalog, state, mod, goal(mod.id), lines)
    const actual = projection.ok ? projection.value.read(lines) : null
    return (
      actual?.ok === true &&
      goal(mod.id)?.bounds.every((bound) =>
        matchesTargetInterval(actual.value[bound.index], bound),
      ) === true
    )
  }
  const contextCache = new WeakMap<CraftState, { state: CraftState; value: number }[]>()
  const futureContexts = (state: CraftState) => {
    const cached = contextCache.get(state)
    if (cached) return cached
    const support = available ? sovereignTargetSupport(catalog, state, values, true) : null
    const contexts = (support?.contexts ?? []).filter((context) => {
      const possible = groups.map((group) =>
        group.some((id) => {
          const mod = targets.find((entry) => entry.id === id)
          if (!mod) return false
          const affix = context.state.affixes.find((entry) => entry.modId === id)
          if (affix?.fractured || id === support?.mod.id)
            return !!affix && satisfied(context.state, mod, affix.lines)
          return minimumCraftTargetRolls(catalog, context.state, mod, goal(id)) !== null
        }),
      )
      return (
        possible.filter(Boolean).length >= minimumTargetCount &&
        (fracturedTargetId === undefined ||
          possible[groups.findIndex((group) => group[0] === fracturedTargetId)] === true)
      )
    })
    contextCache.set(state, contexts)
    return contexts
  }
  const enabled = available && futureContexts(initial).length > 0
  const futureRolls = (state: CraftState, mod: CatalogMod): number[] | null => {
    if (!enabled || goal(mod.id)?.basis !== 'effective' || !mod.tags.includes('resistance'))
      return null
    for (const context of futureContexts(state)) {
      const numbers = minimumCraftTargetRolls(catalog, context.state, mod, goal(mod.id))
      if (numbers !== null) return numbers
    }
    return null
  }
  const rolls = (state: CraftState, mod: CatalogMod) => {
    const direct = minimumCraftTargetRolls(catalog, state, mod, goal(mod.id))
    const future = futureRolls(state, mod)
    // 某组只能靠终结增效达成时，同批普通目标提前使用共同倍率下的基础值。
    const needsEffect =
      groups.filter((group) =>
        group.some((id) => {
          const target = targets.find((entry) => entry.id === id)
          return target && minimumCraftTargetRolls(catalog, state, target, goal(id)) !== null
        }),
      ).length < minimumTargetCount
    return needsEffect && future !== null ? future : (direct ?? future)
  }
  const priority = (state: CraftState): number => {
    if (!enabled) return 0
    let score = state.rarity === 'rare' ? 0.04 : state.rarity === 'magic' ? 0.02 : 0
    const contexts = futureContexts(state)
    for (const group of groups) {
      const affix = state.affixes.find((entry) => group.includes(entry.modId))
      const mod = affix && targets.find((entry) => entry.id === affix.modId)
      if (!affix || !mod || goal(mod.id)?.basis !== 'effective') continue
      if (!satisfied(state, mod, affix.lines))
        score += contexts.some((context) => satisfied(context.state, mod, affix.lines)) ? 0.9 : 0.2
    }
    if (
      state.rarity === 'rare' &&
      !state.affixes.some((affix) => affix.crafted) &&
      state.affixes.some((affix) => !affix.fractured && !accepted.has(affix.modId))
    )
      score += 0.05
    return score
  }
  function* candidates(
    state: CraftState,
  ): Generator<{ operation: CraftStep; atRiskTargetIds: string[] }> {
    if (!enabled || state.pendingDesecration || state.corrupted) return
    const crafted = state.affixes.find((affix) => affix.crafted)
    if (crafted) {
      const plain = removableCraftAffixes(catalog, state, 'annulment')
      const omens: (CraftOmen | undefined)[] = [
        undefined,
        ...(Object.keys(CRAFT_OMEN_RULES) as CraftOmen[]).filter(
          (omen) => CRAFT_OMEN_RULES[omen].currency === 'annulment',
        ),
      ]
      for (const omen of omens) {
        const pool = removableCraftAffixes(catalog, state, 'annulment', omen)
        if (
          !plain.ok ||
          !pool.ok ||
          (omen && pool.value.length >= plain.value.length) ||
          !pool.value.some((affix) => affix.modId === crafted.modId)
        )
          continue
        yield {
          operation: {
            currency: 'annulment',
            modIds: [],
            removeModId: crafted.modId,
            ...(omen ? { omen } : {}),
          },
          atRiskTargetIds:
            omen === 'light' && pool.value.length === 1
              ? []
              : pool.value.filter((affix) => accepted.has(affix.modId)).map((affix) => affix.modId),
        }
      }
    }
    const currency =
      state.rarity === 'normal' ? 'transmutation' : state.rarity === 'magic' ? 'regal' : 'exalted'
    const prepared = prepareCraftOperation(catalog, state, currency)
    if (!prepared.ok) return
    const pool = craftCandidates(catalog, prepared.value.state, currency)
    for (const mod of pool.filter((mod) => accepted.has(mod.id))) {
      const numbers = futureRolls(state, mod)
      if (numbers !== null)
        yield {
          operation: { currency, modIds: [mod.id], rolls: [{ modId: mod.id, values: numbers }] },
          atRiskTargetIds: [],
        }
    }
    // 只取每侧一组合法牺牲词缀；目录其他候选未穷举，明确记为截断。
    for (const kind of ['prefix', 'suffix'] as const) {
      const fillers = pool.filter(
        (mod) =>
          mod.kind === kind &&
          !accepted.has(mod.id) &&
          !targets.some((target) => craftModsConflict(mod, target)),
      )
      if (fillers.length > 1) onOmitted()
      const mod = fillers[0]
      if (!mod) continue
      const numbers = minimumCraftTargetRolls(catalog, state, mod)
      if (numbers !== null)
        yield {
          operation: {
            currency,
            modIds: [mod.id],
            rolls: numbers.length ? [{ modId: mod.id, values: numbers }] : [],
          },
          atRiskTargetIds: [],
        }
    }
  }
  return { enabled, rolls, priority, candidates }
}
