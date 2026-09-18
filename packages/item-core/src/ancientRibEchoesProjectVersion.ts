import { hasBoneEchoesProjectCapability } from './boneEchoesProjectCapability'

export const ANCIENT_RIB_ECHOES_RULES_VERSION = 'basic-2026-09-18-v118'

/** 识别真实待揭示状态及整段未来操作；分开的两次骨骼制作不能误配成新能力。 */
export function requiresAncientRibEchoesProjectVersion(input: unknown): boolean {
  return hasBoneEchoesProjectCapability(input, (bone) => bone === 'ancient_rib')
}
