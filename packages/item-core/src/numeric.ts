import { readCatalogLineValues } from './catalogMatch'
import type { CraftResult } from './rehearsal'

export interface NumericRange {
  index: number
  lineIndex: number
  min: number
  max: number
  /** 目录端点显示精度推导的网格，不代表已核对游戏内部步长。 */
  step: number
}

interface RangeToken extends NumericRange {
  start: number
  end: number
  positive: boolean
  precision: number
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const RANGE = new RegExp(`\\((${NUMBER})[-–—](${NUMBER})\\)`, 'g')

function inspectTokens(patterns: readonly string[]): CraftResult<RangeToken[]> {
  const ranges: RangeToken[] = []
  for (const [lineIndex, line] of patterns.entries()) {
    const matches = [...line.matchAll(RANGE)]
    if (matches.length > 0 && /Grants Skill/i.test(line))
      return { ok: false, error: '授予技能的等级范围机制尚未核对，不能作为普通数值重掷。' }
    const rest = line.replace(RANGE, '')
    if (/\([+-]?\d[^)]*(?:[-–—]|\bto\b)[^)]*\)/i.test(rest))
      return { ok: false, error: `第 ${lineIndex + 1} 行存在尚未支持的数值范围。` }
    for (const match of matches) {
      const leadingSign = /([+-])\s*$/.exec(line.slice(0, match.index))
      const prefix = leadingSign?.[1]
      const sign = prefix === '-' ? -1 : 1
      const a = Number(match[1]) * sign
      const b = Number(match[2]) * sign
      const precision = Math.max(
        ...[match[1], match[2]].map((text) => text?.split('.')[1]?.length ?? 0),
      )
      const scale = 10 ** precision
      const min = Math.min(a, b)
      const max = Math.max(a, b)
      if (
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        precision > 12 ||
        !Number.isSafeInteger(Math.round(min * scale)) ||
        !Number.isSafeInteger(Math.round(max * scale)) ||
        !Number.isSafeInteger(Math.round((max - min) * scale) + 1)
      )
        return { ok: false, error: `第 ${lineIndex + 1} 行的数值范围超出安全显示精度。` }
      ranges.push({
        index: ranges.length,
        lineIndex,
        min,
        max,
        step: 1 / scale,
        start: leadingSign?.index ?? match.index,
        end: match.index + match[0].length,
        positive: prefix === '+',
        precision,
      })
    }
  }
  return { ok: true, value: ranges }
}

export function inspectNumericLines(patterns: readonly string[]): CraftResult<NumericRange[]> {
  const tokens = inspectTokens(patterns)
  return tokens.ok
    ? {
        ok: true,
        value: tokens.value.map(({ index, lineIndex, min, max, step }) => ({
          index,
          lineIndex,
          min,
          max,
          step,
        })),
      }
    : tokens
}

function validValue(range: NumericRange, value: number): boolean {
  if (!Number.isFinite(value) || value < range.min || value > range.max) return false
  // 按绝对显示精度还原网格，避免相近端点相减放大浮点误差。
  const scale = Math.round(1 / range.step)
  const point = Math.round(value * scale)
  return Number.isSafeInteger(point) && point / scale === value
}

export function renderNumericLines(
  patterns: readonly string[],
  values: readonly number[],
): CraftResult<string[]> {
  const inspected = inspectTokens(patterns)
  if (!inspected.ok) return inspected
  if (!Array.isArray(values) || values.length !== inspected.value.length)
    return { ok: false, error: `必须提供 ${inspected.value.length} 个数值。` }
  const lines = [...patterns]
  for (const range of [...inspected.value].reverse()) {
    const value = values[range.index]
    if (value === undefined || !validValue(range, value))
      return {
        ok: false,
        error: `第 ${range.index + 1} 个数值必须在 ${range.min}–${range.max} 内，并符合 ${range.step} 的显示精度。`,
      }
    const line = lines[range.lineIndex] ?? ''
    const rendered = `${range.positive && value >= 0 ? '+' : ''}${Number(value.toFixed(range.precision))}(${range.min}-${range.max})`
    lines[range.lineIndex] = line.slice(0, range.start) + rendered + line.slice(range.end)
  }
  return { ok: true, value: lines }
}

export function readNumericValues(
  patterns: readonly string[],
  actual: readonly string[],
): CraftResult<(number | null)[]> {
  const inspected = inspectNumericLines(patterns)
  if (!inspected.ok) return inspected
  const lines = readCatalogLineValues(patterns, actual)
  if (lines === null) return { ok: false, error: '实际属性行与目录范围不一致。' }
  // 显示网格只约束演练生成；不以未证实的内部步长收紧既有原文读取。
  return { ok: true, value: lines.flat() }
}

/** 每个显示网格独立等概率；这只是演练模型，不是服务器分布证据。 */
export function sampleNumericValues(
  patterns: readonly string[],
  random: () => number,
): CraftResult<number[]> {
  const inspected = inspectTokens(patterns)
  if (!inspected.ok) return inspected
  const values: number[] = []
  for (const range of inspected.value) {
    const sampled = random()
    if (!Number.isFinite(sampled) || sampled < 0 || sampled >= 1)
      return { ok: false, error: '随机源必须返回 [0, 1) 内的有限数值。' }
    const count = Math.round((range.max - range.min) / range.step) + 1
    values.push(
      Number((range.min + Math.floor(sampled * count) * range.step).toFixed(range.precision)),
    )
  }
  return { ok: true, value: values }
}
