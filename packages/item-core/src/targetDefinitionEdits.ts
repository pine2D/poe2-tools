import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { findTargetCapacityContext } from './targetCapacityContext'
import {
  type CraftTargetDefinitions,
  createStoredTargetDefinitions,
  type LegacyCraftTargetConfig,
  validateStoredTargetDefinitions,
} from './targetDefinitions'
import type { CraftTargetValues } from './targets'

export type CraftTargetDefinitionEdit =
  | { kind: 'add'; modId: string }
  | { kind: 'remove'; targetId: string }
  | { kind: 'reorder'; targetIds: string[] }
  | { kind: 'alternatives'; targetId: string; modIds: string[] }
  | { kind: 'values'; targetId: string; values: CraftTargetValues[] }
  | { kind: 'fractured'; targetId: string | null }
  | { kind: 'minimum'; count: number | null }
  | { kind: 'replace'; config: LegacyCraftTargetConfig }
  | { kind: 'replace-definitions'; definitions: CraftTargetDefinitions }

function fail(error: string): CraftResult<never> {
  return { ok: false, error }
}

function record(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) => allowed.includes(key) && entry !== undefined)
  )
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && [...value].every((entry) => typeof entry === 'string')
}

function targetValues(value: unknown): value is CraftTargetValues[] {
  return (
    Array.isArray(value) &&
    [...value].every(
      (entry) =>
        record(entry, ['modId', 'bounds', 'basis']) &&
        typeof entry.modId === 'string' &&
        (!Object.hasOwn(entry, 'basis') || entry.basis === 'effective') &&
        Array.isArray(entry.bounds) &&
        [...entry.bounds].every(
          (bound) =>
            record(bound, ['index', 'min', 'max']) &&
            typeof bound.index === 'number' &&
            (!Object.hasOwn(bound, 'min') || typeof bound.min === 'number') &&
            (!Object.hasOwn(bound, 'max') || typeof bound.max === 'number'),
        ),
    )
  )
}

function legacyConfig(value: unknown): value is LegacyCraftTargetConfig {
  return (
    record(value, [
      'targetModIds',
      'targetAlternatives',
      'targetValues',
      'targetFracturedModId',
      'minimumTargetCount',
    ]) &&
    strings(value.targetModIds) &&
    (!Object.hasOwn(value, 'targetValues') || targetValues(value.targetValues)) &&
    (!Object.hasOwn(value, 'targetAlternatives') ||
      (Array.isArray(value.targetAlternatives) &&
        [...value.targetAlternatives].every(
          (entry) =>
            record(entry, ['targetModId', 'modIds']) &&
            typeof entry.targetModId === 'string' &&
            strings(entry.modIds),
        ))) &&
    (!Object.hasOwn(value, 'targetFracturedModId') ||
      typeof value.targetFracturedModId === 'string') &&
    (!Object.hasOwn(value, 'minimumTargetCount') || typeof value.minimumTargetCount === 'number')
  )
}

/** 编辑原子应用；校验失败不修复原配置，成功也不与输入共享目标或数值引用。 */
export function editTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  definitions: unknown,
  edit: unknown,
  capacityContext = state,
  capacityHistory?: readonly CraftState[],
): CraftResult<CraftTargetDefinitions> {
  try {
    if (!isPlainProjectJSON({ state, definitions, edit }))
      return fail('目标编辑必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('目标编辑对象无法安全检查。')
  }
  const current = createCraftState(catalog, state)
  if (!current.ok) return current
  const checked = validateStoredTargetDefinitions(
    catalog,
    capacityContext.baseId,
    definitions,
    capacityContext,
  )
  if (!checked.ok) return checked
  const validateNext = (input: unknown) => {
    const capacity =
      (capacityHistory && findTargetCapacityContext(catalog, capacityHistory, input)) ??
      capacityContext
    return validateStoredTargetDefinitions(catalog, capacity.baseId, input, capacity)
  }
  const next = checked.value
  if (
    !record(edit, [
      'kind',
      'modId',
      'targetId',
      'targetIds',
      'modIds',
      'values',
      'count',
      'config',
      'definitions',
    ])
  )
    return fail('目标编辑字段无效，不能包含未知字段或显式缺省值。')
  switch (edit.kind) {
    case 'add': {
      if (!record(edit, ['kind', 'modId']) || typeof edit.modId !== 'string')
        return fail('新增目标需要有效的词缀类型。')
      if (!Number.isSafeInteger(next.nextTargetId + 1)) return fail('目标 ID 分配游标已耗尽。')
      next.targets.push({ targetId: `t${next.nextTargetId}`, modId: edit.modId })
      next.nextTargetId += 1
      break
    }
    case 'remove': {
      if (
        !record(edit, ['kind', 'targetId']) ||
        typeof edit.targetId !== 'string' ||
        !next.targets.some((target) => target.targetId === edit.targetId)
      )
        return fail('要删除的目标不存在。')
      next.targets = next.targets.filter((target) => target.targetId !== edit.targetId)
      next.alternatives = next.alternatives.filter((entry) => entry.targetId !== edit.targetId)
      next.values = next.values.filter((entry) => entry.targetId !== edit.targetId)
      if (next.fracturedTargetId === edit.targetId) delete next.fracturedTargetId
      if (!next.targets.length) delete next.minimumTargetCount
      else if (next.minimumTargetCount !== undefined)
        next.minimumTargetCount = Math.min(next.minimumTargetCount, next.targets.length)
      break
    }
    case 'reorder': {
      if (
        !record(edit, ['kind', 'targetIds']) ||
        !strings(edit.targetIds) ||
        edit.targetIds.length !== next.targets.length ||
        new Set(edit.targetIds).size !== next.targets.length
      )
        return fail('目标重排必须包含每个已有目标且恰好一次。')
      const targets = []
      for (const targetId of edit.targetIds) {
        const target = next.targets.find((entry) => entry.targetId === targetId)
        if (!target) return fail('目标重排包含不存在的目标。')
        targets.push(target)
      }
      next.targets = targets
      break
    }
    case 'alternatives': {
      if (
        !record(edit, ['kind', 'targetId', 'modIds']) ||
        typeof edit.targetId !== 'string' ||
        !strings(edit.modIds)
      )
        return fail('替代档位编辑字段无效。')
      const target = next.targets.find((entry) => entry.targetId === edit.targetId)
      if (!target) return fail('替代档位所属目标不存在。')
      const index = next.alternatives.findIndex((entry) => entry.targetId === edit.targetId)
      const alternative = { targetId: edit.targetId, modIds: [...edit.modIds] }
      if (index >= 0)
        next.alternatives.splice(index, 1, ...(edit.modIds.length ? [alternative] : []))
      else if (edit.modIds.length) next.alternatives.push(alternative)
      const accepted = new Set([target.modId, ...edit.modIds])
      next.values = next.values.filter(
        (entry) => entry.targetId !== target.targetId || accepted.has(entry.modId),
      )
      break
    }
    case 'values': {
      if (
        !record(edit, ['kind', 'targetId', 'values']) ||
        typeof edit.targetId !== 'string' ||
        !targetValues(edit.values) ||
        !next.targets.some((entry) => entry.targetId === edit.targetId)
      )
        return fail('数值编辑必须属于已有目标且只包含有效数值字段。')
      const targetId = edit.targetId
      const values = edit.values.map((entry) => ({ ...entry, targetId }))
      next.values = [...next.values.filter((entry) => entry.targetId !== targetId), ...values]
      break
    }
    case 'fractured': {
      if (
        !record(edit, ['kind', 'targetId']) ||
        (edit.targetId !== null && typeof edit.targetId !== 'string')
      )
        return fail('破裂要求需要目标 ID 或明确清除。')
      if (edit.targetId === null) delete next.fracturedTargetId
      else next.fracturedTargetId = edit.targetId
      break
    }
    case 'minimum': {
      if (
        !record(edit, ['kind', 'count']) ||
        (edit.count !== null && typeof edit.count !== 'number')
      )
        return fail('最低目标数量需要数值或明确清除。')
      if (edit.count === null) delete next.minimumTargetCount
      else next.minimumTargetCount = edit.count
      break
    }
    case 'replace':
    case 'replace-definitions': {
      let created: CraftResult<CraftTargetDefinitions>
      if (edit.kind === 'replace') {
        if (!record(edit, ['kind', 'config']) || !legacyConfig(edit.config))
          return fail('完整替换需要有效旧目标配置，不能包含身份字段或显式缺省值。')
        created = createStoredTargetDefinitions(
          catalog,
          capacityContext.baseId,
          edit.config,
          capacityContext,
        )
        if (!created.ok && capacityHistory) {
          for (const candidate of capacityHistory) {
            if (candidate.destroyed || !createCraftState(catalog, candidate).ok) continue
            created = createStoredTargetDefinitions(
              catalog,
              candidate.baseId,
              edit.config,
              candidate,
            )
            if (created.ok) break
          }
        }
      } else {
        if (!record(edit, ['kind', 'definitions'])) return fail('完整替换需要有效独立目标定义。')
        created = validateNext(edit.definitions)
      }
      if (!created.ok) return created
      const replacement = created.value
      const cursor = next.nextTargetId + replacement.targets.length
      if (!Number.isSafeInteger(cursor)) return fail('目标 ID 分配游标已耗尽。')
      const ids = new Map(
        replacement.targets.map((target, index) => [
          target.targetId,
          `t${next.nextTargetId + index}`,
        ]),
      )
      return validateNext({
        ...replacement,
        nextTargetId: cursor,
        targets: replacement.targets.map((entry) => ({
          ...entry,
          targetId: ids.get(entry.targetId),
        })),
        alternatives: replacement.alternatives.map((entry) => ({
          ...entry,
          targetId: ids.get(entry.targetId),
        })),
        values: replacement.values.map((entry) => ({
          ...entry,
          targetId: ids.get(entry.targetId),
        })),
        ...(replacement.fracturedTargetId === undefined
          ? {}
          : { fracturedTargetId: ids.get(replacement.fracturedTargetId) }),
      })
    }
    default:
      return fail('不支持的目标编辑动作。')
  }
  return validateNext(next)
}
