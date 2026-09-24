import { casterAugmentFits, isCasterAugment } from './casterAugments'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
export function isCasterRune(augment: CatalogAugment, effective = false): boolean {
  return augment.type === 'Rune' && isCasterAugment(augment, effective)
}
export function casterRuneFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  return augment.type === 'Rune' && casterAugmentFits(catalog, state, augment)
}
