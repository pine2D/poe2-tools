import type { AlloyCatalog } from './alloys'
import { alloyCatalogSignature, inspectCraftAlloys } from './alloys'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import type { CatalogMod, CraftCatalog } from './catalog'
import { CORRUPTED_CRAFT_MESSAGE } from './corruptionRules'
import { craftedModifierCapacity } from './craftedCapacity'
import { guaranteedReplacementCandidates } from './guaranteedReplacement'
import { type CraftAffix, type CraftResult, type CraftState, createCraftState } from './rehearsal'

export interface PreparedAlloyCraft {
  alloy: AlloyCatalog['alloys'][number]
  mod: CatalogMod
  removableAffixes: CraftAffix[]
}

export function prepareAlloyCraft(
  catalog: CraftCatalog,
  state: CraftState,
  alloyId: string,
): CraftResult<PreparedAlloyCraft> {
  const fail = (error: string): CraftResult<PreparedAlloyCraft> => ({ ok: false, error })
  if (Object.hasOwn(state, 'pendingDesecration')) return fail(PENDING_DESECRATION_MESSAGE)
  if (state.corrupted) return fail(CORRUPTED_CRAFT_MESSAGE)
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  if (checked.value.rarity !== 'rare') return fail('合金只能用于稀有装备。')
  const capacity = craftedModifierCapacity(catalog, checked.value)
  if (!capacity.ok) return capacity
  if (checked.value.affixes.filter((affix) => affix.crafted).length >= capacity.value)
    return fail('当前工艺容量已用满。')
  if (alloyCatalogSignature(catalog) === null) return fail('合金关系目录未加载或来源无效。')
  const base = catalog.bases.find((entry) => entry.id === checked.value.baseId)
  if (!base) return fail('基底不在当前目录中。')
  const entry = inspectCraftAlloys(catalog, base).find((entry) => entry.alloy.id === alloyId)
  if (!entry) return fail('该合金没有当前基底类别的保证属性。')
  if (!entry.mod) return fail(entry.reason ?? '合金保证属性尚未对应。')
  const removable = guaranteedReplacementCandidates(catalog, checked.value, entry.mod)
  return removable.ok
    ? { ok: true, value: { alloy: entry.alloy, mod: entry.mod, removableAffixes: removable.value } }
    : removable
}
