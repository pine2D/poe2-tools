import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { STAFF_RUNE_SCALABILITY, STAFF_RUNES } from './staffRuneData'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'
import { WAND_RUNE_SCALABILITY, WAND_RUNES } from './wandRuneData'

function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(right).every((k) => Object.hasOwn(left, k) && sameData(left[k], right[k]))
  )
}
const runes = [...WAND_RUNES, ...STAFF_RUNES]
const records = new Map(runes.map((a) => [a.id, a]))
export function isCasterRuneId(id: unknown): boolean {
  return typeof id === 'string' && records.has(id)
}
const template = (line: string) => line.replace(/\d+/g, '#')
const values = (line: string) => (line.match(/\d+/g) ?? []).map(Number)
const metadata = { ...WAND_RUNE_SCALABILITY, ...STAFF_RUNE_SCALABILITY } as Record<
  string,
  { scalable: boolean; formats: string[] }[]
>

/** 身份和固定参数完整核对；有效副本只允许可缩放数值改变。 */
export function isCasterRune(augment: CatalogAugment, effective = false): boolean {
  const expected = records.get(augment.id)
  if (!expected) return false
  if (!effective) return sameData(augment, expected)
  const { lines, ...rest } = augment,
    { lines: originals, ...other } = expected
  return (
    sameData(rest, other) &&
    lines.length === originals.length &&
    originals.every((original, i) => {
      const line = lines[i]
      return (
        typeof line === 'string' &&
        template(line) === template(original) &&
        values(line).every(
          (n, j) =>
            Number.isSafeInteger(n) &&
            n >= (values(original)[j] ?? Infinity) &&
            (metadata[original]?.[j]?.scalable || n === values(original)[j]),
        )
      )
    })
  )
}
export function casterRuneFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  const base = catalog.bases.find((b) => b.id === state.baseId)
  return (
    !!base &&
    ((augment.category === 'wand' &&
      base.type === 'Wand' &&
      base.tags.includes('wand') &&
      base.tags.includes('onehand') &&
      !base.tags.some((t) => ['twohand', 'staff', 'warstaff'].includes(t))) ||
      (augment.category === 'staff' &&
        base.type === 'Staff' &&
        base.tags.includes('staff') &&
        base.tags.includes('twohand') &&
        !base.tags.some((t) => ['onehand', 'wand', 'warstaff', 'weapon'].includes(t)))) &&
    !base.tags.includes('not_for_sale') &&
    !base.hidden &&
    !base.runeforged &&
    base.variantList === undefined &&
    !state.sourceText?.split(/\r?\n/).some((line) => line.trim() === 'Sanctified') &&
    isCasterRune(augment) &&
    astridSourceValid(catalog) &&
    catalog.augments?.filter((a) => a.id === augment.id).length === 1
  )
}
export function scaleCasterRune(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): CatalogAugment | null {
  if (
    !isCasterRune(augment) ||
    !astridSourceValid(catalog) ||
    statScalabilitySourceHash(catalog) === null
  )
    return null
  const lines: string[] = []
  for (const line of augment.lines) {
    const flags = catalog.scalability?.[line]
    if (!flags || !sameData(flags, metadata[line])) return null
    const scaled = scaleStatLineByEffect(line, line, flags, increase)
    if (!scaled.ok) return null
    lines.push(scaled.value)
  }
  return { ...augment, lines }
}
const templates = new Set(runes.flatMap((a) => a.lines.map(template)))
export function isCasterRuneLine(line: string): boolean {
  return templates.has(template(line))
}
/** 只有同一属性的可叠加贡献合计；其他条件、负作用与重复行逐行核对。 */
export function casterRuneSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const select = (lines: readonly string[]) => {
    const exact: string[] = []
    let spellLevels = 0,
      penetration = 0
    for (const line of lines.filter(isCasterRuneLine)) {
      const spell = /^\+(\d+) to Level of all Spell Skills$/.exec(line)
      const pierce =
        /^Spell damage Penetrates (\d+)% of enemy Elemental Resistances while on Low Runic Ward$/.exec(
          line,
        )
      const amount = spell?.[1] ?? pierce?.[1]
      if (
        amount !== undefined &&
        (!/^[1-9]\d*$/.test(amount) || !Number.isSafeInteger(Number(amount)))
      )
        return null
      if (spell) spellLevels += Number(spell[1])
      else if (pierce) penetration += Number(pierce[1])
      else exact.push(line)
    }
    return Number.isSafeInteger(spellLevels) && Number.isSafeInteger(penetration)
      ? { exact: exact.sort(), spellLevels, penetration }
      : null
  }
  const left = select(expected),
    right = select(actual)
  return left !== null && right !== null && sameData(left, right)
}
export function casterRuneLimitKey(augment: CatalogAugment): string | null {
  return isCasterRune(augment) && augment.limit === 1 ? (augment.limitId ?? augment.name) : null
}
export function casterRuneSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const augment = catalog.augments?.find((a) => a.id === id)
  const key = augment && casterRuneLimitKey(augment)
  if (!key) return null
  return (state.sockets ?? []).some((old, i) => {
    const other = catalog.augments?.find((a) => a.id === old)
    return i !== index && other && casterRuneLimitKey(other) === key
  })
    ? '该符文已达到本件限量；遗产符文共用限量，请替换已有同组孔位。'
    : null
}
