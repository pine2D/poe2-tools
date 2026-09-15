import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CraftCatalog } from './catalog'
import { applyCraftStep, type EssenceCraftOperation } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import { prepareEssenceCraft } from './essenceCraft'
import { ESSENCE_OMEN_RULES, type EssenceOmen } from './essenceOmens'
import { essenceCategory } from './essences'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { specialTargetContext } from './targetDefinitionSpecialContext'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { lostCraftTargetIds } from './targetProgress'
import {
  analyzeCraftTargetContext,
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetsSatisfied,
  validateCraftTargetValues,
} from './targets'

export interface EssenceAdviceStep {
  operation: EssenceCraftOperation
  targetModId: string
  lostTargetIds: string[]
  atRiskTargetIds: string[]
}

export function analyzeEssenceTargetContext(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: {
    consumeCandidate?: () => boolean
    minimumTargetCount?: number
    fracturedTargetId?: string
  } = {},
  definitions?: CraftTargetDefinitions,
): CraftResult<EssenceAdviceStep[]> {
  const native = definitions ? specialTargetContext(catalog, state, definitions) : undefined
  if (Object.hasOwn(state, 'pendingDesecration'))
    return { ok: false, error: PENDING_DESECRATION_MESSAGE }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const validated = native
    ? { ok: true as const, value: values }
    : validateCraftTargetValues(
        catalog,
        state.baseId,
        ids,
        values,
        alternatives,
        state,
        options.minimumTargetCount,
      )
  if (!validated.ok) return validated
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
      return { ok: true, value: [] }
  }
  const groups =
    native?.groups.map((group) => group.modIds) ??
    ids.map((id) => [id, ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? [])])
  const existing = new Set(state.affixes.map((affix) => affix.modId))
  const missing =
    native?.missing ??
    new Set(groups.filter((group) => !group.some((id) => existing.has(id))).flat())
  if (missing.size === 0) return { ok: true, value: [] }
  const present = groups.flat().filter((id) => existing.has(id))
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (base === undefined) return { ok: false, error: '当前基底不在制作目录中。' }
  const category = essenceCategory(base)
  const steps: EssenceAdviceStep[] = []
  const losses = new Map<EssenceCraftOperation, number>()
  const risks = new Map<EssenceCraftOperation, number>()
  for (const essence of catalog.essences ?? []) {
    const modId = Object.hasOwn(essence.mods, category) ? essence.mods[category] : undefined
    if (modId === undefined || !missing.has(modId)) continue
    const original = prepareEssenceCraft(catalog, state, essence.id)
    if (!original.ok) continue
    const defaultNumbers = native
      ? null
      : minimumCraftTargetRolls(
          catalog,
          state,
          original.value.mod,
          values.find((entry) => entry.modId === modId),
        )
    const outcomes = native
      ? native.rolls(state, original.value.mod)
      : defaultNumbers === null
        ? []
        : [defaultNumbers]
    for (const numericValues of outcomes) {
      const omens: (EssenceOmen | undefined)[] =
        original.value.mode === 'upgrade'
          ? [undefined]
          : [undefined, ...(Object.keys(ESSENCE_OMEN_RULES) as EssenceOmen[])]
      for (const omen of omens) {
        const prepared =
          omen === undefined ? original : prepareEssenceCraft(catalog, state, essence.id, omen)
        if (!prepared.ok) continue
        // 定向池是原池的子集；同池配置只增加材料，没有收窄结果。
        if (
          omen !== undefined &&
          prepared.value.removableAffixes.length >= original.value.removableAffixes.length
        )
          continue
        const removable = prepared.value.removableAffixes
        const atRiskTargetIds =
          native?.risk(removable) ??
          present.filter((id) => removable.some((affix) => affix.modId === id))
        for (const removed of prepared.value.mode === 'upgrade' ? [undefined] : removable) {
          const operation: EssenceCraftOperation = {
            kind: 'essence',
            essenceId: essence.id,
            values: [...numericValues],
            ...(omen === undefined ? {} : { omen }),
            ...(removed === undefined ? {} : { removeModId: removed.modId }),
            ...(removed?.affixId === undefined ? {} : { removeAffixId: removed.affixId }),
          }
          // 外层路线搜索共用预算；耗尽后立即停止整个候选遍历。
          if (options.consumeCandidate && !options.consumeCandidate())
            return { ok: true, value: steps }
          const applied = applyCraftStep(catalog, state, operation)
          if (!applied.ok) continue
          if (native) {
            losses.set(operation, native.lost(applied.value).length)
            risks.set(
              operation,
              native.groups.filter((group) =>
                group.modIds.some((id) => atRiskTargetIds.includes(id)),
              ).length,
            )
          }
          steps.push({
            operation,
            targetModId: modId,
            lostTargetIds: native
              ? native.affected(applied.value)
              : lostCraftTargetIds(
                  catalog,
                  state,
                  applied.value,
                  ids,
                  groups,
                  values,
                  options.fracturedTargetId,
                ),
            atRiskTargetIds: [...atRiskTargetIds],
          })
        }
      }
    }
  }
  const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  steps.sort(
    (a, b) =>
      (losses.get(a.operation) ?? a.lostTargetIds.length) -
        (losses.get(b.operation) ?? b.lostTargetIds.length) ||
      (risks.get(a.operation) ?? a.atRiskTargetIds.length) -
        (risks.get(b.operation) ?? b.atRiskTargetIds.length) ||
      Number(a.operation.omen !== undefined) - Number(b.operation.omen !== undefined) ||
      compareId(a.operation.essenceId, b.operation.essenceId) ||
      compareId(a.operation.removeModId ?? '', b.operation.removeModId ?? ''),
  )
  return { ok: true, value: steps }
}

/** 旧入口不接受独立定义，保留原资格与输出合同。 */
export function analyzeEssenceTargets(
  catalog: CraftCatalog,
  state: CraftState,
  ids: readonly string[],
  values: readonly CraftTargetValues[] = [],
  alternatives: readonly CraftTargetAlternative[] = [],
  options: NonNullable<Parameters<typeof analyzeEssenceTargetContext>[5]> = {},
) {
  return analyzeEssenceTargetContext(catalog, state, ids, values, alternatives, options)
}
