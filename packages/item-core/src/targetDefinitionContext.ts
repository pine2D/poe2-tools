import type { CraftCatalog } from './catalog'
import { isPlainProjectJSON } from './craftProjectJSON'
import {
  type DefinitionCraftStrategy,
  type DefinitionCraftStrategyCondition,
  readDefinitionCraftStrategy,
} from './definitionStrategy'
import type { CraftResult, CraftState } from './rehearsal'
import { editTargetDefinitions } from './targetDefinitionEdits'
import type { CraftTargetDefinitionContext } from './targetDefinitionMigration'
import {
  type CraftTargetDefinition,
  type CraftTargetDefinitions,
  targetNumber,
  validateStoredTargetDefinitions,
} from './targetDefinitions'

const fail = (error: string): CraftResult<never> => ({ ok: false, error })

function record(value: unknown, allowed: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return (
      typeof key === 'string' &&
      allowed.includes(key) &&
      descriptor?.enumerable === true &&
      Object.hasOwn(descriptor, 'value') &&
      descriptor.value !== undefined
    )
  })
}

/** 全树与全阶段遍历；失联引用不能因反向条件或未进入阶段而消失。 */
function references(strategy: DefinitionCraftStrategy | undefined): Set<string> {
  const ids = new Set<string>()
  const visit = (condition: DefinitionCraftStrategyCondition): void => {
    if (condition.kind === 'selected-targets') for (const id of condition.targetIds) ids.add(id)
    else if (condition.kind === 'all' || condition.kind === 'any')
      condition.conditions.forEach(visit)
    else if (condition.kind === 'not') visit(condition.condition)
  }
  for (const rule of strategy?.rules ?? []) rule.conditions.forEach(visit)
  return ids
}

/** 存储上下文只核对目录与引用关系；孤儿保留来源类型但不成为有效目标。 */
export function readTargetDefinitionContext(
  catalog: CraftCatalog,
  baseId: string,
  input: unknown,
  capacityContext?: CraftState,
): CraftResult<CraftTargetDefinitionContext> {
  if (
    !isPlainProjectJSON(input) ||
    !record(input, ['definitions', 'orphanedTargets', 'strategy']) ||
    !Object.hasOwn(input, 'definitions') ||
    !Object.hasOwn(input, 'orphanedTargets') ||
    !Array.isArray(input.orphanedTargets)
  )
    return fail('目标上下文字段无效，不能包含未知字段或显式缺省值。')
  const definitions = validateStoredTargetDefinitions(
    catalog,
    baseId,
    input.definitions,
    capacityContext,
  )
  if (!definitions.ok) return definitions
  let strategy: DefinitionCraftStrategy | undefined
  if (Object.hasOwn(input, 'strategy')) {
    const checked = readDefinitionCraftStrategy(input.strategy)
    if (!checked.ok) return checked
    strategy = checked.value
  }
  const active = new Set(definitions.value.targets.map((target) => target.targetId))
  const missing = new Set([...references(strategy)].filter((id) => !active.has(id)))
  if (input.orphanedTargets.length !== missing.size)
    return fail('失联目标表必须恰好覆盖全部未关联策略引用。')
  const orphanedTargets: CraftTargetDefinition[] = []
  const seen = new Set<string>()
  for (const entry of input.orphanedTargets) {
    if (
      !record(entry, ['targetId', 'modId']) ||
      !Object.hasOwn(entry, 'targetId') ||
      !Object.hasOwn(entry, 'modId') ||
      typeof entry.targetId !== 'string' ||
      typeof entry.modId !== 'string'
    )
      return fail('失联目标需要有效身份与原词缀类型。')
    const number = targetNumber(entry.targetId)
    if (
      number === null ||
      number >= definitions.value.nextTargetId ||
      active.has(entry.targetId) ||
      seen.has(entry.targetId) ||
      !missing.has(entry.targetId)
    )
      return fail('失联目标身份无效、重复或未被策略引用。')
    if (!catalog.modifiers.some((mod) => mod.id === entry.modId))
      return fail('失联目标的原词缀类型不在当前制作目录中。')
    seen.add(entry.targetId)
    orphanedTargets.push({ targetId: entry.targetId, modId: entry.modId })
  }
  return {
    ok: true,
    value: {
      definitions: definitions.value,
      orphanedTargets,
      ...(strategy === undefined ? {} : { strategy }),
    },
  }
}

/** 编辑后仅保留仍被引用的旧身份；同类型不同代目标始终按 targetId 独立处理。 */
function rebuild(
  catalog: CraftCatalog,
  baseId: string,
  previous: CraftTargetDefinitionContext,
  definitions: CraftTargetDefinitions,
  strategy: DefinitionCraftStrategy | undefined,
  capacityContext?: CraftState,
): CraftResult<CraftTargetDefinitionContext> {
  const metadata = new Map(
    [...previous.definitions.targets, ...previous.orphanedTargets].map((target) => [
      target.targetId,
      target,
    ]),
  )
  const active = new Set(definitions.targets.map((target) => target.targetId))
  const orphanedTargets: CraftTargetDefinition[] = []
  for (const targetId of references(strategy)) {
    if (active.has(targetId)) continue
    const target = metadata.get(targetId)
    if (!target) return fail('新策略引用缺少原目标元数据，不能凭空恢复已删除目标。')
    orphanedTargets.push({ ...target })
  }
  return readTargetDefinitionContext(
    catalog,
    baseId,
    {
      definitions,
      orphanedTargets,
      ...(strategy === undefined ? {} : { strategy }),
    },
    capacityContext,
  )
}

export function editTargetDefinitionContext(
  catalog: CraftCatalog,
  state: CraftState,
  context: unknown,
  edit: unknown,
  capacityContext = state,
): CraftResult<CraftTargetDefinitionContext> {
  if (!isPlainProjectJSON(edit)) return fail('目标编辑必须是完整的普通 JSON 数据。')
  const checked = readTargetDefinitionContext(
    catalog,
    capacityContext.baseId,
    context,
    capacityContext,
  )
  if (!checked.ok) return checked
  const edited = editTargetDefinitions(
    catalog,
    state,
    checked.value.definitions,
    edit,
    capacityContext,
  )
  return edited.ok
    ? rebuild(
        catalog,
        capacityContext.baseId,
        checked.value,
        edited.value,
        checked.value.strategy,
        capacityContext,
      )
    : edited
}

/** 不传策略即明确关闭；清理不再引用的失联元数据，但从不回退目标分配游标。 */
export function setTargetDefinitionStrategy(
  catalog: CraftCatalog,
  baseId: string,
  context: unknown,
  strategy?: DefinitionCraftStrategy,
  capacityContext?: CraftState,
): CraftResult<CraftTargetDefinitionContext> {
  if (strategy !== undefined && !isPlainProjectJSON(strategy))
    return fail('目标策略必须是完整的普通 JSON 数据。')
  const checked = readTargetDefinitionContext(catalog, baseId, context, capacityContext)
  if (!checked.ok) return checked
  if (strategy === undefined)
    return rebuild(
      catalog,
      baseId,
      checked.value,
      checked.value.definitions,
      undefined,
      capacityContext,
    )
  const parsed = readDefinitionCraftStrategy(strategy)
  return parsed.ok
    ? rebuild(
        catalog,
        baseId,
        checked.value,
        checked.value.definitions,
        parsed.value,
        capacityContext,
      )
    : parsed
}
