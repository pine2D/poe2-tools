import { appendCraftAffix } from './affixIdentity'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CatalogEssence, CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { craftedModifierCapacity } from './craftedCapacity'
import { ESSENCE_OMEN_RULES, type EssenceOmen, isEssenceOmen } from './essenceOmens'
import { essenceResultModIds } from './essenceOutcomes'
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
  resultModId?: string,
): CraftResult<PreparedEssenceCraft> {
  const fail = (error: string): CraftResult<PreparedEssenceCraft> => ({
    ok: false,
    error,
  })
  if (Object.hasOwn(state, 'pendingDesecration')) return fail(PENDING_DESECRATION_MESSAGE)
  if (omen !== undefined && !isEssenceOmen(omen))
    return fail('精华预兆必须是当前支持的单枚结晶预兆。')
  if (state.corrupted) return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (essenceSourceHash(catalog) === null) return fail('精华目录来源指纹缺失或无效。')
  const mode = typeof essenceId === 'string' ? essenceCraftMode(essenceId) : null
  if (mode === null) return fail('不支持该精华类型。')
  if (omen !== undefined && mode !== 'replace') return fail('结晶预兆只能搭配完美或腐化精华。')
  const essence = catalog.essences?.find((entry) => entry.id === essenceId)
  if (!essence) return fail('精华不在当前目录中。')
  const capacity = craftedModifierCapacity(catalog, checked.value)
  if (!capacity.ok) return capacity
  if (checked.value.affixes.filter((affix) => affix.crafted).length >= capacity.value)
    return fail('当前工艺容量已用满。')
  if (state.rarity !== (mode === 'upgrade' ? 'magic' : 'rare'))
    return fail(
      mode === 'upgrade' ? '前三档精华只能用于魔法装备。' : '完美与腐化精华只能用于稀有装备。',
    )
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('基底不在当前目录中。')
  if (base.type === 'Jewel') return fail('珠宝精华制作尚未支持。')
  const category = essenceCategory(base)
  const modId = Object.hasOwn(essence.mods, category) ? essence.mods[category] : undefined
  if (modId === undefined) return fail('该精华没有当前基底类别的保证属性。')
  const results = essenceResultModIds(catalog, base, essence)
  if (results.length === 0) return fail('精华保证属性尚未解析，暂不支持。')
  if (results.length > 1 && resultModId === undefined)
    return fail('该精华有多种结果，请明确选择本次结果。')
  const selectedId = resultModId ?? results[0]
  if (selectedId === undefined || !results.includes(selectedId))
    return fail('所选结果不属于当前精华与基底。')
  const mod = catalog.modifiers.find((entry) => entry.id === selectedId)
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
  const withGuaranteed = (affixes: CraftAffix[]) => {
    const appended = appendCraftAffix(
      {
        ...checked.value,
        rarity: 'rare',
        affixes,
      },
      guaranteed,
    )
    return appended.ok ? createCraftState(catalog, appended.value) : appended
  }
  if (mode === 'upgrade') {
    const capacity = withGuaranteed(checked.value.affixes)
    if (!capacity.ok) return capacity
    return { ok: true, value: { essence, mod, mode, removableAffixes: [] } }
  }
  const removableAffixes = checked.value.affixes.filter(
    (removed, index) =>
      !removed.fractured &&
      withGuaranteed(checked.value.affixes.filter((_, candidateIndex) => candidateIndex !== index))
        .ok,
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
