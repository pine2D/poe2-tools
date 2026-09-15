import { analyzeAlloyTargetContext } from './alloyAdvice'
import { usesSovereignResistance } from './alloyEffects'
import { inspectCraftAlloys } from './alloys'
import { resolveCraftImplicitPatterns } from './beltImplicits'
import { analyzeBoneTargetContext } from './boneAdvice'
import type { CatalogMod, CraftCatalog } from './catalog'
import {
  type CraftPricing,
  collectCraftCosts,
  parseCraftPricing,
  quoteCraftCosts,
} from './craftCosts'
import { craftStateSemanticKey } from './craftStateSemanticKey'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import { analyzeEssenceTargetContext } from './essenceAdvice'
import { essenceCategory } from './essences'
import { prepareFluxCraft } from './fluxCraft'
import { FLUXES } from './fluxes'
import { prepareFracture } from './fracture'
import {
  analyzeCraftImplicitTargets,
  type CraftImplicitTargetValues,
  craftImplicitTargetCandidates,
  implicitTargetRolls,
} from './implicitTargets'
import { jointEffectDivineOperations, liquidRouteContext } from './liquidRouteCandidates'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen, craftOmenMaterials } from './omens'
import {
  addCraftAffix,
  CRAFT_CURRENCY_RULES,
  type CraftOperation,
  type CraftResult,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
  type RemovalCraftCurrency,
  removableCraftAffixes,
} from './rehearsal'
import { sovereignRouteContext } from './sovereignRouteCandidates'
import {
  definitionFluxSourceModIds,
  definitionModRollOptions,
  nativeTargetRollOperations,
  targetValueCandidateContexts,
} from './targetDefinitionRolls'
import { specialTargetContext } from './targetDefinitionSpecialContext'
import type { CraftTargetDefinitions } from './targetDefinitions'
import {
  evaluateTargetDefinitions,
  lostCraftTargetIds,
  matchedCraftTargetIds,
} from './targetProgress'
import { targetRollsPreservingValues } from './targetRolls'
import {
  analyzeCraftTargetContext,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
} from './targets'

export interface CraftTargetRouteOptions {
  minimumTargetCount?: number
  /** 传入报价后先按目标推进取得完整示例，再按新增费用改进；不含起点或历史消费。 */
  pricing?: CraftPricing
  preserveMatched?: boolean
  maxStates?: number
  maxDepth?: number
}
export interface CraftTargetRouteStep {
  /** 原生搜索风险按tN计数；实际受影响档位单列，旧路线省略此字段。 */
  affectedModIds?: string[]
  fractureCandidateModIds?: string[]
  matchedImplicitLineIndexes?: number[]
  gainedImplicitLineIndexes?: number[]
  lostImplicitLineIndexes?: number[]
  rerolledImplicitLineIndexes?: number[]
  operation: CraftStep
  state: CraftState
  /** matched/gained 使用主目标组 ID；风险与损失使用当前真实存在的已接受档位 ID，损失含数值失配。 */
  matchedTargetIds: string[]
  gainedTargetIds: string[]
  lostTargetIds: string[]
  atRiskTargetIds: string[]
  rerolledTargetIds: string[]
}
export interface CraftTargetRoute {
  steps: CraftTargetRouteStep[]
  finalState: CraftState
}
export interface CraftTargetRoutes {
  routes: CraftTargetRoute[]
  examinedStates: number
  candidateApplications: number
  truncated: boolean
  alreadyMatched: boolean
}
/** 搜索、完成路线排序与同终点取舍使用同一份受影响目标计数。 */
function stepRisk(
  step: Pick<
    CraftTargetRouteStep,
    | 'lostTargetIds'
    | 'atRiskTargetIds'
    | 'rerolledTargetIds'
    | 'lostImplicitLineIndexes'
    | 'rerolledImplicitLineIndexes'
  >,
): number {
  return (
    step.lostTargetIds.length +
    step.atRiskTargetIds.length +
    step.rerolledTargetIds.length +
    (step.lostImplicitLineIndexes?.length ?? 0) +
    (step.rerolledImplicitLineIndexes?.length ?? 0)
  )
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 有界的指定结果搜索，不代表穷举、概率或最优路线。 */
export function planCraftTargetRoutes(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: CraftTargetRouteOptions = {},
  implicitValues: readonly CraftImplicitTargetValues[] = [],
  fracturedTargetId?: string,
): CraftResult<CraftTargetRoutes> {
  return planCraftTargetContext(
    catalog,
    state,
    ids,
    values,
    alternatives,
    options,
    implicitValues,
    fracturedTargetId,
  )
}

/** 单一搜索引擎；原生目标按独立身份推进与保护，候选执行仍共用全部操作。 */
export function planCraftTargetContext(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: CraftTargetRouteOptions = {},
  implicitValues: readonly CraftImplicitTargetValues[] = [],
  fracturedTargetId?: string,
  definitions?: CraftTargetDefinitions,
): CraftResult<CraftTargetRoutes> {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) =>
        !['preserveMatched', 'maxStates', 'maxDepth', 'pricing', 'minimumTargetCount'].includes(
          key,
        ),
    ) ||
    (options.preserveMatched !== undefined && typeof options.preserveMatched !== 'boolean')
  )
    return { ok: false, error: '路线配置无效。' }
  const parsedPricing = Object.hasOwn(options, 'pricing')
    ? parseCraftPricing(options.pricing, catalog)
    : null
  if (parsedPricing && !parsedPricing.ok) return parsedPricing
  const pricing = parsedPricing?.ok ? parsedPricing.value : undefined
  const operationCosts = new Map<string, number | null>()
  const operationCost = (operation: CraftStep): number | null => {
    if (!pricing) return 0
    const id = JSON.stringify(operation)
    if (operationCosts.has(id)) return operationCosts.get(id) ?? null
    const costs = collectCraftCosts(catalog, [operation])
    const quote = costs.ok ? quoteCraftCosts(costs.value, pricing) : null
    // 只比较完整报价。缺价小计不能当作便宜路径，也不参与金额相减。
    const amount =
      quote?.ok && quote.value.total !== null ? Math.round(quote.value.total * 1000000) : null
    operationCosts.set(id, amount)
    return amount
  }
  const priceCompare = (a: number | null, b: number | null) =>
    a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b
  const routeCost = (route: CraftTargetRoute): number | null => {
    let total = 0
    for (const step of route.steps) {
      const cost = operationCost(step.operation)
      if (cost === null) return null
      total += cost
    }
    return total
  }
  const routeRisk = (route: CraftTargetRoute) =>
    route.steps.reduce((sum, step) => sum + stepRisk(step), 0)
  const routeCompare = (a: CraftTargetRoute, b: CraftTargetRoute) =>
    (pricing ? priceCompare(routeCost(a), routeCost(b)) : 0) ||
    routeRisk(a) - routeRisk(b) ||
    a.steps.length - b.steps.length ||
    (b.finalState.catalyst?.quality ?? 0) - (a.finalState.catalyst?.quality ?? 0) ||
    compare(
      JSON.stringify(a.steps.map((s) => s.operation)),
      JSON.stringify(b.steps.map((s) => s.operation)),
    )
  const maxStates = options.maxStates === undefined ? 128 : options.maxStates
  const maxDepth = options.maxDepth === undefined ? 12 : options.maxDepth
  if (
    !Number.isInteger(maxStates) ||
    maxStates < 1 ||
    maxStates > 512 ||
    !Number.isInteger(maxDepth) ||
    maxDepth < 1 ||
    maxDepth > 16
  )
    return { ok: false, error: '展开状态预算须为 1–512 的整数，深度须为 1–16 的整数。' }
  const initial = analyzeCraftTargetContext(
    catalog,
    state,
    ids,
    values,
    alternatives,
    undefined,
    implicitValues,
    fracturedTargetId,
    options.minimumTargetCount,
    definitions,
  )
  if (!initial.ok) return initial
  const result: CraftTargetRoutes = {
    routes: [],
    examinedStates: 0,
    candidateApplications: 0,
    truncated: false,
    alreadyMatched:
      !state.pendingDesecration &&
      (ids.length > 0 || implicitValues.length > 0) &&
      (definitions
        ? evaluateTargetDefinitions(catalog, state, definitions).satisfied &&
          (initial.value.implicitTargets ?? []).every((target) => target.matched)
        : craftTargetsSatisfied(initial.value, options.minimumTargetCount, fracturedTargetId)),
  }
  if ((!ids.length && !implicitValues.length && !state.pendingDesecration) || result.alreadyMatched)
    return { ok: true, value: result }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const groups = definitions
    ? definitions.targets.map((target) => [
        target.modId,
        ...(definitions.alternatives.find((entry) => entry.targetId === target.targetId)?.modIds ??
          []),
      ])
    : ids.map((id) => [id, ...(alternatives.find((a) => a.targetModId === id)?.modIds ?? [])])
  const generatingGroups = definitions
    ? groups.map((group) => [...group, ...definitionFluxSourceModIds(catalog, state, group)])
    : groups
  const accepted = new Set(groups.flat())
  const onOmitted = () => {
    result.truncated = true
  }
  const valueContexts = definitions
    ? targetValueCandidateContexts(definitions, onOmitted)
    : [values]
  const liquids = valueContexts.map((context) =>
    liquidRouteContext(catalog, state, groups, context, onOmitted),
  )
  const sovereigns = valueContexts.map((context) =>
    sovereignRouteContext(
      catalog,
      state,
      groups,
      context,
      onOmitted,
      options.minimumTargetCount,
      definitions
        ? definitions.targets.find((target) => target.targetId === fracturedTargetId)?.modId
        : fracturedTargetId,
    ),
  )
  const liquid = {
    enabled: liquids.some((context) => context.enabled),
    priority: (current: CraftState) =>
      Math.max(0, ...liquids.map((context) => context.priority(current))),
    candidates: function* (current: CraftState, consume: () => boolean) {
      const seen = new Set<string>()
      for (const context of liquids)
        for (const candidate of context.candidates(current, consume)) {
          const key = JSON.stringify(candidate.operation)
          if (seen.has(key)) continue
          seen.add(key)
          yield candidate
        }
    },
    rolls: (current: CraftState, mod: CatalogMod) => liquids[0]?.rolls(current, mod) ?? null,
  }
  const sovereign = {
    enabled: sovereigns.some((context) => context.enabled),
    priority: (current: CraftState) =>
      Math.max(0, ...sovereigns.map((context) => context.priority(current))),
    candidates: function* (current: CraftState, consume: () => boolean) {
      const seen = new Set<string>()
      for (const context of sovereigns)
        for (const candidate of context.candidates(current, consume)) {
          const key = JSON.stringify(candidate.operation)
          if (seen.has(key)) continue
          seen.add(key)
          yield candidate
        }
    },
    rolls: (current: CraftState, mod: CatalogMod) => sovereigns[0]?.rolls(current, mod) ?? null,
  }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const category = base ? essenceCategory(base) : ''
  const essenceIds = new Set(
    (catalog.essences ?? []).flatMap((essence) => {
      const id = essence.mods[category]
      return id && accepted.has(id) ? [id] : []
    }),
  )
  if (base)
    for (const entry of inspectCraftAlloys(catalog, base))
      if (entry.mod && accepted.has(entry.mod.id)) essenceIds.add(entry.mod.id)
  const goal = (id: string) => values.find((v) => v.modId === id)
  const numericDefinitions = definitions
    ? (({ fracturedTargetId: _, ...rest }) => rest)(definitions)
    : undefined
  const numericMatched = (current: CraftState) =>
    numericDefinitions
      ? evaluateTargetDefinitions(catalog, current, numericDefinitions).matches.map(
          (match) => match.targetId,
        )
      : matchedCraftTargetIds(catalog, current, ids, groups, values)
  // 起点保护只看身份与数值；完整目标推进还需锁定对应的已接受组。
  const matched = (current: CraftState) =>
    definitions
      ? evaluateTargetDefinitions(catalog, current, definitions).matches.map(
          (match) => match.targetId,
        )
      : matchedCraftTargetIds(catalog, current, ids, groups, values, fracturedTargetId)
  const fracturePriority = (current: CraftState) => {
    if (!fracturedTargetId || current.affixes.some((affix) => affix.fractured)) return 0
    return (
      (numericMatched(current).includes(fracturedTargetId) ? 0.4 : 0) +
      (current.rarity === 'rare' ? 0.02 : current.rarity === 'magic' ? 0.01 : 0) +
      Math.min(4, current.affixes.length + Number(Boolean(current.pendingDesecration))) * 0.001
    )
  }
  const bonePriority = (current: CraftState) =>
    current.pendingDesecration ? (current.pendingDesecration.options ? 0.2 : 0.1) : 0
  const protectedIds = options.preserveMatched === false ? [] : numericMatched(state)
  const matchedImplicit = (current: CraftState): number[] => {
    if (!implicitValues.length) return []
    const analyzed = analyzeCraftImplicitTargets(catalog, current, implicitValues)
    return analyzed.ok
      ? analyzed.value.filter((target) => target.matched).map((target) => target.lineIndex)
      : []
  }
  const protectedImplicit = options.preserveMatched === false ? [] : matchedImplicit(state)
  const key = craftStateSemanticKey
  // 仅比较已达成全部目标的相同步骤；移除催化材料后其余消费必须逐步完全相同。
  const withoutCatalystKey = (route: CraftTargetRoute) =>
    JSON.stringify({
      state: key(
        route.finalState.catalyst
          ? {
              ...route.finalState,
              catalyst: { ...route.finalState.catalyst, quality: 0 },
            }
          : route.finalState,
      ),
      operations: route.steps.map(({ operation }) =>
        'currency' in operation
          ? {
              ...operation,
              omen: operation.omen
                ? craftOmenMaterials(operation.omen).filter(
                    (name) => name !== 'Omen of Catalysing Exaltation',
                  )
                : [],
            }
          : operation,
      ),
    })
  type Node = {
    state: CraftState
    steps: CraftTargetRouteStep[]
    score: number
    risk: number
    boneOmens: number
    cost: number | null
    path: string
  }
  const queue: Node[] = [
    {
      state,
      steps: [],
      score:
        matched(state).length +
        matchedImplicit(state).length +
        bonePriority(state) +
        fracturePriority(state) +
        liquid.priority(state) +
        sovereign.priority(state),
      risk: 0,
      boneOmens: 0,
      cost: 0,
      path: '',
    },
  ]
  const seen = new Map<string, { depth: number; risk: number }>([
    [key(state), { depth: 0, risk: 0 }],
  ])
  type Frontier = { depth: number; risk: number; cost: number | null }
  const frontiers = new Map<string, Frontier[]>([[key(state), [{ depth: 0, risk: 0, cost: 0 }]]])
  const dominates = (a: Frontier, b: Frontier) =>
    a.depth <= b.depth &&
    a.risk <= b.risk &&
    (a.cost === null || b.cost === null ? a.cost === b.cost : a.cost <= b.cost)
  const spend = () => {
    if (result.candidateApplications >= 4096) {
      result.truncated = true
      return false
    }
    result.candidateApplications++
    return true
  }
  while (
    queue.length &&
    (pricing !== undefined || result.routes.length === 0) &&
    result.examinedStates < maxStates &&
    result.candidateApplications < 4096
  ) {
    queue.sort(
      (a, b) =>
        (pricing && result.routes.length ? priceCompare(a.cost, b.cost) : 0) ||
        b.score - a.score ||
        (pricing ? priceCompare(a.cost, b.cost) : 0) ||
        a.risk - b.risk ||
        a.boneOmens - b.boneOmens ||
        a.steps.length - b.steps.length ||
        compare(a.path, b.path),
    )
    const node = queue.shift()
    if (!node) break
    // 首先取得完整路线，再按费用改进。三条完整已知报价形成上界；金额非负，
    // 后续前缀不可能降低已消费费用。同价仍可改进风险和步数，不能提前排除。
    const third = pricing && result.routes.length >= 3 ? result.routes[2] : undefined
    const upperCost = third ? routeCost(third) : null
    if (upperCost !== null && (node.cost === null || node.cost > upperCost)) {
      result.truncated = true
      break
    }
    if (
      pricing &&
      !frontiers
        .get(key(node.state))
        ?.some(
          (entry) =>
            entry.depth === node.steps.length &&
            entry.risk === node.risk &&
            entry.cost === node.cost,
        )
    )
      continue
    const best = pricing ? undefined : seen.get(key(node.state))
    if (
      best &&
      (best.depth < node.steps.length ||
        (best.depth === node.steps.length && best.risk < node.risk))
    )
      continue
    if (node.steps.length >= maxDepth) {
      result.truncated = true
      continue
    }
    result.examinedStates++
    const beforeNumeric = numericMatched(node.state)
    const beforeMatched = matched(node.state)
    // 页面应用第一步后会把新达成目标视为起点保护；液态完整示例也须保持同一语义。
    const stepProtectedIds =
      (liquid.enabled || sovereign.enabled) && options.preserveMatched !== false
        ? beforeNumeric
        : protectedIds
    const beforeImplicit = matchedImplicit(node.state)
    const present = [
      ...new Set(node.state.affixes.filter((a) => accepted.has(a.modId)).map((a) => a.modId)),
    ]
    const offer = (
      operation: CraftStep,
      atRiskTargetIds: string[] = [],
      fractureCandidateModIds?: string[],
    ) => {
      if (!spend()) return
      const applied = applyCraftStep(catalog, node.state, operation)
      if (!applied.ok) return
      const afterNumeric = numericMatched(applied.value)
      const afterMatched = matched(applied.value)
      if (stepProtectedIds.some((id) => !afterNumeric.includes(id))) return
      const afterImplicit = matchedImplicit(applied.value)
      if (protectedImplicit.some((index) => !afterImplicit.includes(index))) return
      const lostImplicit = beforeImplicit.filter((index) => !afterImplicit.includes(index))
      const implicitCandidates =
        implicitValues.length && 'currency' in operation && operation.currency === 'divine'
          ? craftImplicitTargetCandidates(catalog, node.state)
          : null
      const rerolledImplicit = implicitCandidates?.ok
        ? implicitCandidates.value
            .filter(
              (candidate) =>
                candidate.rerollable &&
                implicitValues.some((goal) => goal.lineIndex === candidate.lineIndex),
            )
            .map((candidate) => candidate.lineIndex)
        : []
      const lostTargetIds = definitions
        ? beforeNumeric.filter((id) => !afterNumeric.includes(id))
        : lostCraftTargetIds(catalog, node.state, applied.value, ids, groups, values)
      const rerolledTargetIds =
        'currency' in operation && operation.currency === 'divine' && operation.omen !== 'blessed'
          ? [
              ...new Set(
                node.state.affixes
                  .filter((affix) => accepted.has(affix.modId) && !affix.fractured)
                  .map((affix) => affix.modId),
              ),
            ]
          : []
      const risk =
        node.risk +
        stepRisk({
          lostTargetIds,
          atRiskTargetIds,
          rerolledTargetIds,
          lostImplicitLineIndexes: lostImplicit,
          rerolledImplicitLineIndexes: rerolledImplicit,
        })
      const stateKey = key(applied.value)
      const previous = seen.get(stateKey)
      const depth = node.steps.length + 1
      if (
        !pricing &&
        previous &&
        (previous.depth < depth || (previous.depth === depth && previous.risk <= risk))
      )
        return
      const addedCost = operationCost(operation)
      const cost = node.cost === null || addedCost === null ? null : node.cost + addedCost
      if (pricing) {
        const nextFrontier = { depth, risk, cost }
        const entries = frontiers.get(stateKey) ?? []
        if (entries.some((entry) => dominates(entry, nextFrontier))) return
        frontiers.set(stateKey, [
          ...entries.filter((entry) => !dominates(nextFrontier, entry)),
          nextFrontier,
        ])
      } else seen.set(stateKey, { depth, risk })
      const step: CraftTargetRouteStep = {
        ...(fractureCandidateModIds ? { fractureCandidateModIds } : {}),
        ...(numericDefinitions
          ? {
              affectedModIds: specialTargetContext(
                catalog,
                node.state,
                numericDefinitions,
              ).affected(applied.value),
            }
          : {}),
        operation: structuredClone(operation),
        state: applied.value,
        matchedTargetIds: afterMatched,
        gainedTargetIds: afterMatched.filter((id) => !beforeMatched.includes(id)),
        lostTargetIds,
        atRiskTargetIds,
        rerolledTargetIds,
        ...(implicitValues.length
          ? {
              matchedImplicitLineIndexes: afterImplicit,
              gainedImplicitLineIndexes: afterImplicit.filter(
                (index) => !beforeImplicit.includes(index),
              ),
              lostImplicitLineIndexes: lostImplicit,
              rerolledImplicitLineIndexes: rerolledImplicit,
            }
          : {}),
      }
      const steps = [...node.steps, step]
      if (
        !applied.value.pendingDesecration &&
        afterMatched.length >= (options.minimumTargetCount ?? ids.length) &&
        afterImplicit.length === implicitValues.length &&
        (fracturedTargetId === undefined || afterMatched.includes(fracturedTargetId))
      ) {
        let current = state
        for (const entry of steps) {
          if (!spend()) return
          const replay = applyCraftStep(catalog, current, entry.operation)
          if (!replay.ok) return
          current = replay.value
        }
        const final = analyzeCraftTargetContext(
          catalog,
          current,
          ids,
          values,
          alternatives,
          undefined,
          implicitValues,
          fracturedTargetId,
          options.minimumTargetCount,
          definitions,
        )
        if (
          !current.pendingDesecration &&
          final.ok &&
          (definitions
            ? evaluateTargetDefinitions(catalog, current, definitions).satisfied &&
              (final.value.implicitTargets ?? []).every((target) => target.matched)
            : craftTargetsSatisfied(final.value, options.minimumTargetCount, fracturedTargetId)) &&
          (pricing !== undefined || result.routes.length < 3)
        ) {
          const route = { steps, finalState: current }
          if (current.catalyst) {
            const signature = withoutCatalystKey(route)
            for (let index = result.routes.length - 1; index >= 0; index--) {
              const prior = result.routes[index]
              if (!prior || withoutCatalystKey(prior) !== signature) continue
              const quality = prior.finalState.catalyst?.quality ?? 0
              if (quality > current.catalyst.quality) return
              if (quality < current.catalyst.quality) result.routes.splice(index, 1)
            }
          }
          if (pricing) {
            const existing = result.routes.findIndex(
              (entry) => key(entry.finalState) === key(current),
            )
            if (existing >= 0) {
              const prior = result.routes[existing]
              if (prior && routeCompare(prior, route) <= 0) return
              result.routes.splice(existing, 1)
            }
            result.routes.push(route)
            result.routes.sort(routeCompare)
            if (result.routes.length > 3) {
              result.routes.splice(3)
              result.truncated = true
            }
          } else result.routes.push(route)
        }
      } else
        queue.push({
          state: applied.value,
          steps,
          score:
            afterMatched.length +
            afterImplicit.length +
            bonePriority(applied.value) +
            fracturePriority(applied.value) +
            liquid.priority(applied.value) +
            sovereign.priority(applied.value),
          risk,
          cost,
          boneOmens:
            node.boneOmens +
            ('kind' in operation && operation.kind === 'desecrate'
              ? Number(Boolean(operation.directionOmen)) + Number(Boolean(operation.lichOmen))
              : 0),
          path: JSON.stringify(steps.map((s) => s.operation)),
        })
    }
    const omitted = () => {
      result.truncated = true
    }
    const limit = <T>(entries: T[], count: number): T[] => {
      if (entries.length > count) omitted()
      return entries.slice(0, count)
    }
    if (definitions) {
      for (const flux of FLUXES) {
        const prepared = prepareFluxCraft(catalog, node.state, flux.id)
        if (!prepared.ok) continue
        for (const operation of nativeTargetRollOperations(
          catalog,
          node.state,
          definitions,
          { kind: 'flux', prepared: prepared.value },
          spend,
        ))
          offer(operation)
      }
      for (const operation of nativeTargetRollOperations(
        catalog,
        node.state,
        definitions,
        { kind: 'divine', implicitValues },
        spend,
      ))
        offer(operation)
    }
    if (fracturedTargetId && numericMatched(node.state).includes(fracturedTargetId)) {
      const prepared = prepareFracture(catalog, node.state)
      const group = groups[ids.indexOf(fracturedTargetId)] ?? []
      if (prepared.ok)
        for (const affix of prepared.value.candidates)
          if (group.includes(affix.modId))
            offer(
              {
                kind: 'fracture',
                modId: affix.modId,
                ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
              },
              [],
              prepared.value.candidates.map((candidate) => candidate.modId),
            )
    }
    const boneAdvice = analyzeBoneTargetContext(
      catalog,
      node.state,
      ids,
      values,
      alternatives,
      {
        consumeCandidate: spend,
        ...(options.minimumTargetCount === undefined
          ? {}
          : { minimumTargetCount: options.minimumTargetCount }),
        ...(fracturedTargetId === undefined ? {} : { fracturedTargetId }),
      },
      definitions,
    )
    if (boneAdvice.ok)
      for (const step of boneAdvice.value) offer(step.operation, step.atRiskTargetIds)
    if (liquid.enabled) {
      for (const candidate of liquid.candidates(node.state, spend)) {
        if (result.candidateApplications >= 4096) break
        offer(candidate.operation, candidate.atRiskTargetIds)
      }
    }
    if (node.state.pendingDesecration) continue
    if (sovereign.enabled) {
      for (const candidate of sovereign.candidates(node.state, spend)) {
        if (result.candidateApplications >= 4096) break
        offer(candidate.operation, candidate.atRiskTargetIds)
      }
    }
    if (liquid.enabled || usesSovereignResistance(node.state)) {
      for (const operation of jointEffectDivineOperations(
        catalog,
        node.state,
        values,
        implicitValues,
        options.minimumTargetCount !== undefined && options.minimumTargetCount < ids.length,
        groups[ids.indexOf(fracturedTargetId ?? '')] ?? [],
        definitions,
        spend,
      )) {
        if (result.candidateApplications >= 4096) break
        offer(operation)
      }
    }
    const blockedBone = groups.some(
      (group, index) =>
        !beforeMatched.includes(ids[index] ?? '') &&
        group.some((id) => byId.get(id)?.desecratedOnly),
    )
    const configs: (CraftOmen | undefined)[] = [
      undefined,
      ...(Object.keys(CRAFT_OMEN_RULES) as CraftOmen[]).filter((omen) => {
        const rule = CRAFT_OMEN_RULES[omen]
        if (
          rule.consumesCatalyst &&
          (!node.state.catalyst?.quality ||
            !prepareCraftOperation(catalog, node.state, 'exalted', undefined, omen).ok)
        )
          return false
        if (rule.lowestLevel && rule.kind !== null) {
          const combined = removableCraftAffixes(catalog, node.state, 'chaos', omen)
          if (!combined.ok) return false
          // 定向可能绕过另一侧更低等级的组；只有结果池不同于两种单枚时才推荐双枚。
          return (
            ['whittling', rule.kind === 'prefix' ? 'sinistral_erasure' : 'dextral_erasure'] as const
          ).every((single) => {
            const pool = removableCraftAffixes(catalog, node.state, 'chaos', single)
            return (
              pool.ok &&
              (combined.value.length !== pool.value.length ||
                combined.value.some(
                  (affix) =>
                    !pool.value.some(
                      (entry) => (entry.affixId ?? entry.modId) === (affix.affixId ?? affix.modId),
                    ),
                ))
            )
          })
        }
        if (omen === 'blessed')
          return (
            implicitValues.length > 0 &&
            node.state.affixes.some((affix) => {
              if (affix.fractured) return false
              const mod = byId.get(affix.modId)
              const numeric = mod ? inspectNumericLines(mod.lines) : null
              return numeric?.ok === true && numeric.value.some((range) => range.min < range.max)
            })
          )
        if (rule.addCount !== 2) return true
        if (definitions) {
          const available = new Set(
            craftCandidates(catalog, node.state, rule.currency, omen).map((mod) => mod.id),
          )
          return (
            groups.filter(
              (group, index) =>
                !beforeMatched.includes(ids[index] ?? '') &&
                (generatingGroups[index] ?? group).some(
                  (id) =>
                    available.has(id) && (rule.kind === null || byId.get(id)?.kind === rule.kind),
                ),
            ).length >= 2
          )
        }
        // 单个目标不推荐付出额外预兆并占用无关空位；手动演练仍允许指定填充组。
        return (
          groups.filter(
            (group) =>
              !node.state.affixes.some((affix) => group.includes(affix.modId)) &&
              group.some((id) => rule.kind === null || byId.get(id)?.kind === rule.kind),
          ).length >= 2
        )
      }),
    ]
    // 两个未达成目标可由同一次崇高推进时，先探索双组配置，避免有限搜索被单组路径占满。
    const doublePriority = (omen: CraftOmen | undefined): number => {
      if (omen === undefined || CRAFT_OMEN_RULES[omen].addCount !== 2) return 2
      const side = CRAFT_OMEN_RULES[omen].kind
      return groups.filter(
        (group, index) =>
          !beforeMatched.includes(ids[index] ?? '') &&
          group.some((id) => side === null || byId.get(id)?.kind === side),
      ).length >= 2
        ? side === null
          ? 1
          : 0
        : 3
    }
    configs.sort(
      (a, b) =>
        doublePriority(a) - doublePriority(b) ||
        Number(a !== undefined && CRAFT_OMEN_RULES[a].consumesCatalyst === true) -
          Number(b !== undefined && CRAFT_OMEN_RULES[b].consumesCatalyst === true),
    )
    for (const omen of configs) {
      const advice =
        omen === undefined && node.steps.length === 0
          ? initial
          : analyzeCraftTargetContext(
              catalog,
              node.state,
              ids,
              values,
              alternatives,
              omen,
              implicitValues,
              fracturedTargetId,
              options.minimumTargetCount,
              definitions,
            )
      if (!advice.ok) continue
      for (const suggestion of advice.value.steps) {
        if ((!pricing && result.routes.length >= 3) || result.candidateApplications >= 4096) break
        const { currency, removeModId, removeAffixId } = suggestion
        const prepared = prepareCraftOperation(
          catalog,
          node.state,
          currency,
          removeModId === undefined
            ? undefined
            : {
                modId: removeModId,
                ...(removeAffixId === undefined ? {} : { affixId: removeAffixId }),
              },
          omen,
        )
        if (!prepared.ok) continue
        let risk: string[] = []
        if (currency === 'annulment' || CRAFT_CURRENCY_RULES[currency].base === 'chaos') {
          const pool = removableCraftAffixes(
            catalog,
            node.state,
            currency as RemovalCraftCurrency,
            omen,
          )
          if (!pool.ok) continue
          if (omen !== undefined) {
            const original = removableCraftAffixes(
              catalog,
              node.state,
              currency as RemovalCraftCurrency,
            )
            if (original.ok && pool.value.length >= original.value.length) continue
          }
          risk =
            omen === 'light' && pool.value.length === 1
              ? []
              : present.filter((id) => pool.value.some((a) => a.modId === id))
        }
        const operation: CraftOperation = {
          currency,
          modIds: [],
          ...(omen ? { omen } : {}),
          ...(removeModId ? { removeModId } : {}),
          ...(removeAffixId === undefined ? {} : { removeAffixId }),
        }
        if (currency === 'divine') {
          if (definitions && omen !== 'blessed') continue
          const rolls: NonNullable<CraftOperation['rolls']> = []
          let valid = true
          for (const affix of node.state.affixes) {
            if (omen === 'blessed' || affix.fractured) continue
            const mod = byId.get(affix.modId)
            let numbers = mod
              ? minimumCraftTargetRolls(catalog, node.state, mod, goal(mod.id), affix.lines)
              : null
            if (
              numbers === null &&
              mod &&
              options.minimumTargetCount !== undefined &&
              options.minimumTargetCount < ids.length &&
              !groups[ids.indexOf(fracturedTargetId ?? '')]?.includes(mod.id)
            ) {
              numbers = minimumCraftTargetRolls(catalog, node.state, mod, undefined, affix.lines)
            }
            if (numbers === null) {
              valid = false
              break
            }
            if (numbers.length)
              rolls.push({
                modId: affix.modId,
                values: numbers,
                ...(affix.affixId === undefined ? {} : { affixId: affix.affixId }),
              })
          }
          const base = catalog.bases.find((b) => b.id === state.baseId)
          if (!base) continue
          const implicit = resolveCraftImplicitPatterns(base, node.state)
          if (!implicit.ok) continue
          const patterns = implicit.value.patterns
          const targeted = implicitValues.length
            ? implicitTargetRolls(catalog, node.state, implicitValues)
            : null
          const rolledImplicit =
            targeted === null
              ? targetRollsPreservingValues(patterns, node.state.implicitLines ?? patterns)
              : targeted.ok
                ? targeted.value
                : null
          if (valid && rolledImplicit !== null)
            offer({
              ...operation,
              rolls,
              ...(rolledImplicit.length ? { implicitValues: rolledImplicit } : {}),
            })
          continue
        }
        if (prepared.value.count === 0) {
          offer(operation, risk)
          continue
        }
        const fill = (current: CraftState, selected: CraftOperation) => {
          if (result.candidateApplications >= 4096) {
            omitted()
            return
          }
          if (selected.modIds.length === prepared.value.count) {
            offer(selected, risk)
            return
          }
          const candidates = craftCandidates(catalog, current, currency, omen)
            .filter((mod) =>
              selected.modIds.length === 0 ? suggestion.targetModIds.includes(mod.id) : true,
            )
            .sort(
              (a, b) =>
                Number(accepted.has(b.id)) - Number(accepted.has(a.id)) ||
                (definitions
                  ? Number(suggestion.targetModIds.includes(b.id)) -
                    Number(suggestion.targetModIds.includes(a.id))
                  : 0) ||
                compare(a.id, b.id),
            )
          for (const mod of limit(candidates, selected.modIds.length === 0 ? 12 : 6)) {
            const numberOptions = definitions
              ? [
                  ...definitionModRollOptions(catalog, current, definitions, mod),
                  ...liquids.flatMap((context) =>
                    context.enabled
                      ? [context.rolls(current, mod)].filter(
                          (value): value is number[] => value !== null,
                        )
                      : [],
                  ),
                  ...sovereigns.flatMap((context) =>
                    context.enabled
                      ? [context.rolls(current, mod)].filter(
                          (value): value is number[] => value !== null,
                        )
                      : [],
                  ),
                ]
              : [
                  liquid.enabled
                    ? liquid.rolls(node.state, mod)
                    : sovereign.enabled
                      ? sovereign.rolls(current, mod)
                      : minimumCraftTargetRolls(catalog, current, mod, goal(mod.id)),
                ]
            const unique = numberOptions.filter(
              (numbers, index) =>
                numberOptions.findIndex(
                  (other) => JSON.stringify(other) === JSON.stringify(numbers),
                ) === index,
            )
            for (const numbers of unique) {
              if (numbers === null) continue
              if (!spend()) return
              const added = addCraftAffix(catalog, current, mod.id, currency, omen)
              if (!added.ok) continue
              const addedAffix = added.value.affixes[current.affixes.length]
              fill(added.value, {
                ...selected,
                modIds: [...selected.modIds, mod.id],
                rolls: [
                  ...(selected.rolls ?? []),
                  ...(numbers.length
                    ? [
                        {
                          modId: mod.id,
                          values: numbers,
                          ...(addedAffix?.affixId === undefined
                            ? {}
                            : { affixId: addedAffix.affixId }),
                        },
                      ]
                    : []),
                ],
              })
              // 点金提供每个首目标的一组合法完整选择，避免排列爆炸。
              if (prepared.value.count > 1) {
                if (candidates.length > 1) omitted()
                break
              }
            }
          }
        }
        fill(prepared.value.state, operation)
      }
    }
    // 精华分析内部的 apply 与本搜索的 apply 均计入同一个独立预算。
    const essenceAdvice = analyzeEssenceTargetContext(
      catalog,
      node.state,
      ids,
      values,
      alternatives,
      {
        consumeCandidate: spend,
        ...(options.minimumTargetCount === undefined
          ? {}
          : { minimumTargetCount: options.minimumTargetCount }),
        ...(fracturedTargetId === undefined ? {} : { fracturedTargetId }),
      },
      definitions,
    )
    if (essenceAdvice.ok)
      for (const step of essenceAdvice.value) offer(step.operation, step.atRiskTargetIds)
    const alloyAdvice = analyzeAlloyTargetContext(
      catalog,
      node.state,
      ids,
      values,
      alternatives,
      {
        consumeCandidate: spend,
        includePreparatory: true,
        ...(options.minimumTargetCount === undefined
          ? {}
          : { minimumTargetCount: options.minimumTargetCount }),
        ...(fracturedTargetId === undefined ? {} : { fracturedTargetId }),
      },
      definitions,
    )
    if (alloyAdvice.ok)
      for (const step of alloyAdvice.value) offer(step.operation, step.atRiskTargetIds)
    // 精华与合金专属目标不在普通新增池；普通单步建议无法提示其阻挡，另列合法剥离准备。
    const blockedEssence = groups.some(
      (group) =>
        group.some((id) => essenceIds.has(id)) &&
        !group.some((id) => node.state.affixes.some((affix) => affix.modId === id)),
    )
    // 已存在不等于已达成；神圣不可用或当前档位无解时，真实移除后允许重获同档位或 OR 替代。
    const divineAvailable = prepareCraftOperation(catalog, node.state, 'divine').ok
    const replacementAcceptedIds = new Set(
      groups.flatMap((group, index) => {
        if (beforeMatched.includes(ids[index] ?? '')) return []
        const replacementGoal = (id: string) =>
          definitions
            ? definitions.values.find(
                (value) =>
                  value.targetId === definitions.targets[index]?.targetId && value.modId === id,
              )
            : goal(id)
        const feasibleReplacement = group.some((id) => {
          const alternative = byId.get(id)
          return (
            alternative !== undefined &&
            alternative.level <= node.state.itemLevel &&
            minimumCraftTargetRolls(catalog, node.state, alternative, replacementGoal(id)) !== null
          )
        })
        if (!feasibleReplacement) return []
        return node.state.affixes.flatMap((existing) => {
          if (!group.includes(existing.modId) || existing.fractured) return []
          const mod = byId.get(existing.modId)
          if (
            !mod ||
            (divineAvailable &&
              minimumCraftTargetRolls(
                catalog,
                node.state,
                mod,
                replacementGoal(mod.id),
                existing.lines,
              ) !== null)
          )
            return []
          return [existing.affixId ?? existing.modId]
        })
      }),
    )
    if (blockedEssence || blockedBone || replacementAcceptedIds.size > 0) {
      const plain = removableCraftAffixes(catalog, node.state, 'annulment')
      if (plain.ok)
        for (const omen of configs.filter(
          (value) => value === undefined || CRAFT_OMEN_RULES[value].currency === 'annulment',
        )) {
          const pool = removableCraftAffixes(catalog, node.state, 'annulment', omen)
          if (!pool.ok || (omen && pool.value.length >= plain.value.length)) continue
          const risk =
            omen === 'light' && pool.value.length === 1
              ? []
              : present.filter((id) => pool.value.some((affix) => affix.modId === id))
          for (const removed of pool.value.filter(
            (affix) =>
              blockedEssence ||
              blockedBone ||
              replacementAcceptedIds.has(affix.affixId ?? affix.modId),
          ))
            offer(
              {
                currency: 'annulment',
                modIds: [],
                removeModId: removed.modId,
                ...(removed.affixId === undefined ? {} : { removeAffixId: removed.affixId }),
                ...(omen ? { omen } : {}),
              },
              risk,
            )
        }
    }
    // 破裂准备需要稀有且至少四组；其他目标继续沿既有精华/骨骼准备。
    const needsFracturePreparation =
      Boolean(fracturedTargetId) &&
      !node.state.affixes.some((affix) => affix.fractured) &&
      (node.state.rarity !== 'rare' || node.state.affixes.length < 4)
    if (
      needsFracturePreparation ||
      (node.state.rarity !== 'rare' && (blockedEssence || blockedBone))
    ) {
      const currency =
        node.state.rarity === 'normal'
          ? 'transmutation'
          : node.state.rarity === 'magic'
            ? 'regal'
            : 'exalted'
      const prepared = prepareCraftOperation(catalog, node.state, currency)
      if (prepared.ok) {
        const missing = groups
          .filter((_, i) => !numericMatched(node.state).includes(ids[i] ?? ''))
          .flat()
          .map((id) => byId.get(id))
          .filter((m) => m !== undefined)
        const candidates = craftCandidates(catalog, prepared.value.state, currency)
          .filter(
            (mod) =>
              (needsFracturePreparation || !accepted.has(mod.id)) &&
              !missing.some((target) => craftModsConflict(mod, target) && target.id !== mod.id),
          )
          .sort(
            (a, b) =>
              Number(accepted.has(b.id)) - Number(accepted.has(a.id)) || compare(a.id, b.id),
          )
        for (const mod of limit(candidates, 8)) {
          const options = definitions
            ? definitionModRollOptions(catalog, node.state, definitions, mod)
            : [minimumCraftTargetRolls(catalog, node.state, mod, goal(mod.id))]
          for (const numbers of options) {
            if (numbers === null) continue
            let affixId: string | undefined
            if (numbers.length) {
              if (!spend()) break
              const added = addCraftAffix(catalog, prepared.value.state, mod.id, currency)
              if (!added.ok) continue
              affixId = added.value.affixes[prepared.value.state.affixes.length]?.affixId
            }
            offer({
              currency,
              modIds: [mod.id],
              rolls: numbers.length
                ? [
                    {
                      modId: mod.id,
                      values: numbers,
                      ...(affixId === undefined ? {} : { affixId }),
                    },
                  ]
                : [],
            })
          }
        }
      }
    }
  }
  if (queue.length || result.candidateApplications >= 4096 || result.routes.length >= 3)
    result.truncated = true
  result.routes.sort(routeCompare)
  return { ok: true, value: result }
}
