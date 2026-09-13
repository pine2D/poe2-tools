import { applyBoneCraft, desecrationCandidates, prepareDesecration } from './boneCraft'
import {
  BONE_DIRECTION_OMEN_RULES,
  BONE_LICH_OMEN_RULES,
  type BoneDirectionOmen,
  type BoneLichOmen,
  type BoneOmenConfig,
  matchesBoneLich,
} from './boneOmens'
import { BONE_RULES, type BoneCraftOperation, type CraftBone } from './boneRules'
import type { CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { minimumTargetRolls } from './targetRolls'
import { analyzeCraftTargets, type CraftTargetAlternative, type CraftTargetValues } from './targets'

export interface CraftBoneAdviceStep {
  operation: BoneCraftOperation
  targetModIds: string[]
  atRiskTargetIds: string[]
  lostTargetIds: string[]
  randomRemovalRisk: boolean
}
export interface CraftBoneAdviceOptions {
  consumeCandidate?: () => boolean
}
/** 每项是独立的真实原子操作；内部证明也消费调用方共享预算。 */
export function analyzeBoneTargets(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: CraftBoneAdviceOptions = {},
): CraftResult<CraftBoneAdviceStep[]> {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== 'consumeCandidate') ||
    (options.consumeCandidate !== undefined && typeof options.consumeCandidate !== 'function')
  )
    return { ok: false, error: '骨骼建议配置无效。' }
  const analysis = analyzeCraftTargets(catalog, state, ids, values, alternatives)
  if (!analysis.ok) return analysis
  const accepted = new Set([...ids, ...alternatives.flatMap((entry) => entry.modIds)])
  const missing = new Set(
    analysis.value.targets
      .filter((target) => !target.matched)
      .flatMap((target) => (target.alternatives ?? [target]).map((member) => member.modId)),
  )
  const present = state.affixes
    .filter((affix) => accepted.has(affix.modId))
    .map((affix) => affix.modId)
  const bounds = (id: string) => values.find((value) => value.modId === id)?.bounds
  let exhausted = false
  const apply = (current: CraftState, operation: BoneCraftOperation): CraftState | null => {
    if (exhausted || (options.consumeCandidate && !options.consumeCandidate())) {
      exhausted = true
      return null
    }
    const next = applyBoneCraft(catalog, current, operation)
    return next.ok ? next.value : null
  }
  const result: CraftBoneAdviceStep[] = []
  const push = (
    operation: BoneCraftOperation,
    next: CraftState,
    targets: string[],
    risk: string[] = [],
  ) =>
    result.push({
      operation,
      targetModIds: targets,
      atRiskTargetIds: risk,
      lostTargetIds: present.filter((id) => !next.affixes.some((affix) => affix.modId === id)),
      randomRemovalRisk: operation.kind === 'desecrate' && operation.removeModId !== undefined,
    })
  const reveal = (current: CraftState, id: string, useTarget: boolean) => {
    const mod = catalog.modifiers.find((mod) => mod.id === id)
    const numbers = mod ? minimumTargetRolls(mod.lines, useTarget ? bounds(id) : undefined) : null
    if (numbers === null) return null
    const operation: BoneCraftOperation = { kind: 'desecration-reveal', modId: id, values: numbers }
    const next = apply(current, operation)
    return next ? { operation, next } : null
  }
  const pending = state.pendingDesecration
  const offers = (
    current: CraftState,
    requireTarget: boolean,
    eligible = missing,
    kind: 'desecration-offer' | 'desecration-reroll' = 'desecration-offer',
  ) => {
    const candidates = desecrationCandidates(catalog, current)
    if (candidates.length < 3) return []
    const targets = candidates.filter(
      (mod) => eligible.has(mod.id) && minimumTargetRolls(mod.lines, bounds(mod.id)) !== null,
    )
    if (requireTarget && !targets.length) return []
    const seeds = targets.length ? targets : candidates.slice(0, 1)
    const seen = new Set<string>()
    return seeds.flatMap((mod) => {
      const modIds = [
        mod.id,
        ...candidates
          .filter((other) => other.id !== mod.id)
          .slice(0, 2)
          .map((other) => other.id),
      ]
      const key = [...modIds].sort().join('\n')
      if (seen.has(key)) return []
      seen.add(key)
      return [
        {
          operation: { kind, modIds },
          target: targets.some((target) => target.id === mod.id) ? mod.id : null,
        },
      ]
    })
  }
  if (pending?.options) {
    if (pending.revealOmen && !pending.rerollOptions) {
      const needsReroll = new Set(
        analysis.value.targets
          .filter((target) => {
            if (target.matched) return false
            return !(target.alternatives ?? [target]).some((member) => {
              const mod = catalog.modifiers.find((mod) => mod.id === member.modId)
              return (
                pending.options?.includes(member.modId) &&
                mod &&
                minimumTargetRolls(mod.lines, bounds(member.modId)) !== null
              )
            })
          })
          .flatMap((target) => (target.alternatives ?? [target]).map((member) => member.modId)),
      )
      for (const proposal of offers(state, true, needsReroll, 'desecration-reroll')) {
        const next = apply(state, proposal.operation)
        if (next) push(proposal.operation, next, proposal.target ? [proposal.target] : [])
        if (exhausted) break
      }
    }
    for (const id of [...new Set([...pending.options, ...(pending.rerollOptions ?? [])])].sort(
      (a, b) => Number(missing.has(b)) - Number(missing.has(a)),
    )) {
      const targeted = reveal(state, id, true)
      const completed = targeted ?? (!exhausted ? reveal(state, id, false) : null)
      if (completed)
        push(completed.operation, completed.next, missing.has(id) && targeted ? [id] : [])
      if (exhausted) break
    }
    return { ok: true, value: result }
  }
  if (pending) {
    for (const proposal of offers(state, false)) {
      const next = apply(state, proposal.operation)
      if (next) push(proposal.operation, next, proposal.target ? [proposal.target] : [])
      if (exhausted) break
    }
    return { ok: true, value: result }
  }
  if (!missing.size || state.rarity !== 'rare') return { ok: true, value: [] }
  const targetMods = catalog.modifiers.filter((mod) => missing.has(mod.id))
  const directions = (Object.keys(BONE_DIRECTION_OMEN_RULES) as BoneDirectionOmen[]).filter(
    (omen) => targetMods.some((mod) => mod.kind === BONE_DIRECTION_OMEN_RULES[omen].kind),
  )
  const liches = (Object.keys(BONE_LICH_OMEN_RULES) as BoneLichOmen[]).filter((omen) =>
    targetMods.some((mod) => matchesBoneLich(mod, omen)),
  )
  const configs: BoneOmenConfig[] = [
    {},
    ...directions.map((directionOmen) => ({ directionOmen })),
    ...liches.map((lichOmen) => ({ lichOmen })),
    ...directions.flatMap((directionOmen) =>
      liches.map((lichOmen) => ({ directionOmen, lichOmen })),
    ),
  ]
  for (const config of configs) {
    for (const boneId of Object.keys(BONE_RULES) as CraftBone[]) {
      const prepared = prepareDesecration(catalog, state, boneId, config)
      if (!prepared.ok) continue
      if (config.directionOmen) {
        const withoutDirection = prepareDesecration(
          catalog,
          state,
          boneId,
          config.lichOmen ? { lichOmen: config.lichOmen } : {},
        )
        if (
          withoutDirection.ok &&
          JSON.stringify([...withoutDirection.value.kinds].sort()) ===
            JSON.stringify([...prepared.value.kinds].sort()) &&
          JSON.stringify(
            withoutDirection.value.removableAffixes.map((affix) => affix.modId).sort(),
          ) === JSON.stringify(prepared.value.removableAffixes.map((affix) => affix.modId).sort())
        )
          continue
      }
      const removals = prepared.value.requiresRemoval
        ? prepared.value.removableAffixes.map((affix) => affix.modId)
        : [undefined]
      const risk = prepared.value.removableAffixes
        .filter((affix) => accepted.has(affix.modId))
        .map((affix) => affix.modId)
      for (const removeModId of removals) {
        for (const affixKind of prepared.value.kinds) {
          const operation: BoneCraftOperation = {
            kind: 'desecrate',
            ...config,
            boneId,
            affixKind,
            ...(removeModId === undefined ? {} : { removeModId }),
          }
          const next = apply(state, operation)
          if (!next) continue
          for (const proposal of offers(next, true)) {
            if (!proposal.target) continue
            const offered = apply(next, proposal.operation)
            const completed = offered ? reveal(offered, proposal.target, true) : null
            if (completed) {
              push(operation, next, [proposal.target], risk)
              break
            }
            if (exhausted) break
          }
        }
        if (exhausted) break
      }
      if (exhausted) break
    }
    if (exhausted) break
  }
  return { ok: true, value: result }
}
