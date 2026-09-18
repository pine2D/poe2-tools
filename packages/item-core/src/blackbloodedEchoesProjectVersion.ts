import { hasBoneEchoesProjectCapability } from './boneEchoesProjectCapability'

export const BLACKBLOODED_ECHOES_RULES_VERSION = 'basic-2026-09-18-v119'

export function requiresBlackbloodedEchoesProjectVersion(input: unknown): boolean {
  return hasBoneEchoesProjectCapability(
    input,
    (bone, lich) => bone === 'preserved_collarbone' && lich === 'blackblooded',
  )
}
