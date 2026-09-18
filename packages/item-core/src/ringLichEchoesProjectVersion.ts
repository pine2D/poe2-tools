import { hasBoneEchoesProjectCapability } from './boneEchoesProjectCapability'
import type { CraftCatalog } from './catalog'

export const RING_LICH_ECHOES_RULES_VERSION = 'basic-2026-09-18-v123'

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === 'object'
    ? Object.getOwnPropertyDescriptor(input, key)?.value
    : undefined
}

/** 基底贯穿完整历史；不将既有黑血项链或独立报价升级为戒指组合。 */
export function requiresRingLichEchoesProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  const baseId = field(field(input, 'initialState'), 'baseId')
  if (!catalog.bases.some((base) => base.id === baseId && base.type === 'Ring')) return false
  return hasBoneEchoesProjectCapability(
    input,
    (bone, lich) =>
      bone === 'preserved_collarbone' && (lich === 'blackblooded' || lich === 'liege'),
  )
}
