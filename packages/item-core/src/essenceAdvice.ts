import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CraftCatalog } from './catalog'
import { applyCraftStep, type EssenceCraftOperation } from './craftSteps'
import { minimumCraftTargetRolls } from './effectiveTargetValues'
import { prepareEssenceCraft } from './essenceCraft'
import { ESSENCE_OMEN_RULES, type EssenceOmen } from './essenceOmens'
import { essenceCategory } from './essences'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { lostCraftTargetIds } from './targetProgress'
import {
  analyzeCraftTargets,
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

export function analyzeEssenceTargets(
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
): CraftResult<EssenceAdviceStep[]> {
  if (Object.hasOwn(state, 'pendingDesecration'))
    return { ok: false, error: PENDING_DESECRATION_MESSAGE }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const validated = validateCraftTargetValues(
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
    const progress = analyzeCraftTargets(
      catalog,
      state,
      ids,
      values,
      alternatives,
      undefined,
      [],
      options.fracturedTargetId,
      options.minimumTargetCount,
    )
    if (!progress.ok) return progress
    if (
      craftTargetsSatisfied(progress.value, options.minimumTargetCount, options.fracturedTargetId)
    )
      return { ok: true, value: [] }
  }
  const groups = ids.map((id) => [
    id,
    ...(alternatives.find((entry) => entry.targetModId === id)?.modIds ?? []),
  ])
  const existing = new Set(state.affixes.map((affix) => affix.modId))
  const missing = new Set(groups.filter((group) => !group.some((id) => existing.has(id))).flat())
  if (missing.size === 0) return { ok: true, value: [] }
  const present = groups.flat().filter((id) => existing.has(id))
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (base === undefined) return { ok: false, error: '当前基底不在制作目录中。' }
  const category = essenceCategory(base)
  const steps: EssenceAdviceStep[] = []
  for (const essence of catalog.essences ?? []) {
    const modId = Object.hasOwn(essence.mods, category) ? essence.mods[category] : undefined
    if (modId === undefined || !missing.has(modId)) continue
    const original = prepareEssenceCraft(catalog, state, essence.id)
    if (!original.ok) continue
    const numericValues = minimumCraftTargetRolls(
      catalog,
      state,
      original.value.mod,
      values.find((entry) => entry.modId === modId),
    )
    if (numericValues === null) continue
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
      const atRiskTargetIds = present.filter((id) => removable.some((affix) => affix.modId === id))
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
        steps.push({
          operation,
          targetModId: modId,
          lostTargetIds: lostCraftTargetIds(
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
  const compareId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  steps.sort(
    (a, b) =>
      a.lostTargetIds.length - b.lostTargetIds.length ||
      a.atRiskTargetIds.length - b.atRiskTargetIds.length ||
      Number(a.operation.omen !== undefined) - Number(b.operation.omen !== undefined) ||
      compareId(a.operation.essenceId, b.operation.essenceId) ||
      compareId(a.operation.removeModId ?? '', b.operation.removeModId ?? ''),
  )
  return { ok: true, value: steps }
}
