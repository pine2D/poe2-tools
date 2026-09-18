import { hasProjectCapability } from './projectCapability'
import { isWandRuneId } from './wandRunes'

export const WAND_RUNE_RULES_VERSION = 'basic-2026-09-18-v124'

/** 同名材料早已存在；仅精确部位身份触发能力，覆盖完整未来及未执行指引。 */
export function requiresWandRuneProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => isWandRuneId(d.value))
  return hasProjectCapability(
    input,
    (p) =>
      (p.kind?.value === 'socket' && isWandRuneId(p.augmentId?.value)) ||
      includes(p.sockets?.value) ||
      includes(p.importedSockets?.value),
  )
}
