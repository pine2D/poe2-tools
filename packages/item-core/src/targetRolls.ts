import {
  inspectNumericLines,
  type NumericRange,
  readNumericValues,
  renderNumericLines,
} from './numeric'
import type { CraftTargetBound } from './targets'

/** 用整数网格二分比较实际显示值，避免 epsilon 放宽用户的闭区间。 */
export function minimumGridValue(range: NumericRange, bound?: CraftTargetBound): number | null {
  const scale = Math.round(1 / range.step)
  let low = Math.round(range.min * scale)
  let high = Math.round(range.max * scale)
  const lower = bound?.min ?? range.min
  const upper = bound?.max ?? range.max
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (middle / scale < lower) low = middle + 1
    else high = middle
  }
  const value = low / scale
  return value >= lower && value <= upper ? value : null
}

/** 对实际显示文本复核闭区间，普通准备与精华保证属性共用。 */
export function minimumTargetRolls(
  lines: readonly string[],
  bounds: readonly CraftTargetBound[] = [],
): number[] | null {
  const ranges = inspectNumericLines([...lines])
  if (!ranges.ok) return null
  const selected = ranges.value.map((range) =>
    minimumGridValue(
      range,
      bounds.find((bound) => bound.index === range.index),
    ),
  )
  if (selected.some((value) => value === null)) return null
  const values = selected.filter((value): value is number => value !== null)
  const rendered = renderNumericLines([...lines], values)
  if (!rendered.ok) return null
  const actual = readNumericValues([...lines], rendered.value)
  if (
    !actual.ok ||
    !bounds.every((bound) => {
      const value = actual.value[bound.index]
      return (
        value !== null &&
        value !== undefined &&
        (bound.min === undefined || value >= bound.min) &&
        (bound.max === undefined || value <= bound.max)
      )
    })
  )
    return null
  return values
}

/** 已满足的原值只在可生成网格上才保留；这不收紧原文导入允许的实值。 */
export function targetRollsPreservingValues(
  lines: readonly string[],
  actual: readonly string[],
  bounds: readonly CraftTargetBound[] = [],
): number[] | null {
  const minimum = minimumTargetRolls(lines, bounds)
  if (minimum === null) return null
  const existing = readNumericValues(lines, actual)
  return minimum.map((value, index) => {
    const old = existing.ok ? existing.value[index] : null
    const bound = bounds.find((entry) => entry.index === index)
    return old != null &&
      (bound?.min === undefined || old >= bound.min) &&
      (bound?.max === undefined || old <= bound.max) &&
      renderNumericLines(
        lines,
        minimum.map((number, position) => (position === index ? old : number)),
      ).ok
      ? old
      : value
  })
}
