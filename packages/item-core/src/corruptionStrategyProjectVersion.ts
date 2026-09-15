import { hasProjectCapability } from './projectCapability'

export const CORRUPTION_STRATEGY_RULES_VERSION = 'basic-2026-09-16-v78'

/** 真实腐化步骤带 outcome；只指定材料的指引与腐化状态条件才使用新版本。 */
export function requiresCorruptionStrategyProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      properties.kind?.value === 'corruption-state' ||
      ((properties.kind?.value === 'vaal' || properties.kind?.value === 'architect') &&
        !Object.hasOwn(properties, 'outcome')),
  )
}
