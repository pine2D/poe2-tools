import { craftAffixSpace } from './affixCapacity'
import type { CatalogLiquidEmotion, CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { inspectLiquidEmotions } from './liquidEmotions'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines } from './numeric'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface PreparedLiquidEmotionCraft {
  emotion: CatalogLiquidEmotion
  mod: CatalogMod
  removableAffixes: CraftAffix[]
}

export function prepareLiquidEmotionCraft(
  catalog: CraftCatalog,
  state: CraftState,
  emotionId: string,
  resultKind?: 'prefix' | 'suffix',
): CraftResult<PreparedLiquidEmotionCraft> {
  const fail = (error: string): CraftResult<PreparedLiquidEmotionCraft> => ({ ok: false, error })
  if (state.corrupted) return { ok: false, error: CORRUPTED_CRAFT_MESSAGE }
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (checked.value.rarity !== 'rare') return fail('液态情感只能用于稀有普通珠宝。')
  if (checked.value.affixes.some((affix) => affix.crafted))
    return fail('装备已有工艺词缀，最多允许一组。')
  const base = catalog.bases.find((entry) => entry.id === checked.value.baseId)
  if (!base) return fail('基底不在当前目录中。')
  const inspection = inspectLiquidEmotions(catalog, base).find(
    (entry) => entry.emotion.id === emotionId,
  )
  if (!inspection) return fail('液态情感不在当前目录中。')
  if (inspection.reason !== null || inspection.outcomes.length === 0)
    return fail(inspection.reason ?? '该液态情感映射尚未支持。')
  const { emotion, outcomes } = inspection
  if (outcomes.length === 1 && resultKind !== undefined)
    return fail('单侧液态情感不能指定保证结果侧别。')
  if (outcomes.length > 1 && resultKind !== 'prefix' && resultKind !== 'suffix')
    return fail('必须显式选择液态情感保证结果。')
  const mod =
    outcomes.length === 1 ? outcomes[0] : outcomes.find((entry) => entry.kind === resultKind)
  if (!mod) return fail('液态情感保证结果无效。')
  if (checked.value.itemLevel < mod.level) return fail('低物等交互尚未验证，暂不支持。')
  if (
    checked.value.affixes.some((affix) => {
      const existing = catalog.modifiers.find((entry) => entry.id === affix.modId)
      return existing !== undefined && craftModsConflict(existing, mod)
    })
  )
    return fail('已有同组属性时的替换交互尚未验证，暂不支持。')
  const numeric = inspectNumericLines(mod.lines)
  if (!numeric.ok) return numeric
  const guaranteed: CraftAffix = { modId: mod.id, lines: [...mod.lines], crafted: true }
  const removableAffixes = checked.value.affixes.filter((removed) => {
    if (removed.fractured) return false
    const remaining = {
      ...checked.value,
      affixes: checked.value.affixes.filter((affix) => affix.modId !== removed.modId),
    }
    if (craftAffixSpace(catalog, remaining)[mod.kind] === 0) return false
    return createCraftState(catalog, { ...remaining, affixes: [...remaining.affixes, guaranteed] })
      .ok
  })
  if (removableAffixes.length === 0)
    return fail('没有满足容量与装备状态约束的可移除词缀，暂不支持。')
  return { ok: true, value: { emotion, mod, removableAffixes } }
}
