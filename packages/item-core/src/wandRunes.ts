import { casterRuneFits, isCasterRune } from './casterRunes'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { WAND_RUNES } from './wandRuneData'

const ids = new Set(WAND_RUNES.map((a) => a.id))
export function isWandRuneId(id: unknown): boolean {
  return typeof id === 'string' && ids.has(id)
}
export function isWandRune(augment: CatalogAugment, effective = false): boolean {
  return augment.category === 'wand' && isCasterRune(augment, effective)
}
export function wandRuneFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  return augment.category === 'wand' && casterRuneFits(catalog, state, augment)
}
