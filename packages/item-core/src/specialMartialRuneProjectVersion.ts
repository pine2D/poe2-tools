import { hasProjectCapability } from './projectCapability'
import { isSpecialMartialRuneId, SPECIAL_MARTIAL_RUNE_NAMES } from './specialMartialRunes'

export const SPECIAL_MARTIAL_RUNE_RULES_VERSION = 'basic-2026-09-17-v108'

const materials = new Set(SPECIAL_MARTIAL_RUNE_NAMES.map((name) => `augment:${name}`))

/** 完整检查声明、未来与报价身份；不读取观察文本，不调用访问器。 */
export function requiresSpecialMartialRuneProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) =>
      isSpecialMartialRuneId(descriptor.value),
    )
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'socket' &&
        isSpecialMartialRuneId(properties.augmentId?.value)) ||
      includes(properties.sockets?.value) ||
      includes(properties.importedSockets?.value) ||
      Object.keys(properties).some((key) => materials.has(key)),
  )
}
