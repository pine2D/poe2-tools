import type { CatalogBase, CatalogModifierData } from './catalog'
import { readNumericValues } from './numeric'
import type { CraftResult, CraftState } from './rehearsal'

const FLAT_WARD = /^\+\(\d+-\d+\) to maximum Runic Ward$/
const WARD_REGEN = /^\(\d+-\d+\)% increased Runic Ward Regeneration Rate$/

/** 这里只放已核对且不改变最大结界的明确语义，不能按 Ward 关键词略过。 */
export function wardModifierKind(mod: CatalogModifierData): 'increased' | 'unrelated' | null {
  if (mod.lines.length !== 1) return null
  const line = mod.lines[0] ?? ''
  if (
    mod.group === 'LocalRunicWardIncreasePercent' &&
    /^\(\d+-\d+\)% increased Runic Ward$/.test(line)
  )
    return 'increased'
  if (
    (mod.group === 'WardOnBlock' && /^Recover \(\d+-\d+\) Runic Ward when you Block$/.test(line)) ||
    (mod.group === 'AttackSpeedWhileMissingRunicWard' &&
      /^\(\d+-\d+\)% increased Attack Speed while missing Runic Ward$/.test(line))
  )
    return 'unrelated'
  return null
}

export function isKnownWardImplicit(line: string): boolean {
  return FLAT_WARD.test(line) || WARD_REGEN.test(line)
}

/** null 表示没有本地固有结界；存在但未掷定时必须报未知。 */
export function readImplicitWard(base: CatalogBase, state: CraftState): CraftResult<number | null> {
  const patterns = base.implicit?.split('\n') ?? []
  let flat: number | null = null
  for (const [index, pattern] of patterns.entries()) {
    if (!FLAT_WARD.test(pattern)) continue
    const actual = state.implicitLines?.[index] ?? pattern
    const values = readNumericValues([pattern], [actual])
    if (!values.ok) return values
    const value = values.value[0]
    if (value === null || value === undefined)
      return { ok: false, error: '固有结界范围尚未掷定，不能用零值估算。' }
    flat = (flat ?? 0) + value
  }
  return { ok: true, value: flat }
}
