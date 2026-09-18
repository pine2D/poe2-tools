import type { CatalogMod, CraftCatalog } from './catalog'
import { craftedModifierCapacity } from './craftedCapacity'
import type { CraftResult, CraftState } from './rehearsal'
import { readSovereignEffect } from './sovereignSource'

export { isSovereignAffix, usesSovereignResistance } from './sovereignSource'

/** 对外派生入口仍验证整件工艺容量；来源读取供容量计算独立使用。 */
export function sovereignEffect(
  catalog: CraftCatalog,
  state: CraftState,
  effect: 'resistance' | 'socket',
): CraftResult<number> {
  const source = readSovereignEffect(catalog, state, effect)
  if (!source.ok || source.value === 0) return source
  const capacity = craftedModifierCapacity(catalog, state)
  return capacity.ok && state.affixes.filter((entry) => entry.crafted).length <= capacity.value
    ? source
    : { ok: false, error: '君王合金增效身份或来源无效。' }
}

export function sovereignResistanceEffect(
  catalog: CraftCatalog,
  state: CraftState,
  mod: CatalogMod,
): CraftResult<number> {
  return mod.tags.includes('resistance')
    ? sovereignEffect(catalog, state, 'resistance')
    : { ok: true, value: 0 }
}
