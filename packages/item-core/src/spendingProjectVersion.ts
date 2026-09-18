import { hasProjectCapability } from './projectCapability'

export const SPENDING_STRATEGY_RULES_VERSION = 'basic-2026-09-18-v122'

/** 检查全部未执行指引，不解释原文或执行访问器。 */
export function requiresSpendingProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (descriptors) => descriptors.kind?.value === 'spent-cost')
}
