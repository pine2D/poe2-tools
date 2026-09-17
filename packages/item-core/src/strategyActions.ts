import { prepareAlloyCraft } from './alloyCraft'
import { desecrationCandidates, prepareDesecration } from './boneCraft'
import { type BoneOmenConfig, boneOmenError, isBoneOmenConfig } from './boneOmens'
import { type CraftBone, isCraftBone } from './boneRules'
import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { type EssenceOmen, isEssenceOmen } from './essenceOmens'
import { essenceCraftMode, inspectEssences } from './essences'
import {
  type ExtractionCraftOperation,
  isExtractionCraftOperation,
  prepareExtractionCraft,
} from './extraction'
import { prepareFluxCraft } from './fluxCraft'
import { FLUXES } from './fluxes'
import { applyFracture, prepareFracture } from './fracture'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { supportedLiquidEmotionId } from './liquidEmotions'
import { prepareMasterworkCraft } from './masterwork'
import { type CraftOmen, craftOmenError, isCraftOmen } from './omens'
import {
  isPerfectFluxCraftOperation,
  type PerfectFluxCraftOperation,
  preparePerfectFluxCraft,
} from './perfectFlux'
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
import { prepareRuneforgeCraft } from './runeforge'
import {
  isSkillSocketsCraftOperation,
  prepareSkillSocketsCraft,
  type SkillSocketsCraftOperation,
} from './skillSockets'
import { CRAFT_STRATEGY_SOCKET_LIMIT } from './strategyConditions'
import { prepareStrategySocket, type SocketStrategyAction } from './strategySockets'

export type CraftStrategyAction =
  | { kind: 'masterwork'; socketIndex: number }
  | { kind: 'runeforge' }
  | ExtractionCraftOperation
  | PerfectFluxCraftOperation
  | SkillSocketsCraftOperation
  | SocketStrategyAction
  | { kind: 'stop' }
  | { kind: 'jump' }
  | { kind: 'currency'; currency: CraftCurrency; omen?: CraftOmen }
  | { kind: 'essence'; essenceId: string; omen?: EssenceOmen }
  | { kind: 'liquid-emotion'; emotionId: string }
  | { kind: 'alloy'; alloyId: string }
  | { kind: 'flux'; fluxId: string }
  | ({ kind: 'desecrate'; boneId: CraftBone } & BoneOmenConfig)
  | { kind: 'reveal' }
  | { kind: 'fracture' }
  | { kind: 'vaal' }
  | { kind: 'architect' }
export type CraftStrategyWorkAction = Exclude<CraftStrategyAction, { kind: 'stop' | 'jump' }>
function keys(value: unknown, allowed: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  )
}
export function readCraftStrategyAction(value: unknown): CraftStrategyAction | null {
  try {
    if (!isPlainProjectJSON(value)) return null
  } catch {
    return null
  }
  if (
    keys(value, ['kind', 'socketIndex']) &&
    value.kind === 'masterwork' &&
    typeof value.socketIndex === 'number' &&
    Number.isSafeInteger(value.socketIndex) &&
    value.socketIndex >= 0 &&
    value.socketIndex < 16
  )
    return { kind: 'masterwork', socketIndex: value.socketIndex }
  if (isExtractionCraftOperation(value)) return { ...value }
  if (isSkillSocketsCraftOperation(value)) return { ...value }
  if (isPerfectFluxCraftOperation(value)) return { ...value }
  if (
    !keys(value, [
      'kind',
      'currency',
      'omen',
      'essenceId',
      'emotionId',
      'alloyId',
      'fluxId',
      'boneId',
      'directionOmen',
      'lichOmen',
      'augmentId',
      'socketIndex',
    ])
  )
    return null
  if (
    (value.kind === 'runeforge' ||
      value.kind === 'stop' ||
      value.kind === 'jump' ||
      value.kind === 'reveal' ||
      value.kind === 'fracture' ||
      value.kind === 'vaal' ||
      value.kind === 'architect' ||
      value.kind === 'artificer') &&
    keys(value, ['kind'])
  )
    return { kind: value.kind }
  if (
    value.kind === 'socket' &&
    keys(value, ['kind', 'augmentId', 'socketIndex']) &&
    typeof value.augmentId === 'string' &&
    value.augmentId.length > 0 &&
    value.augmentId.length <= 512 &&
    (value.socketIndex === 'first-empty' ||
      (typeof value.socketIndex === 'number' &&
        Number.isInteger(value.socketIndex) &&
        value.socketIndex >= 0 &&
        value.socketIndex < CRAFT_STRATEGY_SOCKET_LIMIT))
  )
    return { kind: 'socket', augmentId: value.augmentId, socketIndex: value.socketIndex }
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
    value.kind === 'flux' &&
    keys(value, ['kind', 'fluxId']) &&
    typeof value.fluxId === 'string' &&
    FLUXES.some((flux) => flux.id === value.fluxId)
  )
    return { kind: 'flux', fluxId: value.fluxId }
  if (
    value.kind === 'alloy' &&
    keys(value, ['kind', 'alloyId']) &&
    typeof value.alloyId === 'string' &&
    /^Metadata\/Items\/Currency\/CurrencyVerisiumAlloy(?:[1-9]|1[0-3])$/.test(value.alloyId)
  )
    return { kind: 'alloy', alloyId: value.alloyId }
  if (
    value.kind === 'liquid-emotion' &&
    keys(value, ['kind', 'emotionId']) &&
    typeof value.emotionId === 'string' &&
    supportedLiquidEmotionId(value.emotionId)
  )
    return { kind: 'liquid-emotion', emotionId: value.emotionId }
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
  if (action.kind === 'vaal' || action.kind === 'architect') {
    if (!readCraftStrategyAction(action)) return { ok: false, error: '腐化材料动作只能包含 kind。' }
    const result = applyCraftStep(
      catalog,
      state,
      action.kind === 'vaal'
        ? { kind: 'vaal', outcome: 'unchanged' }
        : { kind: 'architect', outcome: 'destroy' },
    )
    return result.ok ? ok : result
  }
  if (action.kind === 'masterwork') {
    if (!readCraftStrategyAction(action)) return { ok: false, error: '符文升级指引孔位无效。' }
    const result = prepareMasterworkCraft(catalog, state, action.socketIndex)
    return result.ok ? ok : result
  }
  if (action.kind === 'runeforge') {
    if (!readCraftStrategyAction(action)) return { ok: false, error: '锻造策略动作只能包含 kind。' }
    const result = prepareRuneforgeCraft(catalog, state)
    return result.ok ? ok : result
  }
  if (action.kind === 'extraction') {
    if (!isExtractionCraftOperation(action)) return { ok: false, error: '萃取石动作字段无效。' }
    const result = prepareExtractionCraft(catalog, state)
    return result.ok ? ok : result
  }
  if (action.kind === 'skill-sockets') {
    if (!isSkillSocketsCraftOperation(action)) return { ok: false, error: '辅助孔动作字段无效。' }
    const result = prepareSkillSocketsCraft(catalog, state, action.tier, action.previousSockets)
    return result.ok ? ok : result
  }
  if (action.kind === 'perfect-flux') {
    const result = preparePerfectFluxCraft(catalog, state, action.previousMaxLevel)
    return result.ok ? ok : result
  }
  if (action.kind === 'socket' || action.kind === 'artificer') {
    const result = prepareStrategySocket(catalog, state, action)
    return result.ok ? ok : result
  }
  if (action.kind === 'essence') {
    const base = catalog.bases.find((entry) => entry.id === state.baseId)
    if (base) {
      for (const entry of inspectEssences(catalog, base)) {
        if (
          entry.essence.id === action.essenceId &&
          prepareEssenceCraft(catalog, state, action.essenceId, action.omen, entry.resultModId).ok
        )
          return ok
      }
    }
    const result = prepareEssenceCraft(catalog, state, action.essenceId, action.omen)
    return result.ok ? ok : result
  }
  if (action.kind === 'alloy') {
    const result = prepareAlloyCraft(catalog, state, action.alloyId)
    return result.ok ? ok : result
  }
  if (action.kind === 'flux') {
    const result = prepareFluxCraft(catalog, state, action.fluxId)
    return result.ok ? ok : result
  }
  if (action.kind === 'liquid-emotion') {
    const result = prepareLiquidEmotionCraft(catalog, state, action.emotionId)
    if (result.ok) return ok
    for (const kind of ['prefix', 'suffix'] as const)
      if (prepareLiquidEmotionCraft(catalog, state, action.emotionId, kind).ok) return ok
    return result
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
      (affix) =>
        applyFracture(catalog, state, {
          kind: 'fracture',
          modId: affix.modId,
          ...(affix.affixId ? { affixId: affix.affixId } : {}),
        }).ok,
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
      prepareCraftOperation(catalog, state, action.currency, affix, action.omen),
    )
    if (results.some((result) => result.ok)) return ok
    const failed = results.find((result) => !result.ok)
    return failed && !failed.ok ? failed : { ok: false, error: '当前没有可完成的移除操作。' }
  }
  const result = prepareCraftOperation(catalog, state, action.currency, undefined, action.omen)
  return result.ok ? ok : result
}
