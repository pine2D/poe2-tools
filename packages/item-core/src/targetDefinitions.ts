import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { validateCraftFractureTarget } from './fractureTargets'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import {
  type CraftTargetAlternative,
  type CraftTargetValues,
  validateCraftTargetAlternatives,
  validateCraftTargets,
  validateCraftTargetValues,
  validateStoredCraftTargetValues,
} from './targets'

export interface CraftTargetDefinition {
  targetId: string
  modId: string
}

export interface CraftTargetDefinitionAlternative {
  targetId: string
  modIds: string[]
}

export interface CraftTargetDefinitionValues extends CraftTargetValues {
  targetId: string
}

export interface CraftTargetDefinitions {
  nextTargetId: number
  targets: CraftTargetDefinition[]
  alternatives: CraftTargetDefinitionAlternative[]
  values: CraftTargetDefinitionValues[]
  fracturedTargetId?: string
  minimumTargetCount?: number
}

export interface LegacyCraftTargetConfig {
  targetModIds: string[]
  targetValues?: CraftTargetValues[]
  targetAlternatives?: CraftTargetAlternative[]
  targetFracturedModId?: string
  minimumTargetCount?: number
}

interface ValidatedLegacyConfig extends LegacyCraftTargetConfig {
  targetValues: CraftTargetValues[]
  targetAlternatives: CraftTargetAlternative[]
}

function record(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) => allowed.includes(key) && entry !== undefined)
  )
}

function fail(error: string): CraftResult<never> {
  return { ok: false, error }
}

function checkedLegacyConfig(
  catalog: CraftCatalog,
  state: CraftState,
  input: unknown,
): CraftResult<ValidatedLegacyConfig> {
  const checked = createCraftState(catalog, state)
  if (!checked.ok) return checked
  return readLegacyConfig(catalog, checked.value.baseId, input, checked.value)
}

function readLegacyConfig(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
  state?: CraftState,
): CraftResult<ValidatedLegacyConfig> {
  if (
    !record(input, [
      'targetModIds',
      'targetValues',
      'targetAlternatives',
      'targetFracturedModId',
      'minimumTargetCount',
    ]) ||
    !Array.isArray(input.targetModIds) ||
    (Object.hasOwn(input, 'minimumTargetCount') && typeof input.minimumTargetCount !== 'number') ||
    (Object.hasOwn(input, 'targetFracturedModId') && typeof input.targetFracturedModId !== 'string')
  )
    return fail('旧目标配置字段无效；不能混入独立目标身份或缺省值。')
  const minimum = input.minimumTargetCount as number | undefined
  const fractured = input.targetFracturedModId as string | undefined
  const ids = validateCraftTargets(catalog, baseId, input.targetModIds, minimum, fractured)
  if (!ids.ok) return ids
  const alternatives = validateCraftTargetAlternatives(
    catalog,
    baseId,
    ids.value,
    Object.hasOwn(input, 'targetAlternatives') ? input.targetAlternatives : [],
    minimum,
  )
  if (!alternatives.ok) return alternatives
  if (fractured !== undefined) {
    const result = validateCraftFractureTarget(catalog, ids.value, alternatives.value, fractured)
    if (!result.ok) return result
  }
  const inputValues = Object.hasOwn(input, 'targetValues') ? input.targetValues : []
  const values = state
    ? validateCraftTargetValues(
        catalog,
        baseId,
        ids.value,
        inputValues,
        alternatives.value,
        state,
        minimum,
      )
    : validateStoredCraftTargetValues(
        catalog,
        baseId,
        ids.value,
        inputValues,
        alternatives.value,
        minimum,
      )
  if (!values.ok) return values
  return {
    ok: true,
    value: {
      targetModIds: ids.value,
      targetAlternatives: alternatives.value,
      targetValues: values.value,
      ...(fractured === undefined ? {} : { targetFracturedModId: fractured }),
      ...(minimum === undefined ? {} : { minimumTargetCount: minimum }),
    },
  }
}

/** 仅接收已验证且彼此对应的旧配置和目标身份，保留各关联数组原顺序。 */
function withTargetIds(
  legacy: ValidatedLegacyConfig,
  targets: CraftTargetDefinition[],
  nextTargetId: number,
): CraftTargetDefinitions {
  const primaryIds = new Map(targets.map((target) => [target.modId, target.targetId]))
  const memberIds = new Map(primaryIds)
  const alternatives = legacy.targetAlternatives.map((entry) => {
    const targetId = primaryIds.get(entry.targetModId) as string
    for (const modId of entry.modIds) memberIds.set(modId, targetId)
    return { targetId, modIds: [...entry.modIds] }
  })
  return {
    nextTargetId,
    targets: targets.map((target) => ({ ...target })),
    alternatives,
    values: legacy.targetValues.map((entry) => ({
      ...entry,
      targetId: memberIds.get(entry.modId) as string,
      bounds: entry.bounds.map((bound) => ({ ...bound })),
    })),
    ...(legacy.targetFracturedModId === undefined
      ? {}
      : { fracturedTargetId: primaryIds.get(legacy.targetFracturedModId) as string }),
    ...(legacy.minimumTargetCount === undefined
      ? {}
      : { minimumTargetCount: legacy.minimumTargetCount }),
  }
}

/** 先完整验证旧配置，再初始化独立目标身份；不会更改装备实例身份。 */
export function createTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  legacyConfig: LegacyCraftTargetConfig,
): CraftResult<CraftTargetDefinitions> {
  const checked = checkedLegacyConfig(catalog, state, legacyConfig)
  if (!checked.ok) return checked
  const targets = checked.value.targetModIds.map((modId, index) => ({
    targetId: `t${index + 1}`,
    modId,
  }))
  return { ok: true, value: withTargetIds(checked.value, targets, targets.length + 1) }
}

/** 包内部完整替换使用；不改变旧工厂对当前投影的严格要求。 */
export function createStoredTargetDefinitions(
  catalog: CraftCatalog,
  baseId: string,
  legacyConfig: LegacyCraftTargetConfig,
): CraftResult<CraftTargetDefinitions> {
  try {
    if (!isPlainProjectJSON(legacyConfig))
      return fail('存储目标配置必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('存储目标配置对象无法安全检查。')
  }
  const checked = readLegacyConfig(catalog, baseId, legacyConfig)
  if (!checked.ok) return checked
  const targets = checked.value.targetModIds.map((modId, index) => ({
    targetId: `t${index + 1}`,
    modId,
  }))
  return { ok: true, value: withTargetIds(checked.value, targets, targets.length + 1) }
}

export function targetNumber(value: unknown): number | null {
  if (typeof value !== 'string' || !/^t[1-9]\d*$/.test(value)) return null
  const number = Number(value.slice(1))
  return Number.isSafeInteger(number) && value === `t${number}` ? number : null
}

/** 独立身份不授权重复类型；合法共存、来源和数值继续使用现有目标校验。 */
export function validateTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  input: unknown,
): CraftResult<CraftTargetDefinitions> {
  return readTargetDefinitions(catalog, state.baseId, input, state)
}

/** 保存完整关联与稳定身份；当前数值行投影失败不影响条件持久化。 */
export function validateStoredTargetDefinitions(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
): CraftResult<CraftTargetDefinitions> {
  try {
    if (!isPlainProjectJSON(input)) return fail('存储目标定义必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('存储目标定义对象无法安全检查。')
  }
  return readTargetDefinitions(catalog, baseId, input)
}

function readTargetDefinitions(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
  state?: CraftState,
): CraftResult<CraftTargetDefinitions> {
  if (
    !record(input, [
      'nextTargetId',
      'targets',
      'alternatives',
      'values',
      'fracturedTargetId',
      'minimumTargetCount',
    ]) ||
    typeof input.nextTargetId !== 'number' ||
    !Number.isSafeInteger(input.nextTargetId) ||
    input.nextTargetId < 1 ||
    !Array.isArray(input.targets) ||
    input.targets.length > 6 ||
    !Array.isArray(input.alternatives) ||
    input.alternatives.length > 6 ||
    !Array.isArray(input.values) ||
    input.values.length > 192 ||
    (Object.hasOwn(input, 'minimumTargetCount') && typeof input.minimumTargetCount !== 'number')
  )
    return fail('独立目标定义字段或分配游标无效。')
  const targets: CraftTargetDefinition[] = []
  const byId = new Map<string, string>()
  for (const entry of input.targets) {
    if (
      !record(entry, ['targetId', 'modId']) ||
      typeof entry.targetId !== 'string' ||
      typeof entry.modId !== 'string'
    )
      return fail('目标身份与类型字段无效。')
    const number = targetNumber(entry.targetId)
    if (number === null || number >= input.nextTargetId || byId.has(entry.targetId))
      return fail('目标 ID 必须唯一、合法且小于分配游标。')
    byId.set(entry.targetId, entry.modId)
    targets.push({ targetId: entry.targetId, modId: entry.modId })
  }
  const alternatives: CraftTargetAlternative[] = []
  const memberIds = new Map(targets.map((target) => [target.targetId, new Set([target.modId])]))
  const seenAlternatives = new Set<string>()
  for (const entry of input.alternatives) {
    if (
      !record(entry, ['targetId', 'modIds']) ||
      typeof entry.targetId !== 'string' ||
      !byId.has(entry.targetId) ||
      seenAlternatives.has(entry.targetId) ||
      !Array.isArray(entry.modIds) ||
      !entry.modIds.every((id): id is string => typeof id === 'string')
    )
      return fail('替代档位必须关联唯一的已有目标。')
    seenAlternatives.add(entry.targetId)
    for (const id of entry.modIds) memberIds.get(entry.targetId)?.add(id)
    alternatives.push({
      targetModId: byId.get(entry.targetId) as string,
      modIds: [...entry.modIds],
    })
  }
  const values: Record<string, unknown>[] = []
  const seenValues = new Set<string>()
  for (const entry of input.values) {
    if (
      !record(entry, ['targetId', 'modId', 'bounds', 'basis']) ||
      typeof entry.targetId !== 'string' ||
      typeof entry.modId !== 'string' ||
      !memberIds.get(entry.targetId)?.has(entry.modId)
    )
      return fail('数值条件必须关联对应目标的主类型或替代档位，不能跨目标关联。')
    const key = JSON.stringify([entry.targetId, entry.modId])
    if (seenValues.has(key)) return fail('同一目标的同类型数值条件不能重复。')
    seenValues.add(key)
    const { targetId: _, ...goal } = entry
    values.push(goal)
  }
  if (
    Object.hasOwn(input, 'fracturedTargetId') &&
    (typeof input.fracturedTargetId !== 'string' || !byId.has(input.fracturedTargetId))
  )
    return fail('破裂要求必须关联一个已有目标。')
  const legacy = {
    targetModIds: targets.map((target) => target.modId),
    targetAlternatives: alternatives,
    targetValues: values,
    ...(typeof input.fracturedTargetId === 'string'
      ? { targetFracturedModId: byId.get(input.fracturedTargetId) }
      : {}),
    ...(Object.hasOwn(input, 'minimumTargetCount')
      ? { minimumTargetCount: input.minimumTargetCount }
      : {}),
  }
  const checked = state
    ? checkedLegacyConfig(catalog, state, legacy)
    : readLegacyConfig(catalog, baseId, legacy)
  return checked.ok
    ? { ok: true, value: withTargetIds(checked.value, targets, input.nextTargetId) }
    : checked
}

/** 包内部使用：调用方须先验证定义；投影不会改变目标或关联数组的顺序。 */
export function projectTargetDefinitions(
  definitions: CraftTargetDefinitions,
): LegacyCraftTargetConfig {
  const primaryIds = new Map(definitions.targets.map((target) => [target.targetId, target.modId]))
  return {
    targetModIds: definitions.targets.map((target) => target.modId),
    targetAlternatives: definitions.alternatives.map((entry) => ({
      targetModId: primaryIds.get(entry.targetId) as string,
      modIds: [...entry.modIds],
    })),
    targetValues: definitions.values.map(({ targetId: _, ...entry }) => ({
      ...entry,
      bounds: entry.bounds.map((bound) => ({ ...bound })),
    })),
    ...(definitions.fracturedTargetId === undefined
      ? {}
      : { targetFracturedModId: primaryIds.get(definitions.fracturedTargetId) as string }),
    ...(definitions.minimumTargetCount === undefined
      ? {}
      : { minimumTargetCount: definitions.minimumTargetCount }),
  }
}
