import { hasProjectCapability } from './projectCapability'

export const CORRUPTION_STRATEGY_RULES_VERSION = 'basic-2026-09-16-v78'

/** 腐化指引与四孔条件使用 v78；真实第四孔历史仍沿用其原有版本。 */
export function requiresCorruptionStrategyProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      properties.kind?.value === 'corruption-state' ||
      ((properties.kind?.value === 'socket-count' || properties.kind?.value === 'open-sockets') &&
        [properties.min?.value, properties.max?.value].some(
          (value) => typeof value === 'number' && value > 3,
        )) ||
      (Array.isArray(properties.conditions?.value) &&
        hasProjectCapability(
          properties.action?.value,
          (action) => action.kind?.value === 'socket' && action.socketIndex?.value === 3,
        )) ||
      ((properties.kind?.value === 'vaal' || properties.kind?.value === 'architect') &&
        !Object.hasOwn(properties, 'outcome')),
  )
}
