import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import { analyzeEssenceTargetContext, type EssenceAdviceStep } from './essenceAdvice'
import { essenceCategory, essenceCraftMode, essenceSourceHash } from './essences'
import { craftModsConflict } from './modConflicts'
import {
  type CraftOperation,
  type CraftResult,
  type CraftState,
  craftCandidates,
  prepareCraftOperation,
} from './rehearsal'
import { specialTargetContext } from './targetDefinitionSpecialContext'
import type { CraftTargetDefinitions } from './targetDefinitions'
import {
  analyzeCraftTargetContext,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
} from './targets'

export interface EssencePreparationRoute {
  preparations: CraftOperation[]
  final: EssenceAdviceStep
}

export interface EssencePreparationAdvice {
  routes: EssencePreparationRoute[]
  examinedStates: number
  truncated: boolean
}

const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 只搜索真实通货结果；所有目标共用 128 个候选准备状态的确定性预算。 */
export function analyzeEssencePreparationContext(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: { minimumTargetCount?: number; fracturedTargetId?: string } = {},
  definitions?: CraftTargetDefinitions,
): CraftResult<EssencePreparationAdvice> {
  const native = definitions ? specialTargetContext(catalog, state, definitions) : undefined
  const direct = analyzeEssenceTargetContext(
    catalog,
    state,
    ids,
    values,
    alternatives,
    options,
    definitions,
  )
  if (!direct.ok) return direct
  const result: EssencePreparationAdvice = { routes: [], examinedStates: 0, truncated: false }
  if (options.minimumTargetCount !== undefined) {
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
        : craftTargetsSatisfied(
            progress.value,
            options.minimumTargetCount,
            options.fracturedTargetId,
          )
    )
      return { ok: true, value: result }
  }
  if (
    state.rarity === 'rare' ||
    state.affixes.some((affix) => affix.crafted) ||
    essenceSourceHash(catalog) === null
  )
    return { ok: true, value: result }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (base === undefined) return { ok: false, error: '当前基底不在制作目录中。' }
  const byId = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  const groups =
    native?.groups.map((group) => group.modIds) ??
    ids.map((id) => [id, ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? [])])
  const present = new Set(state.affixes.map((affix) => affix.modId))
  const missing =
    native?.missing ??
    new Set(groups.filter((group) => !group.some((id) => present.has(id))).flat())
  const directIds = new Set(direct.value.map((step) => step.targetModId))
  const accepted = new Set(groups.flat())
  const category = essenceCategory(base)
  const targets = [...missing]
    .filter((id) => {
      const mod = byId.get(id)
      return (
        !directIds.has(id) &&
        mod !== undefined &&
        mod.level <= state.itemLevel &&
        !state.affixes.some((affix) => {
          const existing = byId.get(affix.modId)
          return existing !== undefined && craftModsConflict(existing, mod)
        }) &&
        (native
          ? native.rolls(state, mod).length > 0
          : minimumCraftTargetRolls(
              catalog,
              state,
              mod,
              values.find((entry) => entry.modId === id),
            ) !== null) &&
        (catalog.essences ?? []).some(
          (essence) =>
            Object.hasOwn(essence.mods, category) &&
            essence.mods[category] === id &&
            essenceCraftMode(essence.id) !== null,
        )
      )
    })
    .sort(compareId)
  // 同一路径的真实结果跨目标复用；失败的 apply 也占预算，避免无法计数的重试。
  const states = new Map<string, CraftResult<CraftState>>()
  for (const targetId of targets) {
    const target = byId.get(targetId)
    if (target === undefined) continue
    const modes = new Set(
      (catalog.essences ?? [])
        .filter(
          (essence) => Object.hasOwn(essence.mods, category) && essence.mods[category] === targetId,
        )
        .map((essence) => essenceCraftMode(essence.id)),
    )
    const search = (
      current: CraftState,
      preparations: CraftOperation[],
    ): EssencePreparationRoute | null => {
      if (
        preparations.length > 0 &&
        (current.rarity === 'rare' ? modes.has('replace') : modes.has('upgrade'))
      ) {
        const final = analyzeEssenceTargetContext(
          catalog,
          current,
          ids,
          values,
          alternatives,
          options,
          definitions,
        )
        if (final.ok) {
          const selected = final.value.find((step) => step.targetModId === targetId)
          if (selected !== undefined)
            return { preparations: structuredClone(preparations), final: structuredClone(selected) }
        }
      }
      if (current.rarity === 'rare' || (current.rarity === 'magic' && !modes.has('replace')))
        return null
      const currency = current.rarity === 'normal' ? 'transmutation' : 'regal'
      const prepared = prepareCraftOperation(catalog, current, currency)
      if (!prepared.ok || prepared.value.count !== 1) return null
      const candidates = craftCandidates(catalog, prepared.value.state, currency)
        .filter((mod) => !craftModsConflict(mod, target))
        .sort(
          (a, b) =>
            Number(accepted.has(b.id)) - Number(accepted.has(a.id)) || compareId(a.id, b.id),
        )
      for (const mod of candidates) {
        const defaultRolls = native
          ? null
          : minimumCraftTargetRolls(
              catalog,
              current,
              mod,
              values.find((entry) => entry.modId === mod.id),
            )
        const outcomes = native
          ? native.rolls(current, mod)
          : defaultRolls === null
            ? []
            : [defaultRolls]
        for (const rolls of outcomes) {
          const operation: CraftOperation = {
            currency,
            modIds: [mod.id],
            rolls: [{ modId: mod.id, values: rolls }],
          }
          const path = [...preparations, operation]
          const key = JSON.stringify(path)
          let applied = states.get(key)
          if (applied === undefined) {
            if (result.examinedStates >= 128) {
              result.truncated = true
              return null
            }
            result.examinedStates += 1
            applied = applyCraftStep(catalog, current, operation)
            states.set(key, applied)
          }
          if (!applied.ok) continue
          const added = applied.value.affixes.at(-1)
          if (!added || added.modId !== mod.id) continue
          if (added.affixId !== undefined)
            operation.rolls = [{ modId: mod.id, affixId: added.affixId, values: rolls }]
          const found = search(applied.value, path)
          if (found !== null) return found
          if (result.truncated) return null
        }
      }
      return null
    }
    const route = search(state, [])
    if (route !== null) result.routes.push(route)
  }
  return { ok: true, value: result }
}

/** 旧入口不接受独立定义，保留原资格与输出合同。 */
export function analyzeEssencePreparation(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: NonNullable<Parameters<typeof analyzeEssencePreparationContext>[5]> = {},
) {
  return analyzeEssencePreparationContext(catalog, state, ids, values, alternatives, options)
}
