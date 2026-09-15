import { craftAffixSpace } from './affixCapacity'
import { appendCraftAffix } from './affixIdentity'
import type { CatalogMod, CraftCatalog } from './catalog'
import { craftModsConflict } from './modConflicts'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

/** 调用方先核对材料身份与稀有度；此处共享整组替换的数值、冲突和容量检查。 */
export function guaranteedReplacementCandidates(
  catalog: CraftCatalog,
  state: CraftState,
  mod: CatalogMod,
): CraftResult<CraftAffix[]> {
  if (state.itemLevel < mod.level) return { ok: false, error: '低物等交互尚未验证，暂不支持。' }
  if (
    state.affixes.some((affix) => {
      const existing = catalog.modifiers.find((entry) => entry.id === affix.modId)
      return existing !== undefined && craftModsConflict(existing, mod)
    })
  )
    return { ok: false, error: '已有同组属性时的替换交互尚未验证，暂不支持。' }
  const numeric = inspectNumericLines(mod.lines)
  if (!numeric.ok) return numeric
  const minimum = renderNumericLines(
    mod.lines,
    numeric.value.map((range) => range.min),
  )
  if (!minimum.ok) return minimum
  const guaranteed: CraftAffix = { modId: mod.id, lines: minimum.value, crafted: true }
  const removable = state.affixes.filter((removed, index) => {
    if (removed.fractured) return false
    const remaining = {
      ...state,
      affixes: state.affixes.filter((_, candidateIndex) => candidateIndex !== index),
    }
    const appended = appendCraftAffix(remaining, guaranteed)
    return (
      craftAffixSpace(catalog, remaining)[mod.kind] > 0 &&
      appended.ok &&
      createCraftState(catalog, appended.value).ok
    )
  })
  return removable.length > 0
    ? { ok: true, value: removable }
    : { ok: false, error: '没有满足容量与装备状态约束的可移除词缀，暂不支持。' }
}
