import { craftAffixSpace } from './affixCapacity'
import { appendCraftAffix, resolveCraftAffix } from './affixIdentity'
import { collectDesecrationCandidates, pendingBoneOmenError } from './boneCandidates'
import {
  BONE_DIRECTION_OMEN_RULES,
  type BoneOmenConfig,
  boneOmenError,
  isBoneOmenConfig,
} from './boneOmens'
import {
  type BoneCraftOperation,
  boneBaseError,
  type CraftBone,
  isBoneCraftOperation,
  isCraftBone,
} from './boneRules'
import type { CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { desecrationSourceHash } from './desecration'
import { influenceBoneError } from './influenceRunes'
import { renderNumericLines } from './numeric'
import { preparePutrefaction } from './putrefaction'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

function openKinds(catalog: CraftCatalog, state: CraftState): ('prefix' | 'suffix')[] {
  const space = craftAffixSpace(catalog, state)
  return (['prefix', 'suffix'] as const).filter((kind) => space[kind] > 0)
}
export function prepareDesecration(
  catalog: CraftCatalog,
  state: CraftState,
  boneId: CraftBone,
  config: BoneOmenConfig = {},
): CraftResult<{
  kinds: ('prefix' | 'suffix')[]
  removableAffixes: CraftAffix[]
  requiresRemoval: boolean
}> {
  const influenceError = influenceBoneError(catalog, state)
  if (influenceError) return { ok: false, error: influenceError }
  if (!isBoneOmenConfig(config)) return { ok: false, error: '骨骼预兆配置无效。' }
  if (state.corrupted) return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (!isCraftBone(boneId)) return { ok: false, error: '未知骨骼材料。' }
  if (state.rarity !== 'rare') return { ok: false, error: '骨骼只支持可制作的稀有装备。' }
  if (state.pendingDesecration || state.affixes.some((affix) => affix.desecrated))
    return { ok: false, error: '装备已有待揭示或已揭示亵渎词缀。' }
  if (desecrationSourceHash(catalog) === null)
    return { ok: false, error: '缺少可信的亵渎来源指纹。' }
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return { ok: false, error: '基底不在目录中。' }
  const error = boneBaseError(base, state.itemLevel, boneId)
  if (error) return { ok: false, error }
  const omenError = boneOmenError(config, boneId)
  if (omenError) return { ok: false, error: omenError }
  const requiresRemoval = craftAffixSpace(catalog, state).total === 0
  const direction = config.directionOmen
    ? BONE_DIRECTION_OMEN_RULES[config.directionOmen].kind
    : null
  let kinds: ('prefix' | 'suffix')[] = (
    requiresRemoval ? (['prefix', 'suffix'] as const) : openKinds(catalog, state)
  ).filter((kind) => direction === null || direction === kind)
  let removableAffixes = requiresRemoval
    ? checked.value.affixes.filter(
        (affix, index) =>
          !affix.fractured &&
          openKinds(catalog, {
            ...checked.value,
            affixes: checked.value.affixes.filter((_, otherIndex) => otherIndex !== index),
          }).some((kind) => kinds.includes(kind)),
      )
    : []
  if (config.directionOmen || config.lichOmen) {
    const viable = new Set<CraftAffix>()
    const removals = requiresRemoval ? removableAffixes : [undefined]
    kinds = kinds.filter((kind) => {
      let allowed = false
      for (const removed of removals) {
        const next = {
          ...checked.value,
          affixes: checked.value.affixes.filter((affix) => affix !== removed),
        }
        if (!openKinds(catalog, next).includes(kind)) continue
        const proposed = { ...next, pendingDesecration: { boneId, kind, ...config } }
        if (
          pendingBoneOmenError(
            catalog,
            proposed,
            (candidate) => createCraftState(catalog, candidate).ok,
          ) === null
        ) {
          allowed = true
          if (removed) viable.add(removed)
        }
      }
      return allowed
    })
    removableAffixes = removableAffixes.filter((affix) => viable.has(affix))
    if (!kinds.length)
      return {
        ok: false,
        error: config.lichOmen
          ? '本工具暂不支持不足三项的巫妖候选情形，或指定亵渎位置不可用。'
          : '本工具无法构成至少三项合法候选与亵渎位置。',
      }
  }
  return {
    ok: true,
    value: {
      kinds,
      removableAffixes,
      requiresRemoval,
    },
  }
}

/** 三项均独立对原装备核对，最终只选择一项。 */
export function desecrationCandidates(catalog: CraftCatalog, state: CraftState): CatalogMod[] {
  const checked = createCraftState(catalog, state)
  return checked.ok
    ? collectDesecrationCandidates(
        catalog,
        checked.value,
        (next) => createCraftState(catalog, next).ok,
      )
    : []
}
export function applyBoneCraft(
  catalog: CraftCatalog,
  state: CraftState,
  step: BoneCraftOperation,
): CraftResult<CraftState> {
  if (!isBoneCraftOperation(step)) return { ok: false, error: '骨骼或揭示操作字段无效。' }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const current = checked.value
  if (step.kind === 'putrefy') {
    const prepared = preparePutrefaction(catalog, current, step.boneId)
    if (!prepared.ok) return prepared
    return createCraftState(catalog, {
      ...current,
      affixes: prepared.value.retainedAffixes,
      corrupted: true,
      pendingDesecration: {
        boneId: step.boneId,
        kind: prepared.value.slots.prefix > 0 ? 'prefix' : 'suffix',
        putrefaction: prepared.value.slots,
      },
    })
  }
  if (step.kind === 'desecrate') {
    const config: BoneOmenConfig = {
      ...(step.directionOmen ? { directionOmen: step.directionOmen } : {}),
      ...(step.lichOmen ? { lichOmen: step.lichOmen } : {}),
    }
    const prepared = prepareDesecration(catalog, current, step.boneId, config)
    if (!prepared.ok) return prepared
    let removeIndex = -1
    if (prepared.value.requiresRemoval) {
      if (step.removeModId === undefined)
        return { ok: false, error: '容量已满必须指定合法移除结果；有空位时不能移除。' }
      const selected = resolveCraftAffix(current, {
        modId: step.removeModId,
        ...(Object.hasOwn(step, 'removeAffixId') ? { affixId: step.removeAffixId } : {}),
      })
      if (!selected.ok) return selected
      if (
        !prepared.value.removableAffixes.some(
          (affix) =>
            affix.modId === selected.value.affix.modId &&
            affix.affixId === selected.value.affix.affixId,
        )
      )
        return { ok: false, error: '容量已满必须指定合法移除结果；有空位时不能移除。' }
      removeIndex = selected.value.index
    } else if (Object.hasOwn(step, 'removeModId') || Object.hasOwn(step, 'removeAffixId')) {
      return { ok: false, error: '容量已满必须指定合法移除结果；有空位时不能移除。' }
    }
    const next = {
      ...current,
      affixes: current.affixes.filter((_, index) => index !== removeIndex),
    }
    if (
      !prepared.value.kinds.includes(step.affixKind) ||
      !openKinds(catalog, next).includes(step.affixKind)
    )
      return { ok: false, error: '选定前后缀没有空位；满容量时须使用移除后有空位的一侧。' }
    return createCraftState(catalog, {
      ...next,
      pendingDesecration: { boneId: step.boneId, kind: step.affixKind, ...config },
    })
  }
  const pending = current.pendingDesecration
  if (!pending) return { ok: false, error: '当前没有待揭示亵渎占位。' }
  const candidates = collectDesecrationCandidates(
    catalog,
    current,
    (next) => createCraftState(catalog, next).ok,
    step.kind === 'desecration-offer' || step.kind === 'desecration-reroll'
      ? step.modIds
      : [...(pending.options ?? []), ...(pending.rerollOptions ?? []), step.modId],
  )
  if (step.kind === 'desecration-offer' || step.kind === 'desecration-reroll') {
    if (
      step.kind === 'desecration-reroll' &&
      (!pending.revealOmen || !pending.options || pending.rerollOptions)
    )
      return { ok: false, error: '只能在首次候选已声明深渊回响且尚未重选时固定第二组。' }
    if (step.kind === 'desecration-offer' && pending.options)
      return { ok: false, error: '候选已经固定；重新指定须先撤销历史。' }
    if (
      candidates.length < 3 ||
      !step.modIds.every((id) => candidates.some((mod) => mod.id === id))
    )
      return { ok: false, error: '必须指定恰好三项当前合法候选；不会填充未知选项。' }
    return createCraftState(catalog, {
      ...current,
      pendingDesecration: {
        ...pending,
        ...(step.kind === 'desecration-reroll'
          ? { rerollOptions: [...step.modIds] }
          : {
              options: [...step.modIds],
              ...(step.revealOmen ? { revealOmen: step.revealOmen } : {}),
            }),
      },
    })
  }
  const offeredIds = [...(pending.options ?? []), ...(pending.rerollOptions ?? [])]
  if (
    !pending.options ||
    !offeredIds.every((id) => candidates.some((mod) => mod.id === id)) ||
    !offeredIds.includes(step.modId)
  )
    return { ok: false, error: '必须从已固定且仍合法的三项候选中揭示。' }
  const mod = candidates.find((entry) => entry.id === step.modId)
  if (!mod) return { ok: false, error: '揭示属性不在候选中。' }
  const rendered = renderNumericLines(mod.lines, step.values)
  if (!rendered.ok) return rendered
  const { pendingDesecration: _, ...revealed } = current
  const appended = appendCraftAffix(revealed, {
    modId: mod.id,
    lines: rendered.value,
    ...(pending.putrefaction ? {} : { desecrated: true as const }),
  })
  if (!appended.ok) return appended
  if (pending.putrefaction) {
    const slots = {
      ...pending.putrefaction,
      [pending.kind]: pending.putrefaction[pending.kind] - 1,
    }
    if (slots.prefix + slots.suffix > 0)
      appended.value.pendingDesecration = {
        boneId: pending.boneId,
        kind: slots.prefix > 0 ? 'prefix' : 'suffix',
        putrefaction: slots,
      }
  }
  return createCraftState(catalog, appended.value)
}
