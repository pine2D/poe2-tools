import { isHelmetBootIdolId } from './armourIdols'
import { hasProjectCapability } from './projectCapability'

export const HELMET_BOOT_IDOL_RULES_VERSION = 'basic-2026-09-17-v111'

/** 仅精确雕像身份声明启用新能力；完整遍历未来与未执行指引，忽略报价及观察文本。 */
export function requiresHelmetBootIdolProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) =>
      isHelmetBootIdolId(descriptor.value),
    )
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'socket' && isHelmetBootIdolId(properties.augmentId?.value)) ||
      includes(properties.sockets?.value) ||
      includes(properties.importedSockets?.value),
  )
}
