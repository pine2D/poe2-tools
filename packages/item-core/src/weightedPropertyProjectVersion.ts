import { hasProjectCapability } from './projectCapability'

export const WEIGHTED_PROPERTY_RULES_VERSION = 'basic-2026-09-17-v98'

/** 扫描完整项目及未执行指引，只读取数据字段，不执行访问器。 */
export function requiresWeightedPropertyProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (descriptors) => descriptors.kind?.value === 'weighted-properties',
  )
}
