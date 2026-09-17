import {
  armourIdolFits,
  armourIdolLimitKey,
  armourIdolSocketError,
  armourIdolSourceMatches,
  isArmourIdol,
  isArmourIdolEffectLine,
  scaleArmourIdol,
} from './armourIdols'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { GLOVE_IDOL_RECORDS } from './gloveIdolData'
import type { CraftState } from './rehearsal'

// v110 的公开识别边界保持九个手套 ID，不随通用防具能力扩展。
export const GLOVE_IDOL_NAMES: readonly string[] = GLOVE_IDOL_RECORDS.map((a) => a.name)
export function isGloveIdolId(id: unknown): boolean {
  return GLOVE_IDOL_RECORDS.some((a) => a.id === id)
}
export function isGloveIdol(augment: CatalogAugment, effective = false): boolean {
  return isGloveIdolId(augment.id) && isArmourIdol(augment, effective)
}
export function gloveIdolFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  return isGloveIdolId(augment.id) && armourIdolFits(catalog, state, augment)
}
export function scaleGloveIdol(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): CatalogAugment | null {
  return isGloveIdolId(augment.id) ? scaleArmourIdol(catalog, augment, increase) : null
}
export function isGloveIdolEffectLine(line: string): boolean {
  const template = (text: string) =>
    text.replace(/[+-]?\d+(?:\.\d+)?/g, (n) =>
      n.startsWith('+') ? '+#' : n.startsWith('-') ? '-#' : '#',
    )
  return (
    isArmourIdolEffectLine(line) &&
    GLOVE_IDOL_RECORDS.some((a) => a.lines.some((l) => template(l) === template(line)))
  )
}
export function gloveIdolSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  return armourIdolSourceMatches(
    expected.filter(isGloveIdolEffectLine),
    actual.filter(isGloveIdolEffectLine),
  )
}
export function gloveIdolLimitKey(augment: CatalogAugment): string | null {
  return isGloveIdolId(augment.id) ? armourIdolLimitKey(augment) : null
}
export function gloveIdolSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  return isGloveIdolId(id) ? armourIdolSocketError(catalog, state, index, id) : null
}
