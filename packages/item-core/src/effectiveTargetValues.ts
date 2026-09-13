import { readStatAnnotations } from './annotations'
import type { CraftCatalog } from './catalog'
import { matchCatalogLineOrder } from './catalogMatch'
import { CATALYSTS, type CatalystQuality, isCatalystQuality } from './catalystQuality'
import {
  inspectNumericLines,
  type NumericRange,
  readNumericValues,
  renderNumericLines,
} from './numeric'
import type { CraftResult } from './rehearsal'
import {
  NO_STAT_GRID_PREIMAGE,
  type StatValueBounds,
  scaleStatValueBounds,
  splitStatScalars,
  statScalabilitySourceHash,
  statValuePrecision,
} from './statScalability'
import { minimumTargetRolls, targetRollsPreservingValues } from './targetRolls'
import type { CraftTargetBound } from './targets'

export interface TargetValueProjection {
  ranges: NumericRange[]
  read: (actual: readonly string[]) => CraftResult<(StatValueBounds | null)[]>
  /** 无基础网格解返回 null，不把空解退化成不限数值。 */
  baseBounds: (bounds: readonly CraftTargetBound[]) => CraftResult<CraftTargetBound[] | null>
}

type Transform = (value: number) => CraftResult<StatValueBounds>
const identity: Transform = (value) => ({ ok: true, value: { min: value, max: value } })

/** 每行标签独立输入，显式整组与固有属性使用相同数值规则。 */
export function projectTargetValues(
  catalog: CraftCatalog,
  catalyst: CatalystQuality | undefined,
  lines: readonly string[],
  tags: readonly (readonly string[])[],
  actual?: readonly string[],
): CraftResult<TargetValueProjection> {
  const ranges = inspectNumericLines(lines)
  if (!ranges.ok) return ranges
  if (tags.length !== lines.length || (actual !== undefined && actual.length !== lines.length))
    return { ok: false, error: '有效值目标的属性行、标签或当前文本数量不一致。' }
  if (catalyst !== undefined && !isCatalystQuality(catalyst))
    return { ok: false, error: '有效值目标的催化品质无效。' }
  const definition = CATALYSTS.find((entry) => entry.id === catalyst?.id)
  const variableLines = new Set(ranges.value.map((range) => range.lineIndex))
  const actualOrder =
    actual === undefined ? undefined : matchCatalogLineOrder(lines, actual, variableLines)
  if (actualOrder === null)
    return { ok: false, error: '属性行身份存在歧义，不能将数值与缩放尾注对应。' }
  const transforms: Transform[] = []
  const precisions: ReturnType<typeof statValuePrecision>[] = []
  for (const [lineIndex, line] of lines.entries()) {
    const matched =
      catalyst &&
      catalyst.quality > 0 &&
      definition &&
      tags[lineIndex]?.some((tag) => (definition.tags as readonly string[]).includes(tag))
    const unscalable = readStatAnnotations(
      actual?.[actualOrder?.[lineIndex] ?? lineIndex] ?? '',
    ).unscalable
    const tokens = splitStatScalars(line).tokens
    const metadata = catalog.scalability?.[line]
    if (
      matched &&
      !unscalable &&
      (statScalabilitySourceHash(catalog) === null ||
        !metadata ||
        metadata.length !== tokens.length)
    )
      return { ok: false, error: '此属性缺少可核验的缩放资料，暂不能设置品质后有效值条件。' }
    for (const [position, token] of tokens.entries()) {
      if (!token.text.includes('(')) continue
      const scalar = metadata?.[position]
      if (matched && !unscalable && !scalar)
        return { ok: false, error: '有效值目标的属性数字与缩放资料不一致。' }
      transforms.push(
        matched && !unscalable && scalar?.scalable
          ? (value) => scaleStatValueBounds(value, scalar.formats, catalyst.quality)
          : identity,
      )
      precisions.push(
        matched && !unscalable && scalar?.scalable ? statValuePrecision(scalar.formats) : null,
      )
    }
  }
  if (transforms.length !== ranges.value.length)
    return { ok: false, error: '有效值目标的数值范围无法对应。' }
  const projected: NumericRange[] = []
  for (const range of ranges.value) {
    const transform = transforms[range.index] as Transform
    const low = transform(range.min)
    if (!low.ok) return low
    const high = transform(range.max)
    if (!high.ok) return high
    projected.push({ ...range, min: low.value.min, max: high.value.max })
  }
  const read: TargetValueProjection['read'] = (text) => {
    const order = matchCatalogLineOrder(lines, text, variableLines)
    if (order === null) return { ok: false, error: '实际属性行不能唯一对应有效值目标。' }
    const values = readNumericValues(
      lines,
      order.map((index) => text[index] ?? ''),
    )
    if (!values.ok) return values
    const output: (StatValueBounds | null)[] = []
    for (const range of ranges.value) {
      const value = values.value[range.index]
      if (value === null || value === undefined) {
        output.push(null)
        continue
      }
      const transform = readStatAnnotations(text[order[range.lineIndex] ?? -1] ?? '').unscalable
        ? identity
        : (transforms[range.index] as Transform)
      const scaled = transform(value)
      if (!scaled.ok) return scaled
      output.push(scaled.value)
    }
    return { ok: true, value: output }
  }
  const baseBounds: TargetValueProjection['baseBounds'] = (bounds) => {
    const result: CraftTargetBound[] = []
    const seen = new Set<number>()
    for (const bound of bounds) {
      const range = ranges.value[bound.index]
      if (
        !range ||
        !Number.isInteger(bound.index) ||
        seen.has(bound.index) ||
        (bound.min === undefined && bound.max === undefined) ||
        (bound.min !== undefined && !Number.isFinite(bound.min)) ||
        (bound.max !== undefined && !Number.isFinite(bound.max)) ||
        (bound.min !== undefined && bound.max !== undefined && bound.min > bound.max)
      )
        return { ok: false, error: '有效值条件必须使用唯一范围索引及有效闭区间。' }
      seen.add(bound.index)
      const transform = transforms[bound.index] as Transform
      const scale = Math.round(1 / range.step)
      const start = Math.round(range.min * scale)
      const end = Math.round(range.max * scale)
      const precision = precisions[bound.index]
      // 目录端点精度可能细于来源显示网格；先跳到来源网格，不能逐个扫描细分点。
      const stride = precision ? Math.max(1, scale / 10 ** precision.decimals) : 1
      const nearest = (
        point: number,
        direction: 1 | -1,
      ): CraftResult<{ point: number; interval: StatValueBounds } | null> => {
        let candidate =
          (direction === 1 ? Math.ceil(point / stride) : Math.floor(point / stride)) * stride
        while (candidate >= start && candidate <= end) {
          const value = transform(candidate / scale)
          if (value.ok) return { ok: true, value: { point: candidate, interval: value.value } }
          // 例如每分钟整数转两位小数的每秒数值会留下空格；其他错误仍须拒绝。
          if (value.error !== NO_STAT_GRID_PREIMAGE) return value
          candidate += direction * stride
        }
        return { ok: true, value: null }
      }
      // 源缩放在正品质下单调；分别找所有可能结果均满足下限/上限的边界。
      let low = start
      let high = end
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2)
        const value = nearest(middle, 1)
        if (!value.ok) return value
        if (value.value && bound.min !== undefined && value.value.interval.min < bound.min)
          low = value.value.point + 1
        else high = middle
      }
      const first = nearest(low, 1)
      if (!first.ok) return first
      low = start
      high = end
      while (low < high) {
        const middle = low + Math.ceil((high - low) / 2)
        const value = nearest(middle, -1)
        if (!value.ok) return value
        if (value.value && bound.max !== undefined && value.value.interval.max > bound.max)
          high = value.value.point - 1
        else low = middle
      }
      const last = nearest(low, -1)
      if (!last.ok) return last
      if (
        !first.value ||
        !last.value ||
        first.value.point > last.value.point ||
        (bound.min !== undefined && first.value.interval.min < bound.min) ||
        (bound.max !== undefined && last.value.interval.max > bound.max)
      )
        return { ok: true, value: null }
      result.push({
        index: bound.index,
        min: first.value.point / scale,
        max: last.value.point / scale,
      })
    }
    return { ok: true, value: result }
  }
  return { ok: true, value: { ranges: projected, read, baseBounds } }
}

/** 显式目标按整组标签投影；调用方保留原阈值，不把基础反解写回目标。 */
export function projectCraftTargetValues(
  catalog: CraftCatalog,
  state: import('./rehearsal').CraftState,
  mod: import('./catalog').CatalogMod,
  goal?: import('./targets').CraftTargetValues,
  actual?: readonly string[],
): CraftResult<TargetValueProjection> {
  return projectTargetValues(
    catalog,
    goal?.basis === 'effective' ? state.catalyst : undefined,
    mod.lines,
    mod.lines.map(() => mod.tags),
    actual,
  )
}

export function minimumCraftTargetRolls(
  catalog: CraftCatalog,
  state: import('./rehearsal').CraftState,
  mod: import('./catalog').CatalogMod,
  goal?: import('./targets').CraftTargetValues,
  actual?: readonly string[],
): number[] | null {
  if (goal?.basis !== 'effective')
    return actual
      ? targetRollsPreservingValues(mod.lines, actual, goal?.bounds)
      : minimumTargetRolls(mod.lines, goal?.bounds)
  const projected = projectCraftTargetValues(catalog, state, mod, goal, actual)
  if (!projected.ok) return null
  return projectedTargetRolls(projected.value, mod.lines, goal.bounds, actual)
}

/** 反解闭区间仍可能包含来源网格空档；保留旧值和输出前均复核实际投影。 */
export function projectedTargetRolls(
  projection: TargetValueProjection,
  lines: readonly string[],
  targetBounds: readonly CraftTargetBound[],
  actual?: readonly string[],
): number[] | null {
  const bounds = projection.baseBounds(targetBounds)
  if (!bounds.ok || bounds.value === null) return null
  const valid = (values: number[] | null): values is number[] => {
    if (values === null) return false
    const rendered = renderNumericLines(lines, values)
    if (!rendered.ok) return false
    const read = projection.read(rendered.value)
    return (
      read.ok &&
      targetBounds.every((bound) => matchesTargetInterval(read.value[bound.index], bound))
    )
  }
  if (actual) {
    const preserved = targetRollsPreservingValues(lines, actual, bounds.value)
    if (valid(preserved)) return preserved
  }
  const minimum = minimumTargetRolls(lines, bounds.value)
  return valid(minimum) ? minimum : null
}

export function matchesTargetInterval(
  value: StatValueBounds | null | undefined,
  bound: CraftTargetBound,
): boolean {
  return (
    value != null &&
    (bound.min === undefined || value.min >= bound.min) &&
    (bound.max === undefined || value.max <= bound.max)
  )
}
