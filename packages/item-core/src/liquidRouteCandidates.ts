import { isSovereignAffix } from './alloyEffects'
import { resolveCraftImplicitPatterns } from './beltImplicits'
import type { CatalogMod, CraftCatalog } from './catalog'
import type { CraftStep } from './craftSteps'
import {
  matchesTargetInterval,
  minimumCraftTargetRolls,
  projectCraftTargetValues,
} from './effectiveTargetValues'
import { type CraftImplicitTargetValues, implicitTargetRolls } from './implicitTargets'
import { jewelEffectModKind } from './jewelEffectRules'
import { isBasicJewel } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectLiquidEmotions, jewelCapacityModKind } from './liquidEmotions'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen } from './omens'
import {
  type CraftOperation,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
  removableCraftAffixes,
} from './rehearsal'
import { targetRollsPreservingValues } from './targetRolls'
import type { CraftTargetValues } from './targets'

/** 来源限定的辅助候选；普通生成池仍由共享制作引擎决定。 */
export function liquidRouteContext(
  catalog: CraftCatalog,
  initial: CraftState,
  groups: string[][],
  values: readonly CraftTargetValues[],
  onOmitted: () => void = () => {},
) {
  const base = catalog.bases.find((entry) => entry.id === initial.baseId)
  if (!base || !isBasicJewel(base))
    return {
      enabled: false,
      candidates: function* (): Generator<{ operation: CraftStep; atRiskTargetIds: string[] }> {},
      priority: () => 0,
      rolls: (state: CraftState, mod: CatalogMod) =>
        minimumCraftTargetRolls(
          catalog,
          state,
          mod,
          values.find((goal) => goal.modId === mod.id),
        ),
    }
  const inspections = inspectLiquidEmotions(catalog, base).filter((entry) => entry.reason === null)
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const accepted = new Set(groups.flat())
  const goal = (id: string) => values.find((entry) => entry.modId === id)
  const targets = groups.flatMap((group) =>
    group.map((id) => byId.get(id)).filter((mod): mod is CatalogMod => mod !== undefined),
  )
  const needsCapacity = (kind: CatalogMod['kind']) =>
    groups.filter((group) =>
      group.some((id) => byId.get(id)?.kind === kind && !byId.get(id)?.craftedOnly),
    ).length > 2
  const relevant = inspections
    .map((entry) => ({
      ...entry,
      wanted: entry.outcomes.filter(
        (mod) =>
          accepted.has(mod.id) ||
          (jewelCapacityModKind(mod) !== null &&
            needsCapacity(mod.kind === 'prefix' ? 'suffix' : 'prefix')) ||
          (jewelEffectModKind(mod) !== null &&
            targets.some(
              (target) => target.kind !== mod.kind && goal(target.id)?.basis === 'effective',
            )),
      ),
    }))
    .filter((entry) => entry.wanted.length)
  const enabled = relevant.length > 0
  const withEffect = (state: CraftState, mod: CatalogMod, numbers: number[]): CraftState | null => {
    const rendered = renderNumericLines(mod.lines, numbers)
    return rendered.ok
      ? {
          ...state,
          affixes: [
            ...state.affixes.filter((affix) => !affix.crafted),
            { modId: mod.id, lines: rendered.value, crafted: true },
          ],
        }
      : null
  }
  const effectRolls = (mod: CatalogMod): number[][] => {
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok || ranges.value.length !== 1) return []
    const range = ranges.value[0]
    if (!range) return []
    const bounds = goal(mod.id)?.bounds ?? []
    const result: number[][] = []
    for (let value = range.min; value <= range.max; value += range.step)
      if (bounds.every((bound) => matchesTargetInterval({ min: value, max: value }, bound)))
        result.push([value])
    // 没有受影响的有效值条件时，其他掷值只生成等价路线。
    return targets.some(
      (target) => target.kind !== mod.kind && goal(target.id)?.basis === 'effective',
    )
      ? result
      : result.slice(0, 1)
  }
  const futureRollCache = new Map<string, number[] | null>()
  const futureRolls = (state: CraftState, mod: CatalogMod): number[] | null => {
    if (goal(mod.id)?.basis !== 'effective') return null
    const key = JSON.stringify([mod.id, state.catalyst])
    if (futureRollCache.has(key)) return futureRollCache.get(key) ?? null
    for (const entry of relevant)
      for (const effect of entry.wanted.filter(
        (candidate) => jewelEffectModKind(candidate) !== null && candidate.kind !== mod.kind,
      ))
        for (const numbers of effectRolls(effect)) {
          const future = withEffect(state, effect, numbers)
          const result = future && minimumCraftTargetRolls(catalog, future, mod, goal(mod.id))
          if (result) {
            futureRollCache.set(key, result)
            return result
          }
        }
    futureRollCache.set(key, null)
    return null
  }
  const withoutEffect = { ...initial, affixes: initial.affixes.filter((affix) => !affix.crafted) }
  const requiredEffectIds = new Set(
    relevant
      .flatMap((entry) => entry.wanted)
      .filter(
        (effect) =>
          jewelEffectModKind(effect) !== null &&
          (accepted.has(effect.id) ||
            targets.some(
              (target) =>
                target.kind !== effect.kind &&
                goal(target.id)?.basis === 'effective' &&
                minimumCraftTargetRolls(catalog, withoutEffect, target, goal(target.id)) === null,
            )),
      )
      .map((effect) => effect.id),
  )
  const finalEffects = (mod: CatalogMod) =>
    relevant
      .flatMap((entry) => entry.wanted)
      .filter(
        (effect) =>
          requiredEffectIds.has(effect.id) &&
          jewelEffectModKind(effect) !== null &&
          effect.kind !== mod.kind,
      )
  const effectCompatibilityCache = new Map<string, boolean>()
  const compatibleWithFinalEffect = (
    state: CraftState,
    mod: CatalogMod,
    lines: readonly string[],
  ) => {
    const key = JSON.stringify([mod.id, state.catalyst, lines])
    const cached = effectCompatibilityCache.get(key)
    if (cached !== undefined) return cached
    const compatible = finalEffects(mod).some((effect) =>
      effectRolls(effect).some((numbers) => {
        const future = withEffect(state, effect, numbers)
        const projection =
          future && projectCraftTargetValues(catalog, future, mod, goal(mod.id), lines)
        const actual = projection?.ok ? projection.value.read(lines) : null
        return (
          actual?.ok &&
          (goal(mod.id)?.bounds ?? []).every((bound) =>
            matchesTargetInterval(actual.value[bound.index], bound),
          )
        )
      }),
    )
    effectCompatibilityCache.set(key, compatible)
    return compatible
  }
  const rolls = (state: CraftState, mod: CatalogMod): number[] | null => {
    const direct = minimumCraftTargetRolls(catalog, state, mod, goal(mod.id))
    if (direct !== null && goal(mod.id)?.basis === 'effective' && finalEffects(mod).length) {
      const rendered = renderNumericLines(mod.lines, direct)
      if (rendered.ok && !compatibleWithFinalEffect(state, mod, rendered.value))
        return futureRolls(state, mod) ?? direct
    }
    return direct ?? futureRolls(state, mod)
  }
  // 小于一个完整目标的阶段分：数值待增效、增容已就绪、增容已退出和真实牺牲组。
  // 过早安装终结工艺会堵住三同侧准备，降低其优先级，但不禁止用户允许的替换路线。
  const priority = (state: CraftState): number => {
    if (!enabled) return 0
    let score = state.rarity === 'rare' ? 0.04 : state.rarity === 'magic' ? 0.02 : 0
    for (const group of groups) {
      const affix = state.affixes.find((entry) => group.includes(entry.modId))
      const mod = affix && byId.get(affix.modId)
      if (affix && mod && goal(mod.id)?.bounds.length) {
        const projection = projectCraftTargetValues(catalog, state, mod, goal(mod.id), affix.lines)
        const actual = projection.ok ? projection.value.read(affix.lines) : null
        if (
          !actual?.ok ||
          !(goal(mod.id)?.bounds ?? []).every((bound) =>
            matchesTargetInterval(actual.value[bound.index], bound),
          )
        )
          score +=
            goal(mod.id)?.basis === 'effective' &&
            compatibleWithFinalEffect(state, mod, affix.lines)
              ? 0.9
              : 0.5
        else if (goal(mod.id)?.basis === 'effective') {
          // 当前碰巧满足上限但终结工艺必然使其失配，不应压过已准备合法基础值的分支。
          if (finalEffects(mod).length && !compatibleWithFinalEffect(state, mod, affix.lines))
            score -= 0.75
        }
      }
    }
    for (const side of ['prefix', 'suffix'] as const) {
      if (!needsCapacity(side)) continue
      const count = state.affixes.filter(
        (affix) => byId.get(affix.modId)?.kind === side && !affix.crafted,
      ).length
      const capacity = state.affixes.some((affix) => {
        const mod = byId.get(affix.modId)
        return mod && jewelCapacityModKind(mod) !== null && mod.kind !== side
      })
      if (count >= 3) score += capacity ? 0.12 : 0.3
      else if (capacity) score += 0.25
      else if (state.affixes.some((affix) => affix.crafted && accepted.has(affix.modId)))
        score -= 0.85
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
    if (!enabled || state.pendingDesecration) return
    const present = state.affixes
      .filter((affix) => accepted.has(affix.modId) && !affix.fractured)
      .map((affix) => affix.modId)
    for (const entry of relevant) {
      // 风险按材料所有合法结果的移除池求并集，不能只报告所选安全侧。
      const prepared = entry.outcomes.map((mod) =>
        prepareLiquidEmotionCraft(
          catalog,
          state,
          entry.emotion.id,
          entry.outcomes.length > 1 ? mod.kind : undefined,
        ),
      )
      const atRiskTargetIds = present.filter((id) =>
        prepared.some(
          (result) =>
            result.ok && result.value.removableAffixes.some((affix) => affix.modId === id),
        ),
      )
      for (const mod of entry.wanted) {
        const result = prepared[entry.outcomes.indexOf(mod)]
        if (!result?.ok) continue
        const numbers =
          jewelEffectModKind(mod) !== null
            ? effectRolls(mod)
            : [minimumCraftTargetRolls(catalog, state, mod, goal(mod.id))].filter(
                (value): value is number[] => value !== null,
              )
        for (const removed of result.value.removableAffixes.sort(
          (a, b) => Number(accepted.has(a.modId)) - Number(accepted.has(b.modId)),
        ))
          for (const values of numbers)
            yield {
              operation: {
                kind: 'liquid-emotion',
                emotionId: entry.emotion.id,
                ...(entry.outcomes.length > 1 ? { resultKind: mod.kind } : {}),
                removeModId: removed.modId,
                values,
              },
              atRiskTargetIds,
            }
      }
    }
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
          (omen !== undefined && pool.value.length >= plain.value.length) ||
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
              : present.filter((id) => pool.value.some((affix) => affix.modId === id)),
        }
      }
    }
    // 液态至少消耗一组真实词缀；只保留每侧一个不冲突的填充候选，避免全目录排列。
    const currency =
      state.rarity === 'normal' ? 'transmutation' : state.rarity === 'magic' ? 'regal' : 'exalted'
    const prepared = prepareCraftOperation(catalog, state, currency)
    if (!prepared.ok) return
    const pool = craftCandidates(catalog, prepared.value.state, currency)
    // 除当前无解外，精确上限也可能要求提前准备更低基础值。保留普通当前掷值路径，
    // 另列最终工艺的准备值，避免先达成后失配，使逐步重新规划可持续保护已达成目标。
    for (const mod of pool.filter(
      (mod) =>
        accepted.has(mod.id) &&
        goal(mod.id)?.basis === 'effective' &&
        (minimumCraftTargetRolls(catalog, state, mod, goal(mod.id)) === null ||
          finalEffects(mod).length > 0),
    )) {
      const numbers = futureRolls(state, mod)
      if (numbers !== null)
        yield {
          operation: { currency, modIds: [mod.id], rolls: [{ modId: mod.id, values: numbers }] },
          atRiskTargetIds: [],
        }
      const direct = minimumCraftTargetRolls(catalog, state, mod, goal(mod.id))
      if (direct !== null && JSON.stringify(direct) !== JSON.stringify(numbers))
        yield {
          operation: { currency, modIds: [mod.id], rolls: [{ modId: mod.id, values: direct }] },
          atRiskTargetIds: [],
        }
    }
    for (const side of ['prefix', 'suffix'] as const) {
      const fillers = pool.filter(
        (mod) =>
          mod.kind === side &&
          !accepted.has(mod.id) &&
          !targets.some((target) => craftModsConflict(mod, target)),
      )
      if (fillers.length > 1) onOmitted()
      const candidate = fillers[0]
      if (!candidate) continue
      const numbers = minimumCraftTargetRolls(catalog, state, candidate)
      if (numbers !== null)
        yield {
          operation: {
            currency,
            modIds: [candidate.id],
            rolls: numbers.length ? [{ modId: candidate.id, values: numbers }] : [],
          },
          atRiskTargetIds: [],
        }
    }
  }
  return { enabled, candidates, priority, rolls }
}

/** 固定增效值后再反解所有基础值；破裂组只由调用方的最终目标判定检查，绝不重掷。 */
export function* jointEffectDivineOperations(
  catalog: CraftCatalog,
  state: CraftState,
  values: readonly CraftTargetValues[],
  implicitValues: readonly CraftImplicitTargetValues[],
  allowPartial: boolean,
  requiredIds: readonly string[],
): Generator<CraftOperation> {
  if (!values.length && !implicitValues.length) return
  const effectAffix = state.affixes.find(
    (affix) =>
      affix.crafted &&
      (catalog.modifiers.some(
        (mod) => mod.id === affix.modId && jewelEffectModKind(mod) !== null,
      ) ||
        isSovereignAffix(catalog, state, affix, 'resistance')),
  )
  const effect = effectAffix && catalog.modifiers.find((mod) => mod.id === effectAffix.modId)
  if (!effect || !prepareCraftOperation(catalog, state, 'divine').ok) return
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return
  const implicit = resolveCraftImplicitPatterns(base, state)
  if (!implicit.ok) return
  const targeted = implicitValues.length
    ? implicitTargetRolls(catalog, state, implicitValues)
    : null
  const implicitRolls =
    targeted === null
      ? targetRollsPreservingValues(
          implicit.value.patterns,
          state.implicitLines ?? implicit.value.patterns,
        )
      : targeted.ok
        ? targeted.value
        : null
  if (implicitRolls === null) return
  const ranges = inspectNumericLines(effect.lines)
  const range = ranges.ok ? ranges.value[0] : null
  if (!range) return
  for (let value = range.min; value <= range.max; value += range.step) {
    const effectGoal = values.find((entry) => entry.modId === effect.id)
    if (
      effectGoal?.bounds.some(
        (bound) => !matchesTargetInterval({ min: value, max: value }, bound),
      ) &&
      (!allowPartial || requiredIds.includes(effect.id))
    )
      continue
    const rendered = renderNumericLines(effect.lines, [value])
    if (!rendered.ok) continue
    const future = {
      ...state,
      affixes: state.affixes.map((affix) =>
        affix.modId === effect.id ? { ...affix, lines: rendered.value } : affix,
      ),
    }
    const rolls: NonNullable<CraftOperation['rolls']> = [{ modId: effect.id, values: [value] }]
    let valid = true
    for (const affix of future.affixes) {
      if (affix.fractured || affix.modId === effect.id) continue
      const mod = catalog.modifiers.find((entry) => entry.id === affix.modId)
      if (!mod) {
        valid = false
        break
      }
      let numbers = minimumCraftTargetRolls(
        catalog,
        future,
        mod,
        values.find((entry) => entry.modId === mod.id),
        affix.lines,
      )
      if (numbers === null && allowPartial && !requiredIds.includes(mod.id))
        numbers = minimumCraftTargetRolls(catalog, future, mod, undefined, affix.lines)
      if (numbers === null) {
        valid = false
        break
      }
      if (numbers.length) rolls.push({ modId: mod.id, values: numbers })
    }
    if (valid)
      yield {
        currency: 'divine',
        modIds: [],
        rolls,
        ...(implicitRolls.length ? { implicitValues: implicitRolls } : {}),
      }
  }
}
