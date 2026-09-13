import { desecrationCandidates, prepareDesecration } from './boneCraft'
import { type BoneOmenConfig, boneOmenError, isBoneOmenConfig } from './boneOmens'
import { type CraftBone, isCraftBone } from './boneRules'
import type { CraftCatalog } from './catalog'
import { prepareEssenceCraft } from './essenceCraft'
import { type EssenceOmen, isEssenceOmen } from './essenceOmens'
import { essenceCraftMode } from './essences'
import { prepareFracture } from './fracture'
import { type CraftOmen, craftOmenError, isCraftOmen } from './omens'
import {
  CRAFT_CURRENCY_LABELS,
  CRAFT_CURRENCY_RULES,
  type CraftCurrency,
  type CraftResult,
  type CraftState,
  prepareCraftOperation,
  type RemovalCraftCurrency,
  removableCraftAffixes,
} from './rehearsal'

export type CraftStrategyAction =
  | { kind: 'stop' }
  | { kind: 'currency'; currency: CraftCurrency; omen?: CraftOmen }
  | { kind: 'essence'; essenceId: string; omen?: EssenceOmen }
  | ({ kind: 'desecrate'; boneId: CraftBone } & BoneOmenConfig)
  | { kind: 'reveal' }
  | { kind: 'fracture' }
export type CraftStrategyWorkAction = Exclude<CraftStrategyAction, { kind: 'stop' }>
function keys(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  )
}
export function readCraftStrategyAction(value: unknown): CraftStrategyAction | null {
  if (
    !keys(value, ['kind', 'currency', 'omen', 'essenceId', 'boneId', 'directionOmen', 'lichOmen'])
  )
    return null
  if (
    (value.kind === 'stop' || value.kind === 'reveal' || value.kind === 'fracture') &&
    keys(value, ['kind'])
  )
    return { kind: value.kind }
  if (
    value.kind === 'desecrate' &&
    keys(value, ['kind', 'boneId', 'directionOmen', 'lichOmen']) &&
    isCraftBone(value.boneId)
  ) {
    const { kind: _, boneId, ...config } = value
    if (!isBoneOmenConfig(config)) return null
    return boneOmenError(config, boneId) === null ? { kind: 'desecrate', boneId, ...config } : null
  }
  if (
    value.kind === 'essence' &&
    keys(value, ['kind', 'essenceId', 'omen']) &&
    typeof value.essenceId === 'string'
  ) {
    const mode = essenceCraftMode(value.essenceId)
    if (
      mode === null ||
      (Object.hasOwn(value, 'omen') && (!isEssenceOmen(value.omen) || mode !== 'replace'))
    )
      return null
    return {
      kind: 'essence',
      essenceId: value.essenceId,
      ...(isEssenceOmen(value.omen) ? { omen: value.omen } : {}),
    }
  }
  if (
    value.kind !== 'currency' ||
    !keys(value, ['kind', 'currency', 'omen']) ||
    typeof value.currency !== 'string' ||
    !Object.hasOwn(CRAFT_CURRENCY_LABELS, value.currency)
  )
    return null
  const currency = value.currency as CraftCurrency
  if (Object.hasOwn(value, 'omen') && !isCraftOmen(value.omen)) return null
  if (craftOmenError(value.omen, currency) !== null) return null
  return { kind: 'currency', currency, ...(isCraftOmen(value.omen) ? { omen: value.omen } : {}) }
}

/** 这里只检查能否开始，实际随机结果仍由原操作引擎逐项校验。 */
export function checkCraftStrategyAction(
  catalog: CraftCatalog,
  state: CraftState,
  action: CraftStrategyWorkAction,
): CraftResult<null> {
  const ok: CraftResult<null> = { ok: true, value: null }
  if (action.kind === 'essence') {
    const result = prepareEssenceCraft(catalog, state, action.essenceId, action.omen)
    return result.ok ? ok : result
  }
  if (action.kind === 'desecrate') {
    const { kind: _, boneId, ...config } = action
    const result = prepareDesecration(catalog, state, boneId, config)
    if (!result.ok) return result
    return result.value.kinds.length &&
      (!result.value.requiresRemoval || result.value.removableAffixes.length)
      ? ok
      : { ok: false, error: '当前没有合法的亵渎位置或可移除词缀。' }
  }
  if (action.kind === 'reveal') {
    if (!state.pendingDesecration) return { ok: false, error: '当前没有待揭示亵渎。' }
    if (!state.pendingDesecration.options && desecrationCandidates(catalog, state).length < 3)
      return { ok: false, error: '本工具暂不支持不足三项合法揭示候选的情形。' }
    return ok
  }
  if (action.kind === 'fracture') {
    const result = prepareFracture(catalog, state)
    if (!result.ok) return result
    return result.value.candidates.some(
      (affix) => !result.value.unresolvedModIds.includes(affix.modId),
    )
      ? ok
      : { ok: false, error: '所有破裂候选的实际数值均未知，请先核对。' }
  }
  const currencyBase = CRAFT_CURRENCY_RULES[action.currency].base
  if (currencyBase === 'chaos' || currencyBase === 'annulment') {
    const removable = removableCraftAffixes(
      catalog,
      state,
      action.currency as RemovalCraftCurrency,
      action.omen,
    )
    if (!removable.ok) return removable
    const results = removable.value.map((affix) =>
      prepareCraftOperation(catalog, state, action.currency, affix.modId, action.omen),
    )
    if (results.some((result) => result.ok)) return ok
    const failed = results.find((result) => !result.ok)
    return failed && !failed.ok ? failed : { ok: false, error: '当前没有可完成的移除操作。' }
  }
  const result = prepareCraftOperation(catalog, state, action.currency, undefined, action.omen)
  return result.ok ? ok : result
}
