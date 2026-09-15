import { resolveCraftImplicitPatterns } from './beltImplicits'
import type { CatalogBase, CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import {
  matchesTargetInterval,
  projectedTargetRolls,
  projectTargetValues,
} from './effectiveTargetValues'
import { matchesGrantedSkillImplicitLines } from './grantedSkills'
import { uniqueMapping } from './lineMapping'
import { inspectNumericLines, type NumericRange, readNumericValues } from './numeric'
import {
  type CraftResult,
  type CraftState,
  createCraftState,
  prepareCraftOperation,
} from './rehearsal'
import { minimumTargetRolls, targetRollsPreservingValues } from './targetRolls'
import type { CraftTargetBound } from './targets'

export interface CraftImplicitTargetValues {
  basis?: 'effective'
  lineIndex: number
  bounds: CraftTargetBound[]
}
export interface CraftImplicitTargetCandidate {
  lineIndex: number
  line: string
  ranges: NumericRange[]
  actual: (number | null)[]
  rerollable: boolean
  reasons: string[]
}
export interface CraftImplicitTargetStatus {
  lineIndex: number
  matched: boolean
  numeric: (CraftTargetBound & {
    actual: number | null
    actualRange?: { min: number; max: number }
    matched: boolean
  })[]
  reasons: string[]
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })
function descriptors(base: CatalogBase) {
  return (base.implicit?.split('\n') ?? []).flatMap((line, lineIndex) => {
    if (/^Grants Skill:/i.test(line)) return []
    const numeric = inspectNumericLines([line])
    const fixedCharm = base.type === 'Belt' && base.charmLimit === 0 && line === 'Has 1 Charm Slot'
    const ranges = fixedCharm
      ? [{ index: 0, lineIndex: 0, min: 1, max: 1, step: 1 }]
      : numeric.ok
        ? numeric.value
        : []
    return ranges.length ? [{ lineIndex, line, ranges }] : []
  })
}
const keys = (value: unknown, allowed: string[]): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.includes(key))

export function validateCraftImplicitTargets(
  catalog: CraftCatalog,
  baseId: string,
  values: unknown,
  state?: CraftState,
): CraftResult<CraftImplicitTargetValues[]> {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) return fail('固有目标基底不在目录中。')
  const checked = readCraftImplicitTargets(values, descriptors(base))
  if (!checked.ok) return checked
  for (const goal of checked.value) {
    if (goal.basis !== 'effective') continue
    if (!state || state.baseId !== baseId) return fail('有效固有目标需要当前装备状态。')
    const projection = projectImplicitTargetValues(catalog, state, goal.lineIndex)
    if (!projection.ok) return projection
    if (!goal.bounds.every((bound) => projection.value.ranges[bound.index] !== undefined))
      return fail('此固有属性不支持有效数值目标。')
  }
  return checked
}

/** 目录行与标签资格独立校验，不使用当前装备的行映射或缩放效果。 */
export function validateStoredCraftImplicitTargets(
  catalog: CraftCatalog,
  baseId: string,
  values: unknown,
): CraftResult<CraftImplicitTargetValues[]> {
  try {
    if (!isPlainProjectJSON(values)) return fail('存储固有目标必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('存储固有目标对象无法安全检查。')
  }
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) return fail('固有目标基底不在目录中。')
  const checked = readCraftImplicitTargets(values, descriptors(base))
  if (!checked.ok) return checked
  for (const goal of checked.value) {
    if (goal.basis === 'effective' && !Array.isArray(base.implicitTags[goal.lineIndex]))
      return fail('固有属性标签或目录身份未知，不能保存有效条件。')
  }
  return checked
}

/** 序列化共用结构校验，防止 JSON 丢弃 undefined 或将非有限数值改成 null。 */
export function readCraftImplicitTargets(
  values: unknown,
  candidates?: ReturnType<typeof descriptors>,
): CraftResult<CraftImplicitTargetValues[]> {
  if (!Array.isArray(values) || values.length > 32)
    return fail('固有目标必须是最多32行条件的数组。')
  const seen = new Set<number>()
  const result: CraftImplicitTargetValues[] = []
  let count = 0
  for (const value of values) {
    if (
      !keys(value, ['lineIndex', 'bounds', 'basis']) ||
      (Object.hasOwn(value, 'basis') && value.basis !== 'effective') ||
      !Number.isSafeInteger(value.lineIndex) ||
      typeof value.lineIndex !== 'number' ||
      value.lineIndex < 0 ||
      seen.has(value.lineIndex) ||
      !Array.isArray(value.bounds) ||
      value.bounds.length < 1 ||
      value.bounds.length > 32
    )
      return fail('固有目标必须关联唯一目录行，并包含1–32个条件。')
    const candidate = candidates?.find((entry) => entry.lineIndex === value.lineIndex)
    if (candidates && !candidate) return fail('该目录行不是可支持的普通数值固有目标。')
    const indexes = new Set<number>()
    const bounds: CraftTargetBound[] = []
    for (const bound of value.bounds) {
      if (
        !keys(bound, ['index', 'min', 'max']) ||
        typeof bound.index !== 'number' ||
        !Number.isInteger(bound.index) ||
        bound.index < 0 ||
        bound.index >= 32 ||
        indexes.has(bound.index)
      )
        return fail('固有条件必须使用唯一的行内范围索引。')
      const range = candidate?.ranges[bound.index]
      if ((candidates && !range) || (!Object.hasOwn(bound, 'min') && !Object.hasOwn(bound, 'max')))
        return fail('固有条件缺少上下限或范围索引无效。')
      const copy: CraftTargetBound = { index: bound.index }
      for (const name of ['min', 'max'] as const) {
        if (!Object.hasOwn(bound, name)) continue
        const n = bound[name]
        if (
          typeof n !== 'number' ||
          !Number.isFinite(n) ||
          (value.basis !== 'effective' && range && (n < range.min || n > range.max))
        )
          return fail('固有条件必须是目录范围内的有限数值。')
        copy[name] = n
      }
      if (copy.min !== undefined && copy.max !== undefined && copy.min > copy.max)
        return fail('固有条件下限不能大于上限。')
      indexes.add(bound.index)
      bounds.push(copy)
    }
    count += bounds.length
    if (count > 32) return fail('固有目标整体最多32个范围条件。')
    seen.add(value.lineIndex)
    result.push({
      lineIndex: value.lineIndex,
      bounds,
      ...(value.basis === 'effective' ? { basis: 'effective' as const } : {}),
    })
  }
  return { ok: true, value: result }
}

function mapped(catalog: CraftCatalog, state: CraftState) {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  const base = catalog.bases.find((entry) => entry.id === state.baseId)
  if (!base) return fail('固有目标基底不存在。')
  const effective = resolveCraftImplicitPatterns(base, checked.value)
  if (!effective.ok) return effective
  const original = base.implicit?.split('\n') ?? []
  const actual = checked.value.implicitLines ?? original
  const charm = effective.value.charm
  const edges = original.map((line) =>
    actual.flatMap((value, index) => {
      if (charm && /^Has .+ Charm Slots?$/.test(line))
        return index === charm.lineIndex ? [index] : []
      if (charm?.lineIndex === index) return []
      return matchesGrantedSkillImplicitLines([line], [value]) ? [index] : []
    }),
  )
  const mapping = uniqueMapping(edges)
  if (!mapping) return fail('固有属性目录行存在重复或歧义，不能确定目标身份。')
  // 腰带有效模板跟随实际行序，非腰带沿用目录顺序；两种操作顺序都与核心一致。
  const patternPositions = mapping.map((position, index) => (charm ? position : index))
  return {
    ok: true as const,
    value: { base, mapping, patternPositions, patterns: effective.value.patterns, actual, charm },
  }
}

export function projectImplicitTargetValues(
  catalog: CraftCatalog,
  state: CraftState,
  lineIndex: number,
) {
  const resolved = mapped(catalog, state)
  if (!resolved.ok) return resolved
  const { base, mapping, patternPositions, patterns, actual } = resolved.value
  const pattern = patterns[patternPositions[lineIndex] ?? -1]
  const tags = base.implicitTags[lineIndex]
  if (pattern === undefined || tags === undefined)
    return fail('固有属性标签或目录身份未知，不能判断有效条件。')
  return projectTargetValues(
    catalog,
    state.catalyst,
    [pattern],
    [tags],
    [actual[mapping[lineIndex] ?? -1] ?? pattern],
  )
}

export function craftImplicitTargetCandidates(
  catalog: CraftCatalog,
  state: CraftState,
): CraftResult<CraftImplicitTargetCandidate[]> {
  const resolved = mapped(catalog, state)
  if (!resolved.ok) return resolved
  const { base, mapping, patternPositions, patterns, actual, charm } = resolved.value
  const divine = prepareCraftOperation(catalog, state, 'divine')
  return {
    ok: true,
    value: descriptors(base).map((entry) => {
      const position = mapping[entry.lineIndex] ?? -1
      const slot = charm?.lineIndex === position ? charm : null
      const numbers = readNumericValues([entry.line], [actual[position] ?? ''])
      const currentRanges = inspectNumericLines([
        patterns[patternPositions[entry.lineIndex] ?? -1] ?? '',
      ])
      const values = slot ? [slot.value] : numbers.ok ? numbers.value : entry.ranges.map(() => null)
      const reasons: string[] = []
      if (values.some((value) => value === null)) reasons.push('当前实际数值未知。')
      if (!divine.ok) reasons.push(divine.error)
      if (slot?.fixed) reasons.push('咒符栏固定为1，不能重掷栏数。')
      else if (slot?.range) reasons.push(`当前咒符栏范围为1–${slot.range.max}。`)
      return {
        ...entry,
        ranges: entry.ranges.map((range) => ({ ...range })),
        actual: values,
        rerollable:
          divine.ok &&
          currentRanges.ok &&
          currentRanges.value.some((range) => range.min < range.max),
        reasons,
      }
    }),
  }
}

export function analyzeCraftImplicitTargets(
  catalog: CraftCatalog,
  state: CraftState,
  values: readonly CraftImplicitTargetValues[],
): CraftResult<CraftImplicitTargetStatus[]> {
  const validated = validateCraftImplicitTargets(catalog, state.baseId, values, state)
  if (!validated.ok) return validated
  if (validated.value.length === 0) return { ok: true, value: [] }
  const candidates = craftImplicitTargetCandidates(catalog, state)
  if (!candidates.ok) return candidates
  const resolved = mapped(catalog, state)
  if (!resolved.ok) return resolved
  return {
    ok: true,
    value: validated.value.map((goal) => {
      const candidate = candidates.value.find((entry) => entry.lineIndex === goal.lineIndex)
      const projection =
        goal.basis === 'effective'
          ? projectImplicitTargetValues(catalog, state, goal.lineIndex)
          : null
      const effective = projection?.ok
        ? projection.value.read([
            resolved.value.actual[resolved.value.mapping[goal.lineIndex] ?? -1] ?? '',
          ])
        : null
      const numeric = goal.bounds.map((bound) => {
        const baseValue = candidate?.actual[bound.index]
        const interval =
          goal.basis === 'effective'
            ? effective?.ok
              ? effective.value[bound.index]
              : null
            : baseValue == null
              ? null
              : { min: baseValue, max: baseValue }
        return {
          ...bound,
          actual: interval && interval.min === interval.max ? interval.min : null,
          matched: matchesTargetInterval(interval, bound),
          ...(interval && interval.min !== interval.max ? { actualRange: interval } : {}),
        }
      })
      const matched = numeric.every((entry) => entry.matched)
      const reasons = [...(candidate?.reasons ?? [])]
      if (!matched) {
        const position = resolved.value.patternPositions[goal.lineIndex] ?? -1
        const baseBounds = projection?.ok ? projection.value.baseBounds(goal.bounds) : null
        const bounds =
          goal.basis === 'effective' ? (baseBounds?.ok ? baseBounds.value : null) : goal.bounds
        if (
          bounds === null ||
          minimumTargetRolls([resolved.value.patterns[position] ?? ''], bounds) === null
        )
          reasons.push('当前可重掷范围或显示网格不能达到该固有条件。')
        for (const entry of numeric)
          if (!entry.matched)
            reasons.push(`第${entry.index + 1}个固有数值${entry.actual ?? '未知'}未满足条件。`)
      }
      return { lineIndex: goal.lineIndex, matched, numeric, reasons }
    }),
  }
}

/** 将目录行目标映射到当前实际行及全件扁平操作顺序，完整覆盖非目标范围。 */
export function implicitTargetRolls(
  catalog: CraftCatalog,
  state: CraftState,
  values: readonly CraftImplicitTargetValues[],
): CraftResult<number[]> {
  const checked = validateCraftImplicitTargets(catalog, state.baseId, values, state)
  if (!checked.ok) return checked
  const prepared = prepareCraftOperation(catalog, state, 'divine')
  if (!prepared.ok) return prepared
  const resolved = mapped(catalog, state)
  if (!resolved.ok) return resolved
  const { mapping, patternPositions, patterns, actual, charm } = resolved.value
  const result: number[] = []
  for (const [position, pattern] of patterns.entries()) {
    const directoryIndex = patternPositions.indexOf(position)
    const goal = checked.value.find((entry) => entry.lineIndex === directoryIndex)
    if (charm?.fixed && charm.lineIndex === position) continue
    let selected: number[] | null
    if (goal?.basis === 'effective') {
      const projection = projectImplicitTargetValues(catalog, state, directoryIndex)
      if (!projection.ok) return projection
      selected = projectedTargetRolls(projection.value, [pattern], goal.bounds, [
        actual[mapping[directoryIndex] ?? -1] ?? pattern,
      ])
    } else
      selected = targetRollsPreservingValues(
        [pattern],
        [actual[mapping[directoryIndex] ?? -1] ?? pattern],
        goal?.bounds,
      )
    if (selected === null) return fail('当前范围或显示网格无法达到固有目标。')
    result.push(...selected)
  }
  return { ok: true, value: result }
}
