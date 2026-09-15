import type { CraftCatalog } from './catalog'
import { type CraftStrategy, readCraftStrategy } from './craftStrategy'
import {
  type DefinitionCraftStrategy,
  type DefinitionCraftStrategyCondition,
  readDefinitionCraftStrategy,
} from './definitionStrategy'
import type { CraftResult, CraftState } from './rehearsal'
import type { CraftStrategyCondition } from './strategyConditions'
import {
  type CraftTargetDefinition,
  type CraftTargetDefinitions,
  createTargetDefinitions,
  type LegacyCraftTargetConfig,
} from './targetDefinitions'

export interface CraftTargetDefinitionContext {
  definitions: CraftTargetDefinitions
  /** 仅供旧来源核对与失联提示，不参与目标匹配，也不能补回已删除目标。 */
  orphanedTargets: CraftTargetDefinition[]
  strategy?: DefinitionCraftStrategy
}

/** 在已核对旧输入的迁移边界一次性初始化目标及策略引用。 */
export function createTargetDefinitionContext(
  catalog: CraftCatalog,
  state: CraftState,
  config: LegacyCraftTargetConfig,
  strategy?: CraftStrategy,
): CraftResult<CraftTargetDefinitionContext> {
  const created = createTargetDefinitions(catalog, state, config)
  if (!created.ok) return created
  if (strategy === undefined)
    return { ok: true, value: { definitions: created.value, orphanedTargets: [] } }
  const checked = readCraftStrategy(strategy)
  if (!checked.ok) return checked
  const definitions = created.value
  const orphanedTargets: CraftTargetDefinition[] = []
  const ids = new Map(definitions.targets.map((target) => [target.modId, target.targetId]))
  const migrate = (condition: CraftStrategyCondition): DefinitionCraftStrategyCondition => {
    if (condition.kind === 'all' || condition.kind === 'any')
      return { ...condition, conditions: condition.conditions.map(migrate) }
    if (condition.kind === 'not') return { ...condition, condition: migrate(condition.condition) }
    if (condition.kind !== 'selected-targets') return { ...condition }
    return {
      kind: 'selected-targets',
      targetIds: condition.modIds.map((modId) => {
        let id = ids.get(modId)
        if (id === undefined) {
          // 旧失联引用预留身份但不创建目标；之后添加同类型目标不能接替它。
          id = `t${definitions.nextTargetId++}`
          ids.set(modId, id)
          orphanedTargets.push({ targetId: id, modId })
        }
        return id
      }),
      min: condition.min,
      value: condition.value,
    }
  }
  const migrated = readDefinitionCraftStrategy({
    ...checked.value,
    rules: checked.value.rules.map((rule) => ({
      ...rule,
      conditions: rule.conditions.map(migrate),
    })),
  })
  return migrated.ok
    ? { ok: true, value: { definitions, orphanedTargets, strategy: migrated.value } }
    : migrated
}
