import { astridSourceValid } from './astridRune'
import type { CatalogAugment, CatalogBase, CraftCatalog } from './catalog'
import type { CraftState } from './rehearsal'
import { SCEPTRE_BASES, SCEPTRE_RECORDS, SCEPTRE_SCALABILITY } from './sceptreAugmentData'
import { scaleStatLineByEffect, statScalabilitySourceHash } from './statScalability'

export const SCEPTRE_AUGMENT_NAMES: readonly string[] = SCEPTRE_RECORDS.map((a) => a.name)
export const SCEPTRE_BASE_IDS: readonly string[] = SCEPTRE_BASES.map((b) => b.id)
export function isSupportedSceptreBaseId(id: unknown): boolean {
  return SCEPTRE_BASE_IDS.some((value) => value === id)
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
export function isSupportedSceptreBase(base: CatalogBase): boolean {
  return SCEPTRE_BASES.some((b) => b.id === base.id && sameData(base, b))
}
export function isSceptreAugmentId(id: unknown): boolean {
  return SCEPTRE_RECORDS.some((a) => a.id === id)
}
const numberPattern = /[+-]?\d+(?:\.\d+)?/g
const template = (line: string) =>
  line.replace(numberPattern, (n) => (n.startsWith('+') ? '+#' : n.startsWith('-') ? '-#' : '#'))
function values(line: string): number[] {
  return (line.match(numberPattern) ?? []).map(Number)
}
export function isSceptreAugment(augment: CatalogAugment, effective = false): boolean {
  const source = SCEPTRE_RECORDS.find((a) => a.id === augment.id)
  if (!source) return false
  if (!effective) return sameData(augment, source)
  const { lines, ...metadata } = augment,
    { lines: patterns, ...expected } = source
  return (
    sameData(metadata, expected) &&
    lines.length === patterns.length &&
    patterns.every((p, i) => {
      const line = lines[i]
      return (
        typeof line === 'string' &&
        template(p) === template(line) &&
        values(line).every(
          (n, j) => Number.isFinite(n) && Math.abs(n) >= Math.abs(values(p)[j] ?? Infinity),
        )
      )
    })
  )
}
export function sceptreAugmentFits(
  catalog: CraftCatalog,
  state: CraftState,
  augment: CatalogAugment,
): boolean {
  const base = catalog.bases.find((b) => b.id === state.baseId)
  return (
    !!base &&
    isSupportedSceptreBase(base) &&
    isSceptreAugment(augment) &&
    astridSourceValid(catalog) &&
    catalog.augments?.filter((a) => a.id === augment.id).length === 1 &&
    !state.sourceText?.split(/\r?\n/).some((l) => l.trim() === 'Sanctified')
  )
}
export function scaleSceptreAugment(
  catalog: CraftCatalog,
  augment: CatalogAugment,
  increase: number,
): CatalogAugment | null {
  if (
    !isSceptreAugment(augment) ||
    !astridSourceValid(catalog) ||
    statScalabilitySourceHash(catalog) === null ||
    !Number.isInteger(increase) ||
    increase < 0 ||
    increase > 100
  )
    return null
  const lines: string[] = []
  for (const line of augment.lines) {
    const metadata = catalog.scalability?.[line]
    if (!metadata || !sameData(metadata, SCEPTRE_SCALABILITY[line])) return null
    // 固定 ModRunes 值不是装备未知掷值；0.5 / 0.2 分别使用 30 / 12 的分钟格点。
    // 不能使用显示逆像区间，也不能直接对小数字符串分别乘算。
    const minute =
      augment.name === 'Boar Idol'
        ? { value: 30, scale: 10 }
        : augment.name === 'Idol of Maxarius'
          ? { value: 12, scale: 100 }
          : null
    if (minute) {
      const internal = Math.trunc((minute.value * (100 + increase)) / 100)
      const displayed = Math.floor((2 * internal * minute.scale + 60) / 120) / minute.scale
      lines.push(line.replace(numberPattern, String(displayed)))
      continue
    }
    const result = scaleStatLineByEffect(line, line, metadata, increase)
    if (!result.ok) return null
    lines.push(result.value)
  }
  return { ...augment, lines }
}
export function isSceptreEffectLine(line: string): boolean {
  return (
    SCEPTRE_RECORDS.some((a) => a.lines.some((p) => template(p) === template(line))) &&
    values(line).every(
      (n) => Number.isSafeInteger(Math.round(n * 100)) && Math.round(n * 100) / 100 === n,
    )
  )
}
/** 八种无限量神像才合并同模板值；限量/条件/无数字效果按整行与重复次数核对。 */
export function sceptreSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  const normalize = (lines: readonly string[]) => {
    const sums = new Map<string, number[]>(),
      exact: string[] = []
    for (const line of lines) {
      if (!isSceptreEffectLine(line)) return null
      const key = template(line)
      if (
        SCEPTRE_RECORDS.some(
          (a) => a.limit === undefined && a.lines.some((p) => template(p) === key),
        )
      ) {
        const old = sums.get(key) ?? values(line).map(() => 0)
        sums.set(
          key,
          values(line).map((n, i) => (old[i] ?? 0) + Math.round(n * 100)),
        )
      } else exact.push(line)
    }
    return { exact: exact.sort(), sums: [...sums].sort(([a], [b]) => a.localeCompare(b)) }
  }
  const left = normalize(expected),
    right = normalize(actual)
  return left !== null && right !== null && sameData(left, right)
}
export function sceptreLimitKey(augment: CatalogAugment): string | null {
  return isSceptreAugment(augment) && augment.limit === 1 ? (augment.limitId ?? augment.name) : null
}
export function sceptreSocketError(
  catalog: CraftCatalog,
  state: CraftState,
  index: number,
  id: string,
): string | null {
  const augment = catalog.augments?.find((a) => a.id === id),
    key = augment && sceptreLimitKey(augment)
  if (!key) return null
  return (state.sockets ?? []).some((old, i) => {
    const other = catalog.augments?.find((a) => a.id === old)
    return i !== index && other && sceptreLimitKey(other) === key
  })
    ? '该权杖镶嵌物已达到本件限量，请替换已有同组孔位。'
    : null
}
