import { hasProjectCapability } from './projectCapability'
import { STAFF_RUNES } from './staffRuneData'

const ids = new Set(STAFF_RUNES.map((a) => a.id))
const isStaffRuneId = (id: unknown) => typeof id === 'string' && ids.has(id)

export const STAFF_RUNE_RULES_VERSION = 'basic-2026-09-18-v126'

/** 同名材料早已存在；仅精确部位身份触发能力，覆盖完整未来及未执行指引。 */
export function requiresStaffRuneProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => isStaffRuneId(d.value))
  return hasProjectCapability(
    input,
    (p) =>
      (p.kind?.value === 'socket' && isStaffRuneId(p.augmentId?.value)) ||
      includes(p.sockets?.value) ||
      includes(p.importedSockets?.value),
  )
}
