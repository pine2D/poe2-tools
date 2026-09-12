import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CatalogEssence, CatalogMod, CraftCatalog } from './catalog'
import { ESSENCE_OMEN_RULES, type EssenceOmen, isEssenceOmen } from './essenceOmens'
import { essenceCategory, essenceCraftMode, essenceSourceHash } from './essences'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface PreparedEssenceCraft {
  essence: CatalogEssence
  mod: CatalogMod
  mode: 'upgrade' | 'replace'
  removableAffixes: CraftAffix[]
}

export function prepareEssenceCraft(
  catalog: CraftCatalog,
  state: CraftState,
  essenceId: string,
  omen?: EssenceOmen,
): CraftResult<PreparedEssenceCraft> {
  const fail = (error: string): CraftResult<PreparedEssenceCraft> => ({
    ok: false,
    error,
  })
  if (Object.hasOwn(state, 'pendingDesecration')) return fail(PENDING_DESECRATION_MESSAGE)
  if (omen !== undefined && !isEssenceOmen(omen))
    return fail('精华预兆必须是当前支持的单枚结晶预兆。')
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (essenceSourceHash(catalog) === null) return fail('精华目录来源指纹缺失或无效。')
  const mode = typeof essenceId === 'string' ? essenceCraftMode(essenceId) : null
  if (mode === null) return fail('不支持该精华类型。')
  if (omen !== undefined && mode !== 'replace') return fail('结晶预兆只能搭配完美或腐化精华。')
  const essence = catalog.essences?.find((entry) => entry.id === essenceId)
  if (!essence) return fail('精华不在当前目录中。')
  if (state.affixes.some((affix) => affix.crafted)) return fail('装备已有工艺词缀，最多允许一组。')
  if (state.rarity !== (mode === 'upgrade' ? 'magic' : 'rare'))
    return fail(
      mode === 'upgrade' ? '前三档精华只能用于魔法装备。' : '完美与腐化精华只能用于稀有装备。',
    )
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('基底不在当前目录中。')
  const category = essenceCategory(base)
  const modId = Object.hasOwn(essence.mods, category) ? essence.mods[category] : undefined
  if (modId === undefined) return fail('该精华没有当前基底类别的保证属性。')
  const mod = catalog.modifiers.find((entry) => entry.id === modId)
  if (!mod) return fail('精华保证属性尚未解析，暂不支持。')
  if (state.itemLevel < mod.level) return fail('低物等交互尚未验证，暂不支持。')
  if (
    state.affixes.some((affix) => {
      const existing = catalog.modifiers.find((entry) => entry.id === affix.modId)
      return existing !== undefined && craftModsConflict(existing, mod)
    })
  )
    return fail('精华保证属性与已有词缀组冲突。')
  const numeric = inspectNumericLines(mod.lines)
  if (!numeric.ok) return numeric
  const guaranteed: CraftAffix = { modId: mod.id, lines: [...mod.lines], crafted: true }
  const withGuaranteed = (affixes: CraftAffix[]) =>
    createCraftState(catalog, {
      ...checked.value,
      rarity: 'rare',
      affixes: [...affixes, guaranteed],
    })
  if (mode === 'upgrade') {
    const capacity = withGuaranteed(checked.value.affixes)
    if (!capacity.ok) return capacity
    return { ok: true, value: { essence, mod, mode, removableAffixes: [] } }
  }
  const removableAffixes = checked.value.affixes.filter(
    (removed) =>
      withGuaranteed(checked.value.affixes.filter((affix) => affix.modId !== removed.modId)).ok,
  )
  if (removableAffixes.length === 0)
    return fail('没有满足容量与装备状态约束的可移除词缀，暂不支持。')
  const directed =
    omen === undefined
      ? removableAffixes
      : removableAffixes.filter(
          (affix) =>
            catalog.modifiers.find((entry) => entry.id === affix.modId)?.kind ===
            ESSENCE_OMEN_RULES[omen].kind,
        )
  if (directed.length === 0) return fail('结晶预兆指定侧没有满足容量与装备状态约束的可移除词缀。')
  return { ok: true, value: { essence, mod, mode, removableAffixes: directed } }
}
