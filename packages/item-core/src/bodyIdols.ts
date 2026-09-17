import { armourIdolFits, isBodyIdolId, scaleArmourIdol } from './armourIdols'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { scaleStatLineByEffect } from './statScalability'

export const BONDED_PREFIX = 'Bonded: '
const FOX_ID = 'pob2:augment:["Fox Idol","body armour"]'

/** 本件 Fox 只解锁本件雕像；来源文本中的绑定标题不是激活证据。 */
export function bodyIdolBondedActive(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  if (!isBodyIdolId(augment.id) || !armourIdolFits(catalog, state, augment)) return false
  const fox = catalog.augments?.find((a) => a.id === FOX_ID)
  return (
    !!fox &&
    !!state.sockets?.includes(FOX_ID) &&
    armourIdolFits(catalog, state, fox) &&
    scaleArmourIdol(catalog, fox, 0) !== null
  )
}

export function bodyIdolBondedLines(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): string[] | null {
  if (!isBodyIdolId(augment.id) || !scaleArmourIdol(catalog, augment, increase)) return null
  const lines: string[] = []
  for (const line of augment.bonded?.lines ?? []) {
    const metadata = catalog.scalability?.[line]
    if (!metadata) return null
    const result = scaleStatLineByEffect(line, line, metadata, increase)
    if (!result.ok) return null
    lines.push(result.value)
  }
  return lines
}
