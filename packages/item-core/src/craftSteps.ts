import { appendCraftAffix, craftAffixIdentityError, resolveCraftAffix } from './affixIdentity'
import { prepareAlloyCraft } from './alloyCraft'
import {
  type ArchitectCraftOperation,
  applyArchitect,
  DESTROYED_ITEM_MESSAGE,
  isArchitectCraftOperation,
} from './architect'
import { applyBoneCraft } from './boneCraft'
import {
  type BoneCraftOperation,
  isBoneCraftOperation,
  isBoneOperationKind,
  PENDING_DESECRATION_MESSAGE,
} from './boneRules'
import type { CraftCatalog } from './catalog'
import { corruptionCandidates } from './corruptionEnchantments'
import { replayVaalReplacements } from './corruptionReroll'
import {
  CORRUPTED_CRAFT_MESSAGE,
  isVaalCraftOperation,
  type VaalCraftOperation,
} from './corruptionRules'
import { prepareEssenceCraft } from './essenceCraft'
import { type EssenceOmen, isEssenceOmen } from './essenceOmens'
import {
  applyExtractionCraft,
  type ExtractionCraftOperation,
  isExtractionCraftOperation,
} from './extraction'
import { applyFluxCraft, type FluxCraftOperation, isFluxCraftOperation } from './fluxCraft'
import { applyFracture, type FractureCraftOperation, isFractureCraftOperation } from './fracture'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { renderNumericLines } from './numeric'
import {
  applyPerfectFluxCraft,
  isPerfectFluxCraftOperation,
  type PerfectFluxCraftOperation,
} from './perfectFlux'
import {
  applyCraftOperation,
  type CraftAffix,
  type CraftOperation,
  type CraftResult,
  type CraftState,
  createCraftState,
} from './rehearsal'
import {
  applyRuneforgeCraft,
  isRuneforgeCraftOperation,
  type RuneforgeCraftOperation,
} from './runeforge'
import { artificerSocketLimit, socketCandidates, socketCapacity } from './sockets'

export interface ArtificerCraftOperation {
  kind: 'artificer'
}

export interface SocketCraftOperation {
  kind: 'socket'
  socketIndex: number
  augmentId: string
}

export interface EssenceCraftOperation {
  kind: 'essence'
  essenceId: string
  omen?: EssenceOmen
  removeModId?: string
  removeAffixId?: string
  values: number[]
}

export interface LiquidEmotionCraftOperation {
  kind: 'liquid-emotion'
  emotionId: string
  resultKind?: 'prefix' | 'suffix'
  removeModId: string
  removeAffixId?: string
  values: number[]
}

export interface AlloyCraftOperation {
  kind: 'alloy'
  alloyId: string
  removeModId: string
  removeAffixId?: string
  values: number[]
}

export function isAlloyCraftOperation(value: unknown): value is AlloyCraftOperation {
  return (
    record(value) &&
    value.kind === 'alloy' &&
    onlyKeys(value, ['kind', 'alloyId', 'removeModId', 'removeAffixId', 'values']) &&
    (!Object.hasOwn(value, 'removeAffixId') ||
      (typeof value.removeAffixId === 'string' && value.removeAffixId.length > 0)) &&
    typeof value.alloyId === 'string' &&
    value.alloyId.length > 0 &&
    typeof value.removeModId === 'string' &&
    value.removeModId.length > 0 &&
    Array.isArray(value.values) &&
    value.values.length <= 32 &&
    value.values.every((number) => typeof number === 'number' && Number.isFinite(number))
  )
}

export type CraftStep =
  | RuneforgeCraftOperation
  | ExtractionCraftOperation
  | PerfectFluxCraftOperation
  | FluxCraftOperation
  | AlloyCraftOperation
  | ArchitectCraftOperation
  | VaalCraftOperation
  | FractureCraftOperation
  | BoneCraftOperation
  | EssenceCraftOperation
  | LiquidEmotionCraftOperation
  | CraftOperation
  | SocketCraftOperation
  | ArtificerCraftOperation

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

/** 先从完整状态定位，再检查可移除池；候选筛选不能消除实例歧义。 */
function removeGuaranteedAffix(
  state: CraftState,
  removable: CraftAffix[],
  step: { removeModId?: string; removeAffixId?: string },
): CraftResult<CraftState> {
  if (typeof step.removeModId !== 'string')
    return { ok: false, error: '必须选择合法的可移除词缀。' }
  const selected = resolveCraftAffix(state, {
    modId: step.removeModId,
    ...(Object.hasOwn(step, 'removeAffixId') ? { affixId: step.removeAffixId } : {}),
  })
  if (!selected.ok) return selected
  const { affix, index } = selected.value
  if (
    !removable.some((candidate) =>
      affix.affixId === undefined
        ? candidate.modId === affix.modId
        : candidate.affixId === affix.affixId,
    )
  )
    return { ok: false, error: '必须选择合法的可移除词缀。' }
  return { ok: true, value: { ...state, affixes: state.affixes.filter((_, i) => i !== index) } }
}

/** 在独立镶嵌层和原通货引擎间严格分发，未来 kind 不能退化为通货操作。 */
export function applyCraftStep(
  catalog: CraftCatalog,
  state: CraftState,
  step: CraftStep,
): CraftResult<CraftState> {
  if (!record(step)) return { ok: false, error: '制作步骤必须是对象。' }
  const identityError = craftAffixIdentityError(state)
  if (identityError) return { ok: false, error: identityError }
  if (Object.hasOwn(state, 'destroyed')) return { ok: false, error: DESTROYED_ITEM_MESSAGE }
  if ('kind' in step && step.kind === 'runeforge')
    return isRuneforgeCraftOperation(step)
      ? applyRuneforgeCraft(catalog, state, step)
      : { ok: false, error: '锻造步骤字段无效。' }
  if ('kind' in step && step.kind === 'extraction')
    return isExtractionCraftOperation(step)
      ? applyExtractionCraft(catalog, state, step)
      : { ok: false, error: '萃取石步骤字段无效。' }
  if ('kind' in step && step.kind === 'perfect-flux')
    return isPerfectFluxCraftOperation(step)
      ? applyPerfectFluxCraft(catalog, state, step)
      : { ok: false, error: '完美溶剂步骤字段无效。' }
  if ('kind' in step && step.kind === 'flux')
    return isFluxCraftOperation(step)
      ? applyFluxCraft(catalog, state, step)
      : { ok: false, error: '溶剂步骤字段无效。' }
  if ('kind' in step && step.kind === 'architect')
    return isArchitectCraftOperation(step)
      ? applyArchitect(catalog, state, step)
      : { ok: false, error: '建筑师结果步骤字段无效。' }
  if (state.corrupted && (!('kind' in step) || step.kind !== 'socket'))
    return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  if ('kind' in step && step.kind === 'vaal') {
    if (!isVaalCraftOperation(step)) return { ok: false, error: '瓦尔结果步骤字段无效。' }
    const checked = createCraftState(catalog, state)
    if (!checked.ok) return checked
    if (state.pendingDesecration) return { ok: false, error: '待揭示亵渎的腐化结果尚未支持。' }
    if (step.outcome === 'reroll') {
      const rerolled = replayVaalReplacements(catalog, checked.value, step.replacements)
      return rerolled.ok
        ? createCraftState(catalog, { ...rerolled.value, corrupted: true })
        : rerolled
    }
    const next: CraftState = { ...checked.value, corrupted: true }
    if (step.outcome === 'enchant') {
      const mod = corruptionCandidates(catalog, state).find((entry) => entry.id === step.modId)
      if (!mod) return { ok: false, error: '请选择当前可用的普通腐化属性。' }
      const rendered = renderNumericLines(mod.lines, step.values)
      if (!rendered.ok) return rendered
      next.corruption = { modId: mod.id, lines: rendered.value }
    }
    if (step.outcome === 'socket') {
      if (next.sockets === undefined)
        return { ok: false, error: '腐化加孔前必须明确当前已有孔位。' }
      if (
        socketCapacity(catalog, next) === 0 ||
        next.sockets.length >= socketCapacity(catalog, next)
      )
        return { ok: false, error: '当前基底或特殊孔位不支持腐化增加一孔。' }
      next.sockets.push(null)
    }
    return createCraftState(catalog, next)
  }
  if ('kind' in step && isBoneOperationKind(step.kind)) {
    return isBoneCraftOperation(step)
      ? applyBoneCraft(catalog, state, step)
      : { ok: false, error: '骨骼或揭示操作字段无效。' }
  }
  if ('kind' in step && step.kind === 'fracture')
    return isFractureCraftOperation(step)
      ? applyFracture(catalog, state, step)
      : { ok: false, error: '破裂操作字段无效。' }
  if (
    Object.hasOwn(state, 'pendingDesecration') &&
    !('kind' in step && step.kind === 'liquid-emotion')
  )
    return { ok: false, error: PENDING_DESECRATION_MESSAGE }
  if ('kind' in step) {
    if (step.kind === 'alloy') {
      if (!isAlloyCraftOperation(step)) return { ok: false, error: '合金步骤字段无效。' }
      const prepared = prepareAlloyCraft(catalog, state, step.alloyId)
      if (!prepared.ok) return prepared
      const remaining = removeGuaranteedAffix(state, prepared.value.removableAffixes, step)
      if (!remaining.ok) return remaining
      const rendered = renderNumericLines(prepared.value.mod.lines, step.values)
      if (!rendered.ok) return rendered
      const appended = appendCraftAffix(remaining.value, {
        modId: prepared.value.mod.id,
        lines: rendered.value,
        crafted: true,
      })
      return appended.ok ? createCraftState(catalog, appended.value) : appended
    }
    if (step.kind === 'liquid-emotion') {
      if (
        !onlyKeys(step, [
          'kind',
          'emotionId',
          'removeModId',
          'removeAffixId',
          'values',
          'resultKind',
        ]) ||
        (Object.hasOwn(step, 'resultKind') &&
          step.resultKind !== 'prefix' &&
          step.resultKind !== 'suffix') ||
        typeof step.emotionId !== 'string' ||
        typeof step.removeModId !== 'string' ||
        !Array.isArray(step.values) ||
        step.values.length > 32 ||
        !step.values.every((value) => typeof value === 'number' && Number.isFinite(value))
      )
        return { ok: false, error: '液态情感步骤字段无效。' }
      const prepared = prepareLiquidEmotionCraft(
        catalog,
        state,
        step.emotionId,
        step.resultKind === 'prefix' || step.resultKind === 'suffix' ? step.resultKind : undefined,
      )
      if (!prepared.ok) return prepared
      const remaining = removeGuaranteedAffix(state, prepared.value.removableAffixes, step)
      if (!remaining.ok) return remaining
      const rendered = renderNumericLines(prepared.value.mod.lines, step.values)
      if (!rendered.ok) return rendered
      const appended = appendCraftAffix(remaining.value, {
        modId: prepared.value.mod.id,
        lines: rendered.value,
        crafted: true,
      })
      return appended.ok ? createCraftState(catalog, appended.value) : appended
    }
    if (step.kind === 'essence') {
      if (
        !onlyKeys(step, ['kind', 'essenceId', 'values', 'removeModId', 'removeAffixId', 'omen']) ||
        (Object.hasOwn(step, 'omen') && !isEssenceOmen(step.omen)) ||
        typeof step.essenceId !== 'string' ||
        !Array.isArray(step.values) ||
        step.values.length > 32 ||
        !step.values.every((value) => typeof value === 'number' && Number.isFinite(value))
      )
        return { ok: false, error: '精华步骤字段无效。' }
      const prepared = prepareEssenceCraft(
        catalog,
        state,
        step.essenceId,
        isEssenceOmen(step.omen) ? step.omen : undefined,
      )
      if (!prepared.ok) return prepared
      if (
        prepared.value.mode === 'upgrade'
          ? Object.hasOwn(step, 'removeModId') || Object.hasOwn(step, 'removeAffixId')
          : typeof step.removeModId !== 'string' ||
            !prepared.value.removableAffixes.some((affix) => affix.modId === step.removeModId)
      )
        return { ok: false, error: '升级精华不能指定移除；替换精华必须选择合法的移除词缀。' }
      const remaining =
        prepared.value.mode === 'upgrade'
          ? { ok: true as const, value: state }
          : removeGuaranteedAffix(state, prepared.value.removableAffixes, step)
      if (!remaining.ok) return remaining
      const rendered = renderNumericLines(prepared.value.mod.lines, step.values)
      if (!rendered.ok) return rendered
      const appended = appendCraftAffix(
        { ...remaining.value, rarity: 'rare' },
        { modId: prepared.value.mod.id, lines: rendered.value, crafted: true },
      )
      return appended.ok ? createCraftState(catalog, appended.value) : appended
    }
    if (step.kind === 'artificer') {
      if (!onlyKeys(step, ['kind'])) return { ok: false, error: '巧匠石步骤字段无效。' }
      const checked = createCraftState(catalog, state)
      if (!checked.ok) return checked
      const sockets = checked.value.sockets
      if (sockets === undefined) return { ok: false, error: '必须先明确装备当前的孔位。' }
      const limit = artificerSocketLimit(catalog, checked.value)
      if (limit === 0) return { ok: false, error: '当前装备暂不支持巧匠石打孔。' }
      if (sockets.length >= limit)
        return { ok: false, error: `巧匠石最多为该基底提供 ${limit} 个孔，当前已有孔已达上限。` }
      sockets.push(null)
      return createCraftState(catalog, checked.value)
    }
    if (
      step.kind !== 'socket' ||
      !onlyKeys(step, ['kind', 'socketIndex', 'augmentId']) ||
      typeof step.socketIndex !== 'number' ||
      !Number.isInteger(step.socketIndex) ||
      typeof step.augmentId !== 'string'
    )
      return { ok: false, error: '镶嵌步骤字段无效或类型不支持。' }
    const checked = createCraftState(catalog, state)
    if (!checked.ok) return checked
    const sockets = checked.value.sockets
    if (sockets === undefined || step.socketIndex < 0 || step.socketIndex >= sockets.length)
      return { ok: false, error: '必须选择一个已明确存在的孔位。' }
    if (!socketCandidates(catalog, checked.value).some((entry) => entry.id === step.augmentId))
      return { ok: false, error: '该符文当前不可镶嵌。' }
    sockets[step.socketIndex] = step.augmentId
    return createCraftState(catalog, checked.value)
  }
  if (
    !onlyKeys(step, [
      'currency',
      'modIds',
      'removeModId',
      'removeAffixId',
      'rolls',
      'implicitValues',
      'omen',
    ]) ||
    typeof step.currency !== 'string' ||
    (step.removeModId !== undefined && typeof step.removeModId !== 'string') ||
    (step.rolls !== undefined &&
      (!Array.isArray(step.rolls) ||
        step.rolls.some(
          (roll) => !record(roll) || !onlyKeys(roll, ['modId', 'affixId', 'values']),
        )))
  )
    return { ok: false, error: '通货步骤字段无效。' }
  return applyCraftOperation(catalog, state, step)
}
