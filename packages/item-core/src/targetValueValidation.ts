import type { CraftCatalog } from './catalog'
import { projectCraftTargetValues } from './effectiveTargetValues'
import { inspectNumericLines } from './numeric'
import type { CraftResult, CraftState } from './rehearsal'
import type { CraftTargetBound, CraftTargetValues } from './targets'

function hasOnlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  )
}

/** 只校验单条条件；目标关联与共存、存储对象树和完整状态由调用方核对。 */
export function readCraftTargetValue(
  catalog: CraftCatalog,
  baseId: string,
  value: unknown,
  runtime?: { state: CraftState | undefined },
): CraftResult<CraftTargetValues> {
  if (
    !hasOnlyKeys(value, ['modId', 'bounds', 'basis']) ||
    (Object.hasOwn(value, 'basis') && value.basis !== 'effective') ||
    typeof value.modId !== 'string' ||
    !Array.isArray(value.bounds) ||
    value.bounds.length < 1 ||
    value.bounds.length > 32
  )
    return { ok: false, error: '数值目标必须关联唯一的已选词缀，并包含 1–32 个条件。' }
  const mod = catalog.modifiers.find((entry) => entry.id === value.modId)
  if (mod === undefined) return { ok: false, error: '数值目标词缀不在制作目录中。' }
  const ranges = inspectNumericLines(mod.lines)
  if (!ranges.ok) return ranges
  if (value.basis === 'effective' && runtime) {
    const state = runtime.state
    if (!state || state.baseId !== baseId)
      return { ok: false, error: '有效值目标需要当前装备状态。' }
    const actuals = state.affixes
      .filter((affix) => affix.modId === mod.id)
      .map((affix) => affix.lines)
    const projections = (actuals.length ? actuals : [undefined]).map((actual) =>
      projectCraftTargetValues(
        catalog,
        state,
        mod,
        { modId: mod.id, basis: 'effective', bounds: [] },
        actual,
      ),
    )
    const projection = projections.find((entry) => entry.ok) ?? projections[0]
    if (projection && !projection.ok) return projection
  }
  const indices = new Set<number>()
  const bounds: CraftTargetBound[] = []
  for (const bound of value.bounds) {
    if (
      !hasOnlyKeys(bound, ['index', 'min', 'max']) ||
      typeof bound.index !== 'number' ||
      !Number.isInteger(bound.index) ||
      bound.index < 0 ||
      indices.has(bound.index)
    )
      return { ok: false, error: '数值条件必须使用唯一的非负整数范围索引。' }
    const range = ranges.value[bound.index]
    if (range === undefined) return { ok: false, error: '数值条件索引不在词缀的可识别范围内。' }
    const hasMin = Object.hasOwn(bound, 'min')
    const hasMax = Object.hasOwn(bound, 'max')
    if (!hasMin && !hasMax) return { ok: false, error: '数值条件至少需要一个上限或下限。' }
    const copy: CraftTargetBound = { index: bound.index }
    for (const key of ['min', 'max'] as const) {
      if (!Object.hasOwn(bound, key)) continue
      const threshold = bound[key]
      if (
        typeof threshold !== 'number' ||
        !Number.isFinite(threshold) ||
        (value.basis !== 'effective' && (threshold < range.min || threshold > range.max))
      )
        return { ok: false, error: `数值条件必须是 ${range.min}–${range.max} 内的有限数值。` }
      // 条件是比较阈值，不受演练生成值的显示网格约束。
      copy[key] = threshold
    }
    if (copy.min !== undefined && copy.max !== undefined && copy.min > copy.max)
      return { ok: false, error: '数值条件下限不能大于上限。' }
    indices.add(bound.index)
    bounds.push(copy)
  }
  return {
    ok: true,
    value: {
      modId: value.modId,
      bounds,
      ...(value.basis === 'effective' ? { basis: 'effective' as const } : {}),
    },
  }
}
