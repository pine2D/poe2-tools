import {
  BONE_RULES,
  type BoneCraftOperation,
  boneBaseError,
  type CraftBone,
  isBoneCraftOperation,
  isCraftBone,
} from './boneRules'
import { type CatalogMod, type CraftCatalog, inspectModPool } from './catalog'
import { desecrationSourceHash } from './desecration'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

function openKinds(catalog: CraftCatalog, state: CraftState): ('prefix' | 'suffix')[] {
  return (['prefix', 'suffix'] as const).filter(
    (kind) =>
      state.affixes.filter(
        (affix) => catalog.modifiers.find((mod) => mod.id === affix.modId)?.kind === kind,
      ).length < 3,
  )
}
export function prepareDesecration(
  catalog: CraftCatalog,
  state: CraftState,
  boneId: CraftBone,
): CraftResult<{
  kinds: ('prefix' | 'suffix')[]
  removableAffixes: CraftAffix[]
  requiresRemoval: boolean
}> {
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
  const requiresRemoval = state.affixes.length === 6
  return {
    ok: true,
    value: {
      kinds: requiresRemoval ? ['prefix', 'suffix'] : openKinds(catalog, state),
      removableAffixes: requiresRemoval ? checked.value.affixes : [],
      requiresRemoval,
    },
  }
}

/** 三项均独立对原装备核对，最终只选择一项，不把候选彼此当作已占用组。 */
export function desecrationCandidates(catalog: CraftCatalog, state: CraftState): CatalogMod[] {
  const checked = createCraftState(catalog, state)
  if (!checked.ok || !state.pendingDesecration) return []
  const pending = state.pendingDesecration
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return []
  const { pendingDesecration: _, ...ordinary } = checked.value
  const existing = catalog.modifiers.filter((mod) =>
    state.affixes.some((affix) => affix.modId === mod.id),
  )
  const candidates = inspectModPool(
    base,
    catalog.modifiers,
    state.itemLevel,
    existing.map((mod) => mod.group),
    existing.flatMap((mod) => mod.addsTags),
    'desecrated',
  )
    .filter(
      ({ mod, reasons }) =>
        reasons.length === 0 &&
        mod.kind === pending.kind &&
        !existing.some((other) => craftModsConflict(other, mod)) &&
        inspectNumericLines(mod.lines).ok &&
        createCraftState(catalog, {
          ...ordinary,
          affixes: [
            ...ordinary.affixes,
            { modId: mod.id, lines: [...mod.lines], desecrated: true },
          ],
        }).ok,
    )
    .map(({ mod }) => mod)
  const minimum = BONE_RULES[pending.boneId].minModLevel
  // 与普通高级通货相同：当前合法候选中每个 kind/group 族保留最高档回退。
  const family = (mod: CatalogMod) => JSON.stringify([mod.kind, mod.group])
  const highest = new Map<string, number>()
  for (const mod of candidates)
    highest.set(family(mod), Math.max(highest.get(family(mod)) ?? 0, mod.level))
  return candidates.filter((mod) => mod.level >= minimum || mod.level === highest.get(family(mod)))
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
  if (step.kind === 'desecrate') {
    const prepared = prepareDesecration(catalog, current, step.boneId)
    if (!prepared.ok) return prepared
    if (
      prepared.value.requiresRemoval
        ? !prepared.value.removableAffixes.some((affix) => affix.modId === step.removeModId)
        : Object.hasOwn(step, 'removeModId')
    )
      return { ok: false, error: '满六组必须指定合法移除结果；未满六组不能移除。' }
    const next = {
      ...current,
      affixes: current.affixes.filter((affix) => affix.modId !== step.removeModId),
    }
    if (!openKinds(catalog, next).includes(step.affixKind))
      return { ok: false, error: '选定前后缀没有空位；满六组时须使用被移除侧。' }
    return createCraftState(catalog, {
      ...next,
      pendingDesecration: { boneId: step.boneId, kind: step.affixKind },
    })
  }
  const pending = current.pendingDesecration
  if (!pending) return { ok: false, error: '当前没有待揭示亵渎占位。' }
  const candidates = desecrationCandidates(catalog, current)
  if (step.kind === 'desecration-offer') {
    if (pending.options) return { ok: false, error: '候选已经固定；重新指定须先撤销历史。' }
    if (
      candidates.length < 3 ||
      !step.modIds.every((id) => candidates.some((mod) => mod.id === id))
    )
      return { ok: false, error: '必须指定恰好三项当前合法候选；不会填充未知选项。' }
    return createCraftState(catalog, {
      ...current,
      pendingDesecration: { ...pending, options: [...step.modIds] },
    })
  }
  if (
    !pending.options?.every((id) => candidates.some((mod) => mod.id === id)) ||
    !pending.options.includes(step.modId)
  )
    return { ok: false, error: '必须从已固定且仍合法的三项候选中揭示。' }
  const mod = candidates.find((entry) => entry.id === step.modId)
  if (!mod) return { ok: false, error: '揭示属性不在候选中。' }
  const rendered = renderNumericLines(mod.lines, step.values)
  if (!rendered.ok) return rendered
  const { pendingDesecration: _, ...revealed } = current
  return createCraftState(catalog, {
    ...revealed,
    affixes: [...revealed.affixes, { modId: mod.id, lines: rendered.value, desecrated: true }],
  })
}
