import type { CatalogMod, CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import { fluxEligibleModIds, fluxModsCanCoexist, hasFluxModEligibility } from './fluxes'
import { validateCraftFractureTarget } from './fractureTargets'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { readTargetDefinitionValues } from './targetDefinitionValues'
import {
  type CraftTargetAlternative,
  type CraftTargetValues,
  craftTargetCandidates,
  targetCombinationLines,
  targetImplicitLines,
  targetPools,
  targetSocketContext,
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
  capacityContext = state,
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
  const ids = validateCraftTargets(
    catalog,
    baseId,
    input.targetModIds,
    minimum,
    fractured,
    capacityContext,
  )
  if (!ids.ok) return ids
  const alternatives = validateCraftTargetAlternatives(
    catalog,
    baseId,
    ids.value,
    Object.hasOwn(input, 'targetAlternatives') ? input.targetAlternatives : [],
    minimum,
    capacityContext,
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
        capacityContext,
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
  capacityContext?: CraftState,
): CraftResult<CraftTargetDefinitions> {
  try {
    if (!isPlainProjectJSON(legacyConfig))
      return fail('存储目标配置必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('存储目标配置对象无法安全检查。')
  }
  const checked = readLegacyConfig(catalog, baseId, legacyConfig, undefined, capacityContext)
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

/** 重复只限可信转换族；目标身份本身不授权冲突或普通生成。 */
export function validateTargetDefinitions(
  catalog: CraftCatalog,
  state: CraftState,
  input: unknown,
  capacityContext = state,
): CraftResult<CraftTargetDefinitions> {
  return readTargetDefinitions(catalog, state.baseId, input, state, capacityContext)
}

/** 保存完整关联与稳定身份；当前数值行投影失败不影响条件持久化。 */
export function validateStoredTargetDefinitions(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
  capacityContext?: CraftState,
): CraftResult<CraftTargetDefinitions> {
  try {
    if (!isPlainProjectJSON(input)) return fail('存储目标定义必须只包含自有、可枚举的数据字段。')
  } catch {
    return fail('存储目标定义对象无法安全检查。')
  }
  return readTargetDefinitions(catalog, baseId, input, undefined, capacityContext)
}

function validateDefinitionCombination(
  catalog: CraftCatalog,
  baseId: string,
  targets: readonly CraftTargetDefinition[],
  minimum?: number,
  fractured?: string,
  capacityContext?: CraftState,
): CraftResult<true> {
  if (
    minimum !== undefined &&
    (!Number.isInteger(minimum) || minimum < 1 || minimum > targets.length)
  )
    return fail('至少达成数量必须是 1 至已选显式目标组数的整数。')
  const base = catalog.bases.find((entry) => entry.id === baseId)
  if (!base) return fail('当前基底不在制作目录中。')
  const pools = targetPools(catalog, baseId, capacityContext)
  const mods = []
  const affixes: CraftState['affixes'] = []
  for (const target of targets) {
    const mod = catalog.modifiers.find((entry) => entry.id === target.modId)
    if (!mod) return fail(`目标词缀 ${target.modId} 不在制作目录中。`)
    const flux = hasFluxModEligibility(
      catalog,
      base,
      mod,
      mod.desecratedOnly ? { desecrated: true } : undefined,
    )
    if (!flux) {
      const single = validateCraftTargets(
        catalog,
        baseId,
        [mod.id],
        undefined,
        undefined,
        capacityContext,
      )
      if (!single.ok) return single
    }
    const crafted =
      !flux &&
      !mod.desecratedOnly &&
      !pools.ordinary.has(mod.id) &&
      !pools.genesis.has(mod.id) &&
      (pools.essence.has(mod.id) || pools.liquid.has(mod.id) || pools.alloy.has(mod.id))
    mods.push(mod)
    affixes.push({
      modId: mod.id,
      lines: targetCombinationLines(mod),
      ...(crafted ? { crafted: true } : {}),
      ...(mod.desecratedOnly ? { desecrated: true } : {}),
    })
  }
  const sockets = targetSocketContext(catalog, baseId, capacityContext)
  if (!sockets.ok) return sockets
  const check = (indices: number[]) =>
    createCraftState(catalog, {
      baseId,
      itemLevel: 100,
      rarity: 'rare',
      sourceText: null,
      ...targetImplicitLines(catalog, baseId, capacityContext),
      ...sockets.value,
      nextAffixId: indices.length + 1,
      affixes: indices.flatMap((index, position) => {
        const affix = affixes[index]
        return affix ? [{ ...affix, affixId: `a${position + 1}` }] : []
      }),
    })
  if (minimum !== undefined && minimum < targets.length) {
    for (let left = 0; left < mods.length; left++)
      for (let right = left + 1; right < mods.length; right++) {
        const a = mods[left],
          b = mods[right]
        if (a && b && a.group === b.group && !fluxModsCanCoexist(catalog, base, a, b))
          return fail('同一词缀冲突组只能作为一个目标，请使用替代档位。')
      }
    for (let mask = 1; mask < 2 ** targets.length; mask++) {
      const indices = targets.flatMap((_, index) => ((mask & (1 << index)) !== 0 ? [index] : []))
      if (
        indices.length === minimum &&
        (fractured === undefined ||
          indices.some((index) => targets[index]?.targetId === fractured)) &&
        check(indices).ok
      )
        return { ok: true, value: true }
    }
    return fail(
      fractured === undefined
        ? '当前基底的容量或冲突规则无法同时容纳要求数量的目标组。'
        : '不存在包含必选破裂组、且满足要求数量的合法目标组合。',
    )
  }
  const checked = check(targets.map((_, index) => index))
  return checked.ok ? { ok: true, value: true } : checked
}

/** 独立目标搜索包含可信转换可达档位；不改变任何普通制作生成池。 */
export function craftTargetDefinitionCandidates(
  catalog: CraftCatalog,
  baseId: string,
  capacityContext?: CraftState,
): CatalogMod[] {
  const ordinary = new Set(
    craftTargetCandidates(catalog, baseId, capacityContext).map((mod) => mod.id),
  )
  const base = catalog.bases.find((base) => base.id === baseId)
  if (!base) return []
  const flux = fluxEligibleModIds(catalog, base)
  return catalog.modifiers.filter(
    (mod) =>
      ordinary.has(mod.id) ||
      ((flux.ordinary.has(mod.id) || flux.desecrated.has(mod.id)) &&
        validateDefinitionCombination(catalog, baseId, [{ targetId: 't1', modId: mod.id }]).ok),
  )
}

function readTargetDefinitions(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
  state?: CraftState,
  capacityContext = state,
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
    input.targets.length > 7 ||
    !Array.isArray(input.alternatives) ||
    input.alternatives.length > 7 ||
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
  if (
    Object.hasOwn(input, 'fracturedTargetId') &&
    (typeof input.fracturedTargetId !== 'string' || !byId.has(input.fracturedTargetId))
  )
    return fail('破裂要求必须关联一个已有目标。')
  const minimum = input.minimumTargetCount as number | undefined
  const fractured = input.fracturedTargetId as string | undefined
  let current: CraftState | undefined
  if (state) {
    const checked = createCraftState(catalog, state)
    if (!checked.ok) return checked
    current = checked.value
  }
  const ids = targets.map((target) => target.modId)
  // 共存资格仍遵守已核对规则；目标关联本身不再经旧格式往返。
  const primary = validateDefinitionCombination(
    catalog,
    capacityContext?.baseId ?? baseId,
    targets,
    minimum,
    fractured,
    capacityContext,
  )
  if (!primary.ok) return primary
  const alternatives: CraftTargetDefinitionAlternative[] = []
  const seenAlternatives = new Set<string>()
  const modById = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  for (const entry of input.alternatives) {
    if (
      !record(entry, ['targetId', 'modIds']) ||
      typeof entry.targetId !== 'string' ||
      !byId.has(entry.targetId) ||
      seenAlternatives.has(entry.targetId) ||
      !Array.isArray(entry.modIds) ||
      entry.modIds.length < 1 ||
      entry.modIds.length > 31 ||
      !entry.modIds.every((id): id is string => typeof id === 'string') ||
      new Set(entry.modIds).size !== entry.modIds.length ||
      entry.modIds.includes(byId.get(entry.targetId) as string)
    )
      return fail('替代档位必须关联唯一的已有目标，并包含 1–31 个不重复的其他词缀 ID。')
    const index = targets.findIndex((target) => target.targetId === entry.targetId)
    const mod = modById.get(ids[index] as string)
    for (const id of entry.modIds) {
      const alternative = modById.get(id)
      if (!alternative || alternative.kind !== mod?.kind || alternative.group !== mod.group)
        return fail('替代档位必须与主目标属于同一词缀类型和冲突组。')
      const replaced = targets.map((target, position) =>
        position === index ? { ...target, modId: id } : target,
      )
      const checked = validateDefinitionCombination(
        catalog,
        capacityContext?.baseId ?? baseId,
        replaced,
        minimum,
        undefined,
        capacityContext,
      )
      if (!checked.ok) return checked
    }
    seenAlternatives.add(entry.targetId)
    alternatives.push({ targetId: entry.targetId, modIds: [...entry.modIds] })
  }
  if (fractured !== undefined) {
    const modId = byId.get(fractured) as string
    const accepted = alternatives.find((entry) => entry.targetId === fractured)
    const checked = validateCraftFractureTarget(
      catalog,
      [modId],
      accepted ? [{ targetModId: modId, modIds: accepted.modIds }] : [],
      modId,
    )
    if (!checked.ok) return checked
  }
  const values = readTargetDefinitionValues(
    catalog,
    baseId,
    targets,
    alternatives,
    input.values,
    current === undefined ? undefined : { state: current },
  )
  if (!values.ok) return values
  return {
    ok: true,
    value: {
      nextTargetId: input.nextTargetId,
      targets,
      alternatives,
      values: values.value,
      ...(fractured === undefined ? {} : { fracturedTargetId: fractured }),
      ...(minimum === undefined ? {} : { minimumTargetCount: minimum }),
    },
  }
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
