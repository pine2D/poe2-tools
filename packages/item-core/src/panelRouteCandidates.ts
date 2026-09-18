import { prepareAlloyCraft } from './alloyCraft'
import { resolveCraftImplicitPatterns } from './beltImplicits'
import type { CatalogMod, CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { essenceResultModIds } from './essenceOutcomes'
import { prepareFluxCraft } from './fluxCraft'
import { FLUXES } from './fluxes'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { prepareMasterworkCraft } from './masterwork'
import { inspectNumericLines } from './numeric'
import { type CraftPanelGoal, evaluateCraftPanelGoals } from './panelGoals'
import {
  addCraftAffix,
  CRAFT_CURRENCY_RULES,
  type CraftAffix,
  type CraftCurrency,
  type CraftOperation,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
  type RemovalCraftCurrency,
  removableCraftAffixes,
} from './rehearsal'
import { prepareRuneforgeCraft } from './runeforge'
import { artificerSocketLimit, socketCandidates } from './sockets'
import { targetRollsPreservingValues } from './targetRolls'

interface NumericInput {
  lines: readonly string[]
  actual?: readonly string[]
}
export interface PanelRouteCandidate {
  operation: CraftStep
  atRiskModIds: string[]
}

/** 只生成步骤；探针和最终应用均由调用方的同一预算约束，绝不维护第二条搜索队列。 */
export function* panelRouteCandidates(
  catalog: CraftCatalog,
  state: CraftState,
  goals: readonly CraftPanelGoal[],
  consume: () => boolean,
  omitted: () => void,
): Generator<PanelRouteCandidate> {
  if (!goals.length) return
  // 未枚举全部预兆组合、材料排列与多维数值；结果始终是有限指定结果示例。
  omitted()
  let exhausted = false
  const spend = () => {
    if (exhausted) return false
    if (!consume()) {
      exhausted = true
      omitted()
      return false
    }
    return true
  }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const properties = goals.flatMap((goal) =>
    goal.kind === 'item-property' ? [goal.property] : goal.terms.map((term) => term.property),
  )
  // 文本只用于有限候选的排序；资格、数值和最终面板一律由已有引擎判断。
  const keywords = properties.map((property) =>
    property.endsWith('Resistance')
      ? /Resistance/i
      : /Dps|attackSpeed|criticalChance|reload/.test(property)
        ? /Damage|Attack Speed|Critical|Reload/i
        : new RegExp(
            property === 'EnergyShield' ? 'Energy Shield' : property === 'Ward' ? 'Ward' : property,
            'i',
          ),
  )
  const relevance = (lines: readonly string[]) =>
    keywords.reduce((score, pattern) => score + Number(lines.some((line) => pattern.test(line))), 0)
  const limit = <T>(entries: T[], count: number): T[] => {
    if (entries.length > count) omitted()
    return entries.slice(0, count)
  }
  const rankedMods = (mods: CatalogMod[]) => {
    const sorted = [...mods].sort(
      (a, b) =>
        relevance(b.lines) - relevance(a.lines) || b.level - a.level || a.id.localeCompare(b.id),
    )
    // 先覆盖不同组，再补较低档，避免同组的多个档位挤掉另一项面板所需的属性。
    const seen = new Set<string>()
    const first: CatalogMod[] = [],
      rest: CatalogMod[] = []
    for (const mod of sorted) {
      if (seen.has(mod.group)) rest.push(mod)
      else {
        seen.add(mod.group)
        first.push(mod)
      }
    }
    return limit([...first, ...rest], 12)
  }
  const remove = (affix: CraftAffix | undefined) => ({
    removeModId: affix?.modId ?? '',
    ...(affix?.affixId === undefined ? {} : { removeAffixId: affix.affixId }),
  })
  function* numeric(
    inputs: NumericInput[],
    build: (values: number[][]) => CraftStep,
    atRiskModIds: string[] = [],
  ): Generator<PanelRouteCandidate> {
    const parsed = inputs.map((input) => inspectNumericLines(input.lines))
    if (parsed.some((entry) => !entry.ok)) {
      omitted()
      return
    }
    const lengths = parsed.map((entry) => (entry.ok ? entry.value.length : 0))
    const ranges = parsed.flatMap((entry) => (entry.ok ? entry.value : []))
    const unpack = (values: number[]) => {
      let offset = 0
      return lengths.map((length) => {
        const result = values.slice(offset, offset + length)
        offset += length
        return result
      })
    }
    const low = ranges.map((range) => range.min),
      high = ranges.map((range) => range.max)
    const current = inputs.flatMap(
      (input) => targetRollsPreservingValues(input.lines, input.actual ?? input.lines) ?? [],
    )
    if (!ranges.length) {
      yield { operation: build(unpack([])), atRiskModIds }
      return
    }
    // 多维组合及连续显示网格只抽样，不把有界示例宣称为精确可达性证明。
    if (ranges.some((range) => range.min !== range.max)) omitted()
    const tested = new Map<string, ReturnType<typeof evaluateCraftPanelGoals> | null>()
    const operations = new Map<string, CraftStep>()
    const probe = (values: number[]) => {
      const key = JSON.stringify(values)
      if (tested.has(key)) return tested.get(key) ?? null
      if (!spend()) return null
      const operation = build(unpack(values))
      const result = applyCraftStep(catalog, state, operation)
      const evaluation = result.ok ? evaluateCraftPanelGoals(catalog, result.value, goals) : null
      tested.set(key, evaluation)
      if (result.ok) operations.set(key, operation)
      return evaluation
    }
    probe(low)
    probe(high)
    if (current.length === ranges.length) probe(current)
    const emitted = new Set(operations.keys())
    for (const operation of operations.values()) yield { operation, atRiskModIds }
    // 每次只变一个坐标，通过已有面板模型测量响应，再求各区间边界的邻近网格。
    // 最终能否满足仍以 offer 的真实应用和独立回放为准。
    boundaries: for (const anchor of [high, low]) {
      for (const [index, range] of ranges.entries()) {
        if (exhausted) break boundaries
        if (range.min === range.max) continue
        const a = [...anchor],
          b = [...anchor]
        a[index] = range.min
        b[index] = range.max
        const left = probe(a),
          right = probe(b)
        if (!left || !right) continue
        for (const [goalIndex, goal] of goals.entries()) {
          const x = left.statuses[goalIndex]?.actual,
            y = right.statuses[goalIndex]?.actual
          if (!x?.ok || !y?.ok || x.value === y.value) continue
          for (const boundary of goal.max === undefined ? [goal.min] : [goal.min, goal.max]) {
            const raw =
              range.min + ((boundary - x.value) * (range.max - range.min)) / (y.value - x.value)
            if (
              !Number.isFinite(raw) ||
              raw < range.min - range.step ||
              raw > range.max + range.step
            )
              continue
            const grid = Math.floor((raw - range.min) / range.step)
            for (const delta of [-1, 0, 1, 2]) {
              const number = Number((range.min + (grid + delta) * range.step).toFixed(12))
              if (number < range.min || number > range.max) continue
              const values = [...anchor]
              values[index] = number
              probe(values)
            }
          }
        }
      }
    }
    for (const [key, operation] of operations)
      if (!emitted.has(key)) yield { operation, atRiskModIds }
  }
  const forge = prepareRuneforgeCraft(catalog, state)
  if (forge.ok)
    yield {
      operation: { kind: 'runeforge', fromBaseId: state.baseId, toBaseId: forge.value.toBase.id },
      atRiskModIds: [],
    }
  if (state.sockets !== undefined && state.sockets.length < artificerSocketLimit(catalog, state))
    yield { operation: { kind: 'artificer' }, atRiskModIds: [] }
  for (const [socketIndex] of (state.sockets ?? []).entries()) {
    const upgrade = prepareMasterworkCraft(catalog, state, socketIndex)
    if (upgrade.ok) yield { operation: upgrade.value.operation, atRiskModIds: [] }
  }
  const augments = limit(
    socketCandidates(catalog, state).sort(
      (a, b) => relevance(b.lines) - relevance(a.lines) || a.id.localeCompare(b.id),
    ),
    12,
  )
  for (const [socketIndex, existing] of (state.sockets ?? []).entries())
    for (const augment of augments)
      if (existing !== augment.id)
        yield {
          operation: { kind: 'socket', socketIndex, augmentId: augment.id },
          atRiskModIds: [],
        }

  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base || exhausted) return
  const guaranteed: {
    mod: CatalogMod
    removals: (CraftAffix | undefined)[]
    build: (values: number[], removed?: CraftAffix) => CraftStep
  }[] = []
  for (const essence of catalog.essences ?? []) {
    for (const resultModId of essenceResultModIds(catalog, base, essence)) {
      const prepared = prepareEssenceCraft(catalog, state, essence.id, undefined, resultModId)
      if (!prepared.ok) continue
      guaranteed.push({
        mod: prepared.value.mod,
        removals: prepared.value.mode === 'upgrade' ? [undefined] : prepared.value.removableAffixes,
        build: (values, removed) => ({
          kind: 'essence',
          essenceId: essence.id,
          resultModId,
          values,
          ...(removed ? remove(removed) : {}),
        }),
      })
    }
  }
  for (const alloy of catalog.alloys?.alloys ?? []) {
    const prepared = prepareAlloyCraft(catalog, state, alloy.id)
    if (prepared.ok)
      guaranteed.push({
        mod: prepared.value.mod,
        removals: prepared.value.removableAffixes,
        build: (values, removed) => ({
          kind: 'alloy',
          alloyId: alloy.id,
          values,
          ...remove(removed),
        }),
      })
  }
  for (const emotion of catalog.liquidEmotions ?? [])
    for (const resultKind of [undefined, 'prefix', 'suffix'] as const) {
      const prepared = prepareLiquidEmotionCraft(catalog, state, emotion.id, resultKind)
      if (prepared.ok)
        guaranteed.push({
          mod: prepared.value.mod,
          removals: prepared.value.removableAffixes,
          build: (values, removed) => ({
            kind: 'liquid-emotion',
            emotionId: emotion.id,
            ...(resultKind ? { resultKind } : {}),
            values,
            ...remove(removed),
          }),
        })
    }
  guaranteed.sort(
    (a, b) => relevance(b.mod.lines) - relevance(a.mod.lines) || b.mod.level - a.mod.level,
  )
  for (const candidate of limit(guaranteed, 12))
    for (const removed of candidate.removals) {
      if (exhausted) return
      yield* numeric(
        [{ lines: candidate.mod.lines }],
        (values) => candidate.build(values[0] ?? [], removed),
        candidate.removals.flatMap((affix) => (affix ? [affix.modId] : [])),
      )
    }
  for (const flux of FLUXES) {
    if (exhausted) return
    const prepared = prepareFluxCraft(catalog, state, flux.id)
    if (!prepared.ok) continue
    yield* numeric(
      prepared.value.changes.map(({ toMod }) => ({ lines: toMod.lines })),
      (values) => ({
        kind: 'flux',
        fluxId: flux.id,
        rolls: prepared.value.changes.map(({ affix, toMod }, index) => ({
          affixId: affix.affixId,
          modId: toMod.id,
          values: values[index] ?? [],
        })),
      }),
    )
  }

  for (const currency of Object.keys(CRAFT_CURRENCY_RULES) as CraftCurrency[]) {
    if (exhausted) return
    const rule = CRAFT_CURRENCY_RULES[currency]
    if (rule.base === 'divine') {
      if (!prepareCraftOperation(catalog, state, currency).ok) continue
      const mutable = state.affixes.filter((affix) => !affix.fractured)
      const mods = mutable.map((affix) => byId.get(affix.modId))
      if (mods.some((mod) => !mod)) continue
      const base = catalog.bases.find((entry) => entry.id === state.baseId)
      const implicit = base ? resolveCraftImplicitPatterns(base, state) : null
      if (!implicit?.ok) continue
      const patterns = implicit.value.patterns
      yield* numeric(
        [
          ...mutable.map((affix, index) => ({
            lines: mods[index]?.lines ?? [],
            actual: affix.lines,
          })),
          { lines: patterns, actual: state.implicitLines ?? patterns },
        ],
        (values) => ({
          currency,
          modIds: [],
          rolls: mutable.map((affix, index) => ({
            modId: affix.modId,
            ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
            values: values[index] ?? [],
          })),
          implicitValues: values[mutable.length] ?? [],
        }),
      )
      continue
    }
    const removal =
      rule.base === 'chaos' || rule.base === 'annulment'
        ? removableCraftAffixes(catalog, state, currency as RemovalCraftCurrency)
        : null
    if (removal && !removal.ok) continue
    const removals = removal?.ok ? removal.value : [undefined]
    const risk = removal?.ok ? removal.value.map((affix) => affix.modId) : []
    for (const removed of removals) {
      if (exhausted) return
      const selector = removed
        ? {
            modId: removed.modId,
            ...(removed.affixId === undefined ? {} : { affixId: removed.affixId }),
          }
        : undefined
      const prepared = prepareCraftOperation(catalog, state, currency, selector)
      if (!prepared.ok) continue
      const count = prepared.value.count
      const operation: CraftOperation = {
        currency,
        modIds: [],
        ...(removed ? remove(removed) : {}),
      }
      if (prepared.value.count === 0) {
        yield { operation, atRiskModIds: risk }
        continue
      }
      function* fill(
        current: CraftState,
        selected: CraftAffix[],
        mods: CatalogMod[],
      ): Generator<PanelRouteCandidate> {
        if (exhausted) return
        if (selected.length === count) {
          yield* numeric(
            mods.map((mod) => ({ lines: mod.lines })),
            (values) => ({
              ...operation,
              modIds: selected.map((affix) => affix.modId),
              rolls: selected.map((affix, index) => ({
                modId: affix.modId,
                ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
                values: values[index] ?? [],
              })),
            }),
            risk,
          )
          return
        }
        const pool = rankedMods(craftCandidates(catalog, current, currency))
        // 多新增保留有限组合；普通单新增仍覆盖多种可选词缀，不伪装为单目标路线。
        for (const mod of count > 1 ? limit(pool, selected.length ? 1 : 3) : pool) {
          if (!spend()) return
          const added = addCraftAffix(catalog, current, mod.id, currency)
          if (!added.ok) continue
          const affix = added.value.affixes[current.affixes.length]
          if (affix) yield* fill(added.value, [...selected, affix], [...mods, mod])
        }
      }
      yield* fill(prepared.value.state, [], [])
    }
  }
}
