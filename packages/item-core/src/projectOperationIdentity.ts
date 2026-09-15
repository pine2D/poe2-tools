import { craftAffixIdentityError, resolveCraftAffix } from './affixIdentity'
import type { CraftCatalog } from './catalog'
import { replayVaalReplacements } from './corruptionReroll'
import type { VaalReplacement } from './corruptionRules'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface UpgradedProjectOperation {
  operation: CraftStep
  afterState: CraftState
}

/** 仅用于迁移前后的语义核对，保留顺序及其他所有状态字段。 */
export function projectStateWithoutIdentity(state: CraftState): CraftState {
  const { nextAffixId: _, ...rest } = state
  return { ...rest, affixes: state.affixes.map(({ affixId: _, ...affix }) => affix) }
}

/** 先检查原操作整棵树，不能通过克隆或字段归一化抹掉身份注入。 */
function legacyOperationError(operation: unknown): string | null {
  const pending = [operation]
  const seen = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === undefined) return '旧操作不能包含显式 undefined。'
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue
    if (typeof value === 'number' && Number.isFinite(value)) continue
    if (typeof value !== 'object') return '旧操作必须由合法 JSON 字段组成。'
    if (seen.has(value)) continue
    seen.add(value)
    if (['affixId', 'removeAffixId', 'nextAffixId'].some((key) => Object.hasOwn(value, key)))
      return '旧操作不能包含词缀实例身份字段。'
    pending.push(...Object.values(value))
  }
  return null
}

function existingId(state: CraftState, modId: string): CraftResult<string> {
  const selected = resolveCraftAffix(state, { modId })
  if (!selected.ok) return selected
  const id = selected.value.affix.affixId
  return id === undefined
    ? { ok: false, error: '项目操作迁移需要已启用身份的步骤前状态。' }
    : { ok: true, value: id }
}

/** 仅迁移已确定的旧操作结果；项目原版本、来源和全历史检查仍由项目入口负责。 */
export function upgradeProjectOperationIdentity(
  catalog: CraftCatalog,
  before: CraftState,
  operation: CraftStep,
): CraftResult<UpgradedProjectOperation> {
  const inputError = legacyOperationError(operation)
  if (inputError) return { ok: false, error: inputError }
  const checked = createCraftState(catalog, before)
  if (!checked.ok) return checked
  if (checked.value.nextAffixId === undefined)
    return { ok: false, error: '项目操作迁移需要已启用身份的步骤前状态。' }

  const legacyBefore = projectStateWithoutIdentity(checked.value)
  const legacy = applyCraftStep(catalog, legacyBefore, operation)
  if (!legacy.ok) return legacy

  let upgraded = structuredClone(operation)
  if ('kind' in upgraded && upgraded.kind === 'vaal' && upgraded.outcome === 'reroll') {
    const replacements: VaalReplacement[] = []
    let current = checked.value
    for (const entry of upgraded.replacements) {
      const selected = existingId(current, entry.removeModId)
      if (!selected.ok) return selected
      const replacement = { ...entry, removeAffixId: selected.value }
      const next = replayVaalReplacements(catalog, current, [replacement])
      if (!next.ok) return next
      replacements.push(replacement)
      current = next.value
    }
    upgraded = { ...upgraded, replacements }
  } else if ('kind' in upgraded && upgraded.kind === 'fracture') {
    const selected = existingId(checked.value, upgraded.modId)
    if (!selected.ok) return selected
    upgraded = { ...upgraded, affixId: selected.value }
  } else {
    if ('removeModId' in upgraded && upgraded.removeModId !== undefined) {
      const selected = existingId(checked.value, upgraded.removeModId)
      if (!selected.ok) return selected
      upgraded = { ...upgraded, removeAffixId: selected.value }
    }
    if ('currency' in upgraded && upgraded.rolls !== undefined) {
      // 完整预演复用真实准备、追加及重掷顺序；同类型替换的 rolls 指向新生实例。
      const preview = applyCraftStep(catalog, checked.value, upgraded)
      if (!preview.ok) return preview
      for (const roll of upgraded.rolls) {
        const selected = existingId(preview.value, roll.modId)
        if (!selected.ok) return selected
        roll.affixId = selected.value
      }
    }
  }

  // 从同一个 before 回放，预演不会累加实际分配游标。
  const after = applyCraftStep(catalog, checked.value, upgraded)
  if (!after.ok) return after
  const identityError = craftAffixIdentityError(after.value)
  if (identityError) return { ok: false, error: identityError }
  return { ok: true, value: { operation: upgraded, afterState: after.value } }
}
