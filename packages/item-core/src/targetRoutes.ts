import { resolveCraftImplicitPatterns } from './beltImplicits'
import { analyzeBoneTargets } from './boneAdvice'
import type { CraftCatalog } from './catalog'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { analyzeEssenceTargets } from './essenceAdvice'
import { essenceCategory } from './essences'
import { prepareFracture } from './fracture'
import {
  analyzeCraftImplicitTargets,
  type CraftImplicitTargetValues,
  craftImplicitTargetCandidates,
  implicitTargetRolls,
} from './implicitTargets'
import { craftModsConflict } from './modConflicts'
import { readNumericValues } from './numeric'
import { CRAFT_OMEN_RULES, type CraftOmen } from './omens'
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
import { minimumTargetRolls, targetRollsPreservingValues } from './targetRolls'
import { analyzeCraftTargets, type CraftTargetAlternative, type CraftTargetValues } from './targets'

export interface CraftTargetRouteOptions {
  preserveMatched?: boolean
  maxStates?: number
  maxDepth?: number
}
export interface CraftTargetRouteStep {
  fractureCandidateModIds?: string[]
  matchedImplicitLineIndexes?: number[]
  gainedImplicitLineIndexes?: number[]
  lostImplicitLineIndexes?: number[]
  rerolledImplicitLineIndexes?: number[]
  operation: CraftStep
  state: CraftState
  /** matched/gained 使用主目标组 ID；风险与损失使用当前真实存在的已接受档位 ID。 */
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
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => !['preserveMatched', 'maxStates', 'maxDepth'].includes(key),
    ) ||
    (options.preserveMatched !== undefined && typeof options.preserveMatched !== 'boolean')
  )
    return { ok: false, error: '路线配置无效。' }
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
  const initial = analyzeCraftTargets(
    catalog,
    state,
    ids,
    values,
    alternatives,
    undefined,
    implicitValues,
    fracturedTargetId,
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
      initial.value.targets.every((t) => t.matched) &&
      (initial.value.implicitTargets ?? []).every((target) => target.matched),
  }
  if ((!ids.length && !implicitValues.length && !state.pendingDesecration) || result.alreadyMatched)
    return { ok: true, value: result }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const groups = ids.map((id) => [
    id,
    ...(alternatives.find((a) => a.targetModId === id)?.modIds ?? []),
  ])
  const accepted = new Set(groups.flat())
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  const category = base ? essenceCategory(base) : ''
  const essenceIds = new Set(
    (catalog.essences ?? []).flatMap((essence) => {
      const id = essence.mods[category]
      return id && accepted.has(id) ? [id] : []
    }),
  )
  const bounds = (id: string) => values.find((v) => v.modId === id)?.bounds
  const numericMatched = (current: CraftState) =>
    ids.filter((_, index) =>
      groups[index]?.some((id) => {
        const affix = current.affixes.find((a) => a.modId === id)
        const mod = byId.get(id)
        if (!affix || !mod) return false
        const conditions = bounds(id) ?? []
        if (!conditions.length) return true
        const actual = readNumericValues(mod.lines, affix.lines)
        return (
          actual.ok &&
          conditions.every((b) => {
            const n = actual.value[b.index]
            return (
              n != null &&
              (b.min === undefined || n >= b.min) &&
              (b.max === undefined || n <= b.max)
            )
          })
        )
      }),
    )
  // 起点保护只看身份与数值；完整目标推进还需锁定对应的已接受组。
  const matched = (current: CraftState) =>
    numericMatched(current).filter(
      (id) =>
        id !== fracturedTargetId ||
        current.affixes.some(
          (affix) => affix.fractured && groups[ids.indexOf(id)]?.includes(affix.modId),
        ),
    )
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
  const key = (current: CraftState) =>
    JSON.stringify({
      ...current,
      affixes: [...current.affixes].sort((a, b) => compare(a.modId, b.modId)),
    })
  type Node = {
    state: CraftState
    steps: CraftTargetRouteStep[]
    score: number
    risk: number
    boneOmens: number
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
        fracturePriority(state),
      risk: 0,
      boneOmens: 0,
      path: '',
    },
  ]
  const seen = new Map<string, { depth: number; risk: number }>([
    [key(state), { depth: 0, risk: 0 }],
  ])
  const spend = () => {
    if (result.candidateApplications >= 4096) {
      result.truncated = true
      return false
    }
    result.candidateApplications++
    return true
  }
  const actualRolls = (patterns: string[], actual: string[], id?: string) =>
    targetRollsPreservingValues(patterns, actual, id === undefined ? undefined : bounds(id))
  while (
    queue.length &&
    result.routes.length === 0 &&
    result.examinedStates < maxStates &&
    result.candidateApplications < 4096
  ) {
    queue.sort(
      (a, b) =>
        b.score - a.score ||
        a.risk - b.risk ||
        a.boneOmens - b.boneOmens ||
        a.steps.length - b.steps.length ||
        compare(a.path, b.path),
    )
    const node = queue.shift()
    if (!node) break
    const best = seen.get(key(node.state))
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
    const beforeMatched = matched(node.state)
    const beforeImplicit = matchedImplicit(node.state)
    const present = node.state.affixes.filter((a) => accepted.has(a.modId)).map((a) => a.modId)
    const offer = (
      operation: CraftStep,
      atRiskTargetIds: string[] = [],
      fractureCandidateModIds?: string[],
    ) => {
      if (!spend()) return
      const applied = applyCraftStep(catalog, node.state, operation)
      if (!applied.ok) return
      const afterMatched = matched(applied.value)
      if (protectedIds.some((id) => !numericMatched(applied.value).includes(id))) return
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
      const retained = new Set(applied.value.affixes.map((a) => a.modId))
      const lostTargetIds = present.filter((id) => !retained.has(id))
      const risk =
        node.risk +
        atRiskTargetIds.length +
        lostTargetIds.length +
        lostImplicit.length +
        rerolledImplicit.filter((index) => beforeImplicit.includes(index)).length
      const stateKey = key(applied.value)
      const previous = seen.get(stateKey)
      const depth = node.steps.length + 1
      if (
        previous &&
        (previous.depth < depth || (previous.depth === depth && previous.risk <= risk))
      )
        return
      seen.set(stateKey, { depth, risk })
      const step: CraftTargetRouteStep = {
        ...(fractureCandidateModIds ? { fractureCandidateModIds } : {}),
        operation: structuredClone(operation),
        state: applied.value,
        matchedTargetIds: afterMatched,
        gainedTargetIds: afterMatched.filter((id) => !beforeMatched.includes(id)),
        lostTargetIds,
        atRiskTargetIds,
        rerolledTargetIds:
          'currency' in operation && operation.currency === 'divine'
            ? present.filter(
                (id) => !node.state.affixes.find((affix) => affix.modId === id)?.fractured,
              )
            : [],
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
        afterMatched.length === ids.length &&
        afterImplicit.length === implicitValues.length
      ) {
        let current = state
        for (const entry of steps) {
          if (!spend()) return
          const replay = applyCraftStep(catalog, current, entry.operation)
          if (!replay.ok) return
          current = replay.value
        }
        const final = analyzeCraftTargets(
          catalog,
          current,
          ids,
          values,
          alternatives,
          undefined,
          implicitValues,
          fracturedTargetId,
        )
        if (
          !current.pendingDesecration &&
          final.ok &&
          final.value.targets.every((t) => t.matched) &&
          (final.value.implicitTargets ?? []).every((target) => target.matched) &&
          result.routes.length < 3
        )
          result.routes.push({ steps, finalState: current })
      } else
        queue.push({
          state: applied.value,
          steps,
          score:
            afterMatched.length +
            afterImplicit.length +
            bonePriority(applied.value) +
            fracturePriority(applied.value),
          risk,
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
    if (fracturedTargetId && numericMatched(node.state).includes(fracturedTargetId)) {
      const prepared = prepareFracture(catalog, node.state)
      const group = groups[ids.indexOf(fracturedTargetId)] ?? []
      if (prepared.ok)
        for (const affix of prepared.value.candidates)
          if (group.includes(affix.modId) && !prepared.value.unresolvedModIds.includes(affix.modId))
            offer(
              { kind: 'fracture', modId: affix.modId },
              [],
              prepared.value.candidates.map((candidate) => candidate.modId),
            )
    }
    const boneAdvice = analyzeBoneTargets(catalog, node.state, ids, values, alternatives, {
      consumeCandidate: spend,
    })
    if (boneAdvice.ok)
      for (const step of boneAdvice.value) offer(step.operation, step.atRiskTargetIds)
    if (node.state.pendingDesecration) continue
    const blockedBone = groups.some(
      (group, index) =>
        !beforeMatched.includes(ids[index] ?? '') &&
        group.some((id) => byId.get(id)?.desecratedOnly),
    )
    const configs: (CraftOmen | undefined)[] = [
      undefined,
      ...(Object.keys(CRAFT_OMEN_RULES) as CraftOmen[]),
    ]
    for (const omen of configs) {
      const advice =
        omen === undefined && node.steps.length === 0
          ? initial
          : analyzeCraftTargets(
              catalog,
              node.state,
              ids,
              values,
              alternatives,
              omen,
              implicitValues,
              fracturedTargetId,
            )
      if (!advice.ok) continue
      for (const suggestion of advice.value.steps) {
        if (result.routes.length >= 3 || result.candidateApplications >= 4096) break
        const { currency, removeModId } = suggestion
        const prepared = prepareCraftOperation(catalog, node.state, currency, removeModId, omen)
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
          risk = present.filter((id) => pool.value.some((a) => a.modId === id))
        }
        const operation: CraftOperation = {
          currency,
          modIds: [],
          ...(omen ? { omen } : {}),
          ...(removeModId ? { removeModId } : {}),
        }
        if (currency === 'divine') {
          const rolls: NonNullable<CraftOperation['rolls']> = []
          let valid = true
          for (const affix of node.state.affixes) {
            if (affix.fractured) continue
            const mod = byId.get(affix.modId)
            const numbers = mod ? actualRolls(mod.lines, affix.lines, mod.id) : null
            if (numbers === null) {
              valid = false
              break
            }
            if (numbers.length) rolls.push({ modId: affix.modId, values: numbers })
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
              ? actualRolls(patterns, node.state.implicitLines ?? patterns)
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
                Number(accepted.has(b.id)) - Number(accepted.has(a.id)) || compare(a.id, b.id),
            )
          for (const mod of limit(candidates, selected.modIds.length === 0 ? 12 : 6)) {
            const numbers = minimumTargetRolls(mod.lines, bounds(mod.id))
            if (numbers === null) continue
            if (!spend()) return
            const added = addCraftAffix(catalog, current, mod.id, currency, omen)
            if (!added.ok) continue
            fill(added.value, {
              ...selected,
              modIds: [...selected.modIds, mod.id],
              rolls: [
                ...(selected.rolls ?? []),
                ...(numbers.length ? [{ modId: mod.id, values: numbers }] : []),
              ],
            })
            // 点金提供每个首目标的一组合法完整选择，避免排列爆炸。
            if (prepared.value.count > 1) {
              if (candidates.length > 1) omitted()
              break
            }
          }
        }
        fill(prepared.value.state, operation)
      }
    }
    // 精华分析内部的 apply 与本搜索的 apply 均计入同一个独立预算。
    const essenceAdvice = analyzeEssenceTargets(catalog, node.state, ids, values, alternatives, {
      consumeCandidate: spend,
    })
    if (essenceAdvice.ok)
      for (const step of essenceAdvice.value) offer(step.operation, step.atRiskTargetIds)
    // 精华专属目标不在普通新增池；普通单步建议无法提示其阻挡，另列合法剥离准备。
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
        const existing = node.state.affixes.find((affix) => group.includes(affix.modId))
        if (existing?.fractured) return []
        const mod = existing ? byId.get(existing.modId) : undefined
        if (!mod || (divineAvailable && minimumTargetRolls(mod.lines, bounds(mod.id)) !== null))
          return []
        const feasibleReplacement = group.some((id) => {
          const alternative = byId.get(id)
          return (
            alternative !== undefined &&
            alternative.level <= node.state.itemLevel &&
            minimumTargetRolls(alternative.lines, bounds(id)) !== null
          )
        })
        return feasibleReplacement ? [mod.id] : []
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
          const risk = present.filter((id) => pool.value.some((affix) => affix.modId === id))
          for (const removed of pool.value.filter(
            (affix) => blockedEssence || blockedBone || replacementAcceptedIds.has(affix.modId),
          ))
            offer(
              {
                currency: 'annulment',
                modIds: [],
                removeModId: removed.modId,
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
          const numbers = minimumTargetRolls(mod.lines, bounds(mod.id))
          if (numbers !== null)
            offer({
              currency,
              modIds: [mod.id],
              rolls: numbers.length ? [{ modId: mod.id, values: numbers }] : [],
            })
        }
      }
    }
  }
  if (queue.length || result.candidateApplications >= 4096 || result.routes.length >= 3)
    result.truncated = true
  result.routes.sort(
    (a, b) =>
      a.steps.reduce(
        (n, s) =>
          n +
          s.lostTargetIds.length +
          s.atRiskTargetIds.length +
          (s.lostImplicitLineIndexes?.length ?? 0) +
          (s.rerolledImplicitLineIndexes?.length ?? 0),
        0,
      ) -
        b.steps.reduce(
          (n, s) =>
            n +
            s.lostTargetIds.length +
            s.atRiskTargetIds.length +
            (s.lostImplicitLineIndexes?.length ?? 0) +
            (s.rerolledImplicitLineIndexes?.length ?? 0),
          0,
        ) ||
      a.steps.length - b.steps.length ||
      compare(
        JSON.stringify(a.steps.map((s) => s.operation)),
        JSON.stringify(b.steps.map((s) => s.operation)),
      ),
  )
  return { ok: true, value: result }
}
