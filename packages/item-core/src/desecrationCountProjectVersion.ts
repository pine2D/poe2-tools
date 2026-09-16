import { hasProjectCapability } from './projectCapability'

export const DESECRATION_COUNT_RULES_VERSION = 'basic-2026-09-17-v92'

/** 未执行、嵌套的计数条件也需要新版；只检查自有数据属性。 */
export function requiresDesecrationCountProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (properties) => properties.kind?.value === 'desecrated-count')
}
