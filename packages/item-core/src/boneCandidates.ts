import { appendCraftAffix } from './affixIdentity'
import { boneOmenError, boneRevealOmenError, matchesBoneLich } from './boneOmens'
import { BONE_RULES } from './boneRules'
import { type CatalogMod, type CraftCatalog, inspectModPool } from './catalog'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import type { CraftState } from './rehearsal'
/** 调用方已核对原状态；回调只校验去除pending后新增的真实词缀，避免递归。 */
export function collectDesecrationCandidates(
  catalog: CraftCatalog,
  state: CraftState,
  validate: (next: CraftState) => boolean,
  selectedIds?: readonly string[],
  limit = Number.POSITIVE_INFINITY,
): CatalogMod[] {
  const pending = state.pendingDesecration
  if (!pending) return []
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return []
  const selected = selectedIds === undefined ? null : new Set(selectedIds)
  const family = (mod: CatalogMod) => JSON.stringify([mod.kind, mod.group])
  // 固定选项只需验证相关族；同族未选档位仍参与最高档回退，不能先按ID删掉。
  const selectedFamilies =
    selected === null
      ? null
      : new Set(catalog.modifiers.filter((mod) => selected.has(mod.id)).map(family))
  const { pendingDesecration: _, ...ordinary } = state
  const existing = catalog.modifiers.filter((mod) =>
    state.affixes.some((affix) => affix.modId === mod.id),
  )
  const candidates = inspectModPool(
    base,
    selectedFamilies === null
      ? catalog.modifiers
      : catalog.modifiers.filter((mod) => selectedFamilies.has(family(mod))),
    state.itemLevel,
    existing.map((mod) => mod.group),
    existing.flatMap((mod) => mod.addsTags),
    pending.putrefaction ? 'ordinary' : 'desecrated',
  )
    .filter(
      ({ mod, reasons }) =>
        reasons.length === 0 &&
        mod.kind === pending.kind &&
        (!pending.lichOmen || matchesBoneLich(mod, pending.lichOmen)) &&
        !existing.some((other) => craftModsConflict(other, mod)) &&
        inspectNumericLines(mod.lines).ok,
    )
    .map(({ mod }) => mod)
  const minimum = BONE_RULES[pending.boneId].minModLevel
  // 先检查高档，只有通过真实状态校验的档位才能决定同族最低等级回退。
  // 预兆只需证明至少三项，可在得到足够合法候选后结束；完整池保持目录顺序。
  const highest = new Map<string, number>()
  const accepted = new Set<CatalogMod>()
  for (const mod of [...candidates].sort((a, b) => b.level - a.level)) {
    const key = family(mod)
    if (mod.level < minimum && mod.level < (highest.get(key) ?? 0)) continue
    const appended = appendCraftAffix(ordinary, {
      modId: mod.id,
      lines: mod.lines,
      ...(pending.putrefaction ? {} : { desecrated: true as const }),
    })
    if (!appended.ok || !validate(appended.value)) continue
    highest.set(key, Math.max(highest.get(key) ?? 0, mod.level))
    if (selected === null || selected.has(mod.id)) accepted.add(mod)
    if (accepted.size >= limit) break
  }
  return candidates.filter((mod) => accepted.has(mod))
}

export function pendingBoneOmenError(
  catalog: CraftCatalog,
  state: CraftState,
  validate: (next: CraftState) => boolean,
): string | null {
  const pending = state.pendingDesecration
  if (
    !pending ||
    (!pending.directionOmen &&
      !pending.lichOmen &&
      !pending.revealOmen &&
      !(pending.putrefaction && pending.options))
  )
    return null
  if (pending.revealOmen) {
    const revealError = boneRevealOmenError(pending, pending.revealOmen)
    if (revealError) return revealError
  }
  const error = boneOmenError(pending, pending.boneId, pending.kind)
  if (error) return error
  const lich = pending.lichOmen
  const pool = collectDesecrationCandidates(
    catalog,
    state,
    validate,
    pending.options ? [...pending.options, ...(pending.rerollOptions ?? [])] : undefined,
    pending.options ? Number.POSITIVE_INFINITY : 3,
  )
  if (pool.length < 3)
    return lich ? '本工具暂不支持不足三项的巫妖候选情形。' : '本工具无法构成至少三项合法候选。'
  if (
    [...(pending.options ?? []), ...(pending.rerollOptions ?? [])].some(
      (id) => !pool.some((mod) => mod.id === id),
    )
  )
    return '固定三项不满足预兆限定或当前候选资格。'
  return null
}
