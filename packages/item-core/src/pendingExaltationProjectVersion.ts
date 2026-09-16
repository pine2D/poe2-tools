export const PENDING_EXALTATION_RULES_VERSION = 'basic-2026-09-16-v90'

function own(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined
}

function ownArrayValues(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return Object.entries(Object.getOwnPropertyDescriptors(value))
    .filter(([key]) => key !== 'length')
    .map(([, descriptor]) => descriptor.value)
}

/** 只按完整历史的真实前态识别未揭示期间崇高；坏结构仍交给项目读取器拒绝。 */
export function requiresPendingExaltationProjectVersion(input: unknown): boolean {
  let pending = own(own(input, 'initialState'), 'pendingDesecration') !== undefined
  for (const operation of ownArrayValues(own(input, 'operations'))) {
    const kind = own(operation, 'kind')
    if (kind === 'desecrate') pending = true
    else if (kind === 'desecration-reveal') pending = false
    else if (pending) {
      const currency = own(operation, 'currency')
      if (
        typeof currency === 'string' &&
        ['exalted', 'greater_exalted', 'perfect_exalted'].includes(currency)
      )
        return true
    }
  }
  return false
}
