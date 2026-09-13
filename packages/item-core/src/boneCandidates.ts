import { boneOmenError, matchesBoneLich } from './boneOmens'
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
): CatalogMod[] {
  const pending = state.pendingDesecration
  if (!pending) return []
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return []
  const { pendingDesecration: _, ...ordinary } = state
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
        (!pending.lichOmen || matchesBoneLich(mod, pending.lichOmen)) &&
        !existing.some((other) => craftModsConflict(other, mod)) &&
        inspectNumericLines(mod.lines).ok &&
        validate({
          ...ordinary,
          affixes: [
            ...ordinary.affixes,
            { modId: mod.id, lines: [...mod.lines], desecrated: true },
          ],
        }),
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

export function pendingBoneOmenError(
  catalog: CraftCatalog,
  state: CraftState,
  validate: (next: CraftState) => boolean,
): string | null {
  const pending = state.pendingDesecration
  if (!pending || (!pending.directionOmen && !pending.lichOmen)) return null
  const error = boneOmenError(pending, pending.boneId, pending.kind)
  if (error) return error
  const lich = pending.lichOmen
  const pool = collectDesecrationCandidates(catalog, state, validate)
  if (pool.length < 3)
    return lich ? '本工具暂不支持不足三项的巫妖候选情形。' : '本工具无法构成至少三项合法候选。'
  if (pending.options && !pending.options.every((id) => pool.some((mod) => mod.id === id)))
    return '固定三项不满足预兆限定或当前候选资格。'
  return null
}
