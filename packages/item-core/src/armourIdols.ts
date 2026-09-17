import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CraftCatalog } from './catalog'
import { GLOVE_IDOL_RECORDS, GLOVE_IDOL_SCALABILITY } from './gloveIdolData'
import { HELMET_BOOT_IDOL_RECORDS, HELMET_BOOT_IDOL_SCALABILITY } from './helmetBootIdolData'
import type { CraftState } from './rehearsal'
import { isRuneforgedArmourBase } from './runeforgedArmour'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'

const ARMOUR_IDOL_RECORDS = [...GLOVE_IDOL_RECORDS, ...HELMET_BOOT_IDOL_RECORDS]
const ARMOUR_IDOL_SCALABILITY = { ...GLOVE_IDOL_SCALABILITY, ...HELMET_BOOT_IDOL_SCALABILITY }
export function isHelmetBootIdolId(id: unknown): boolean {
  return HELMET_BOOT_IDOL_RECORDS.some((a) => a.id === id)
}
export const ARMOUR_IDOL_NAMES: readonly string[] = ARMOUR_IDOL_RECORDS.map((a) => a.name)
export function isArmourIdolId(id: unknown): boolean {
  return ARMOUR_IDOL_RECORDS.some((a) => a.id === id)
}
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
function scaledLines(source: CatalogAugment, increase: number): string[] | null {
  const lines: string[] = []
  for (const line of source.lines) {
    // 手套 Majesty 的固定原值为 4000 毫秒，不从显示秒数反推未知掷值区间。
    if (source.category === 'gloves' && source.name === 'Carved Majesty') {
      const milliseconds = Math.trunc((4000 * (100 + increase)) / 100)
      lines.push(line.replace('4 seconds', `${Math.round(milliseconds / 10) / 100} seconds`))
      continue
    }
    const metadata = ARMOUR_IDOL_SCALABILITY[line]
    if (!metadata) return null
    const result = scaleStatLineByEffect(line, line, metadata, increase)
    if (!result.ok) return null
    lines.push(result.value)
  }
  return lines
}
// 只缓存固定源码生成的允许值，catalog 来源与metadata仍逐次校验。
const effectiveLines = new Map<string, Set<string>>()
export function isArmourIdol(augment: CatalogAugment, effective = false): boolean {
  const source = ARMOUR_IDOL_RECORDS.find((a) => a.id === augment.id)
  if (!source) return false
  if (!effective) return sameData(augment, source)
  const { lines, ...metadata } = augment,
    { lines: _lines, ...expected } = source
  if (!sameData(metadata, expected)) return false
  let allowed = effectiveLines.get(source.id)
  if (!allowed) {
    allowed = new Set(Array.from({ length: 101 }, (_, i) => JSON.stringify(scaledLines(source, i))))
    effectiveLines.set(source.id, allowed)
  }
  return allowed.has(JSON.stringify(lines))
}
export function armourIdolFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  const base = catalog.bases.find((b) => b.id === state.baseId)
  return (
    !!base &&
    base.type ===
      ({ gloves: 'Gloves', helmet: 'Helmet', boots: 'Boots' } as Record<string, string>)[
        augment.category
      ] &&
    !base.hidden &&
    (!base.runeforged || isRuneforgedArmourBase(base)) &&
    base.variantList === undefined &&
    isArmourIdol(augment) &&
    astridSourceValid(catalog) &&
    catalog.augments?.filter((a) => a.id === augment.id).length === 1 &&
    !state.sourceText?.split(/\r?\n/).some((l) => l.trim() === 'Sanctified')
  )
}
export function scaleArmourIdol(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): CatalogAugment | null {
  if (
    !isArmourIdol(augment) ||
    !astridSourceValid(catalog) ||
    statScalabilitySourceHash(catalog) === null ||
    !Number.isInteger(increase) ||
    increase < 0 ||
    increase > 100 ||
    !augment.lines.every((line) =>
      sameData(catalog.scalability?.[line], ARMOUR_IDOL_SCALABILITY[line]),
    )
  )
    return null
  const lines = scaledLines(augment, increase)
  return lines ? { ...augment, lines } : null
}
const numbers = /[+-]?\d+(?:\.\d+)?/g
const template = (line: string) =>
  line.replace(numbers, (n) => (n.startsWith('+') ? '+#' : n.startsWith('-') ? '-#' : '#'))
export function isArmourIdolEffectLine(line: string): boolean {
  return (
    ARMOUR_IDOL_RECORDS.some((a) => a.lines.some((p) => template(p) === template(line))) &&
    (line.match(numbers) ?? []).every(
      (n) =>
        Number.isSafeInteger(Math.round(Number(n) * 100)) &&
        Math.round(Number(n) * 100) / 100 === Number(n),
    )
  )
}
/** 无限量同模板可加；条件与限量行保留完整多重集合，不并入本地防御。 */
export function armourIdolSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const normalize = (lines: readonly string[]) => {
    const sums = new Map<string, number>(),
      exact: string[] = []
    for (const line of lines.filter(isArmourIdolEffectLine)) {
      const key = template(line)
      if (
        ARMOUR_IDOL_RECORDS.some(
          (a) => a.limit === undefined && a.lines.some((line) => template(line) === key),
        )
      ) {
        const total = (sums.get(key) ?? 0) + Math.round(Number(line.match(numbers)?.[0]) * 100)
        if (!Number.isSafeInteger(total)) return null
        sums.set(key, total)
      } else exact.push(line)
    }
    return { exact: exact.sort(), sums: [...sums].sort(([a], [b]) => a.localeCompare(b)) }
  }
  const left = normalize(expected),
    right = normalize(actual)
  return left !== null && right !== null && sameData(left, right)
}
export function armourIdolLimitKey(augment: CatalogAugment): string | null {
  return isArmourIdol(augment) && augment.limit === 1 ? (augment.limitId ?? augment.name) : null
}
export function armourIdolSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const augment = catalog.augments?.find((a) => a.id === id),
    key = augment && armourIdolLimitKey(augment)
  if (!key) return null
  return (state.sockets ?? []).some((old, i) => {
    const other = catalog.augments?.find((a) => a.id === old)
    return i !== index && other && armourIdolLimitKey(other) === key
  })
    ? '该防具雕像已达到本件限量，请替换已有同组孔位。'
    : null
}
