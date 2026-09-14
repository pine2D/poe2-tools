import type { CatalogLiquidEmotion, CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { guaranteedReplacementCandidates } from './guaranteedReplacement'
import { inspectLiquidEmotions } from './liquidEmotions'
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
  const removable = guaranteedReplacementCandidates(catalog, checked.value, mod)
  return removable.ok
    ? { ok: true, value: { emotion, mod, removableAffixes: removable.value } }
    : removable
}
