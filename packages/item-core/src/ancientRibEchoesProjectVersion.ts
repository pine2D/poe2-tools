import { hasProjectCapability } from './projectCapability'

export const ANCIENT_RIB_ECHOES_RULES_VERSION = 'basic-2026-09-18-v118'

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined
}

/** 识别真实待揭示状态及整段未来操作；分开的两次骨骼制作不能误配成新能力。 */
export function requiresAncientRibEchoesProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (fields) => {
    if (fields.boneId?.value === 'ancient_rib' && fields.revealOmen?.value === 'abyssal_echoes')
      return true
    const operations: unknown = fields.operations?.value
    if (!Array.isArray(operations)) return false
    let bone = field(field(fields.initialState?.value, 'pendingDesecration'), 'boneId')
    for (let i = 0; i < operations.length; i++) {
      const operation = field(operations, String(i))
      const kind = field(operation, 'kind')
      if (kind === 'desecrate') bone = field(operation, 'boneId')
      if (bone === 'ancient_rib' && field(operation, 'revealOmen') === 'abyssal_echoes') return true
      if (kind === 'desecration-reveal') bone = undefined
    }
    return false
  })
}
