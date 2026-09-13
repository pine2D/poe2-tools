import type { CatalogStatScalar, CraftCatalog } from './catalog'
import { readNumericValues } from './numeric'
import type { CraftResult } from './rehearsal'

export const STAT_SCALABILITY_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModScalability.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModScalability.lua',
  sha256: 'c0e4edaf1ea37c7bec331747f6a3bd91f21e32d302e4214a4512c790a58b1db9',
} as const

export function statScalabilitySourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter(
    (source) => source.path === STAT_SCALABILITY_SOURCE.path,
  )
  return catalog._meta.sourceCommit === STAT_SCALABILITY_SOURCE.commit &&
    sources.length === 1 &&
    sources[0]?.url === STAT_SCALABILITY_SOURCE.url &&
    sources[0].sha256 === STAT_SCALABILITY_SOURCE.sha256
    ? sources[0].sha256
    : null
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const TOKEN = new RegExp(`[+-]?\\(${NUMBER}[-–—]${NUMBER}\\)|${NUMBER}|\\+?#`, 'g')

/** 构建期模板对应与运行时缩放共用数字位置，保留条件中的固定数字。 */
export function splitStatScalars(line: string) {
  const literals: string[] = []
  const tokens: { text: string; start: number; end: number }[] = []
  let offset = 0
  for (const match of line.matchAll(TOKEN)) {
    literals.push(line.slice(offset, match.index))
    offset = match.index + match[0].length
    tokens.push({ text: match[0], start: match.index, end: offset })
  }
  literals.push(line.slice(offset))
  return { literals, tokens }
}

function precision(formats: readonly string[]): { denominator: number; decimals: number } | null {
  let result = { denominator: 1, decimals: 0 }
  let hasPrecision = false
  for (const format of formats) {
    // 已经是显示方向的数值；对称截断与符号转换可交换，不再翻转显示符号。
    if (format === 'negate') continue
    if (hasPrecision) return null
    switch (format) {
      case 'divide_by_one_hundred':
        result = { denominator: 100, decimals: 2 }
        break
      case 'per_minute_to_per_second':
        result = { denominator: 60, decimals: 1 }
        break
      case 'per_minute_to_per_second_2dp_if_required':
        result = { denominator: 60, decimals: 2 }
        break
      case 'divide_by_ten_1dp_if_required':
        result = { denominator: 10, decimals: 1 }
        break
      case 'milliseconds_to_seconds':
        result = { denominator: 1000, decimals: 2 }
        break
      default:
        return null
    }
    hasPrecision = true
  }
  return result
}

/** 对称四舍五入到显示网格，全程保留有理数以免半格附近浮点偏差。 */
function displayed(point: bigint, denominator: number, scale: number): number {
  const sign = point < 0n ? -1 : 1
  const absolute = point < 0n ? -point : point
  const rounded = (2n * absolute * BigInt(scale) + BigInt(denominator)) / (2n * BigInt(denominator))
  return sign * Number(rounded)
}

function scaleValue(value: number, formats: string[], quality: number): CraftResult<number> {
  const rule = precision(formats)
  if (!rule) return { ok: false, error: '缩放来源含尚未实现的数值格式。' }
  const scale = 10 ** rule.decimals
  const point = Math.round(value * scale)
  const center = Math.round(value * rule.denominator)
  const padding = Math.ceil(rule.denominator / scale) + 1
  if (
    !Number.isSafeInteger(point) ||
    point / scale !== value ||
    !Number.isSafeInteger(center) ||
    Math.abs(center) + padding > Number.MAX_SAFE_INTEGER
  )
    return { ok: false, error: '当前值不符合来源显示精度或超出安全范围。' }
  // 显示四舍五入可能丢失内部值；枚举整个逆像，不能默认采用中点。
  const results = new Set<number>()
  for (let n = center - padding; n <= center + padding; n++) {
    if (displayed(BigInt(n), rule.denominator, scale) !== point) continue
    const next = (BigInt(n) * BigInt(100 + quality)) / 100n
    const output = displayed(next, rule.denominator, scale)
    if (!Number.isSafeInteger(output)) return { ok: false, error: '缩放结果超出安全范围。' }
    results.add(output / scale)
  }
  if (results.size === 0) return { ok: false, error: '当前显示值不能对应来源内部网格。' }
  if (results.size > 1)
    return {
      ok: false,
      error: `显示值对应多个内部值，催化后的可见结果不唯一：${Math.min(...results)}–${Math.max(...results)}。`,
    }
  return { ok: true, value: [...results][0] as number }
}

export function scaleStatLine(
  pattern: string,
  actual: string,
  metadata: readonly CatalogStatScalar[],
  quality: number,
): CraftResult<string> {
  if (!Number.isInteger(quality) || quality < 0 || quality > 40)
    return { ok: false, error: '品质必须是 0–40 的整数。' }
  const split = splitStatScalars(pattern)
  if (metadata.length !== split.tokens.length)
    return { ok: false, error: '缩放资料与属性数字数量不一致。' }
  const ranges = readNumericValues([pattern], [actual])
  if (!ranges.ok) return ranges
  if (ranges.value.some((value) => value === null)) return { ok: false, error: '当前数值未知。' }
  const output = [...split.literals]
  let rangeIndex = 0
  for (const [index, token] of split.tokens.entries()) {
    const input = token.text.includes('(') ? ranges.value[rangeIndex++] : Number(token.text)
    const scalar = metadata[index]
    if (input === undefined || input === null || !Number.isFinite(input) || !scalar)
      return { ok: false, error: '数值与缩放资料不一致。' }
    const scaled = scalar.scalable
      ? scaleValue(input, scalar.formats, quality)
      : { ok: true as const, value: input }
    if (!scaled.ok) return scaled
    output[index] += `${token.text.startsWith('+') && scaled.value >= 0 ? '+' : ''}${scaled.value}`
  }
  return { ok: true, value: output.join('') }
}
