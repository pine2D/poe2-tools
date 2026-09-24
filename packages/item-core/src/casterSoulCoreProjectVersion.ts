import { CASTER_SOUL_CORES } from './casterSoulCoreData'
import { hasProjectCapability } from './projectCapability'

const ids = new Set(CASTER_SOUL_CORES.map((a) => a.id))
const isCasterSoulCoreId = (id: unknown) => typeof id === 'string' && ids.has(id)

export const CASTER_SOUL_CORE_RULES_VERSION = 'basic-2026-09-24-v127'

/** 同名材料早已存在；仅精确部位身份触发能力，覆盖完整未来及未执行指引。 */
export function requiresCasterSoulCoreProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => isCasterSoulCoreId(d.value))
  return hasProjectCapability(
    input,
    (p) =>
      (p.kind?.value === 'socket' && isCasterSoulCoreId(p.augmentId?.value)) ||
      includes(p.sockets?.value) ||
      includes(p.importedSockets?.value),
  )
}
