import { hasProjectCapability } from './projectCapability'

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined
}

/** 两组揭示使用同一次骨骼来源；检查全部未来而不执行访问器。 */
export function hasBoneEchoesProjectCapability(
  input: unknown,
  matches: (boneId: unknown, lichOmen: unknown) => boolean,
): boolean {
  return hasProjectCapability(input, (fields) => {
    if (
      fields.revealOmen?.value === 'abyssal_echoes' &&
      matches(fields.boneId?.value, fields.lichOmen?.value)
    )
      return true
    const operations: unknown = fields.operations?.value
    if (!Array.isArray(operations)) return false
    let pending = field(fields.initialState?.value, 'pendingDesecration')
    for (let i = 0; i < operations.length; i++) {
      const operation = field(operations, String(i))
      const kind = field(operation, 'kind')
      if (kind === 'desecrate') pending = operation
      if (
        field(operation, 'revealOmen') === 'abyssal_echoes' &&
        matches(field(pending, 'boneId'), field(pending, 'lichOmen'))
      )
        return true
      if (kind === 'desecration-reveal') pending = undefined
    }
    return false
  })
}
