export const PUTREFACTION_RULES_VERSION = 'basic-2026-09-16-v91'

function own(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined
}

/** 检查起点和完整未来历史；不读取 getter，也不强制转换不可信字段。 */
export function requiresPutrefactionProjectVersion(input: unknown): boolean {
  const pending = own(own(input, 'initialState'), 'pendingDesecration')
  if (pending !== null && typeof pending === 'object' && Object.hasOwn(pending, 'putrefaction'))
    return true
  const operations = own(input, 'operations')
  if (!Array.isArray(operations)) return false
  return Object.keys(operations).some((key) => own(own(operations, key), 'kind') === 'putrefy')
}
