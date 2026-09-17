import { hasProjectCapability } from './projectCapability'

export const PANEL_GOAL_RULES_VERSION = 'basic-2026-09-18-v114'

/** 只识别目标定义内的自有字段；不解释来源文本，也不执行访问器。 */
export function requiresPanelGoalProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (fields) => {
    if (fields.nextTargetId && fields.targets && Object.hasOwn(fields, 'panelGoals')) return true
    return ['targetDefinitions', 'definitions'].some((key) => {
      const value: unknown = fields[key]?.value
      return (
        value !== null &&
        typeof value === 'object' &&
        Object.hasOwn(Object.getOwnPropertyDescriptors(value), 'panelGoals')
      )
    })
  })
}
