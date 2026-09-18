import { hasProjectCapability } from './projectCapability'
import { RUNESEEKER_ID } from './runeseeker'

export const RUNESEEKER_RULES_VERSION = 'basic-2026-09-18-v125'

/** 包含未来孔位与未执行数量条件，不把观察文本或材料报价当作已使用能力。 */
export function requiresRuneseekerProjectVersion(input: unknown): boolean {
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => d.value === RUNESEEKER_ID)
  return hasProjectCapability(input, (p) => {
    if (
      (p.kind?.value === 'socket' && p.augmentId?.value === RUNESEEKER_ID) ||
      includes(p.sockets?.value) ||
      includes(p.importedSockets?.value)
    )
      return true
    if (
      ['affixes', 'rolls', 'modIds', 'targetModIds', 'targetIds', 'targets', 'alternatives'].some(
        (key) => Array.isArray(p[key]?.value) && p[key]?.value.length > 7,
      )
    )
      return true
    const limit = p.kind?.value === 'affix-count' ? 7 : p.kind?.value === 'open-suffix' ? 4 : null
    return (
      limit !== null &&
      [p.min?.value, p.max?.value].some((value) => typeof value === 'number' && value > limit)
    )
  })
}
