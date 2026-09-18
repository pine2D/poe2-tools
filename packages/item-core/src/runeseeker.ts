import type { CraftCatalog } from './catalog'
import type { CraftResult, CraftState } from './rehearsal'
import { readSovereignEffect } from './sovereignSource'
import { statScalabilitySourceHash } from './statScalability'
import { wandRuneFits } from './wandRunes'

export const RUNESEEKER_ID = 'pob2:augment:["Legacy of Runeseeker\'s Call","wand"]'
const LINE = '75% increased effect of Socketed Runes'

/** 只读固定符文来源，不调用整件或容量校验；自身75不可缩放。 */
export function runeseekerIncrease(catalog: CraftCatalog, state: CraftState): CraftResult<number> {
  const ids = (state.sockets ?? []).filter((id) => id === RUNESEEKER_ID)
  if (!ids.length) return { ok: true, value: 0 }
  const augment = catalog.augments?.find((a) => a.id === RUNESEEKER_ID)
  const flags = catalog.scalability?.[LINE]
  if (
    ids.length !== 1 ||
    !augment ||
    !wandRuneFits(catalog, state, augment) ||
    statScalabilitySourceHash(catalog) === null ||
    flags?.length !== 1 ||
    flags[0]?.scalable !== false ||
    flags[0].formats.length !== 0
  )
    return { ok: false, error: 'Runeseeker 的符文身份、限量或增效来源无效。' }
  return { ok: true, value: 75 }
}

/** 仅固定 Rune 增效组合能跨过额外容量整数阈值。 */
export function amplifiedRuneCapacity(
  catalog: CraftCatalog,
  state: CraftState,
  line: string,
): CraftResult<number> {
  const rune = runeseekerIncrease(catalog, state)
  if (!rune.ok) return rune
  if (rune.value === 0) return { ok: true, value: 1 }
  const flags = catalog.scalability?.[line]
  if (flags?.length !== 1 || flags[0]?.scalable !== true || flags[0].formats.length !== 0)
    return { ok: false, error: '容量符文的数值缩放来源无效。' }
  const sovereign = readSovereignEffect(catalog, state, 'socket')
  if (!sovereign.ok) return sovereign
  return { ok: true, value: Math.floor((100 + rune.value + sovereign.value) / 100) }
}
