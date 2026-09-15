export const PERFECT_FLUX_CRAFT_RULES_VERSION = 'basic-2026-09-16-v76'

/** 只检测能力，不推断历史；字符串中的旧观察文本不构成材料消费。 */
export function requiresPerfectFluxProjectVersion(input: unknown): boolean {
  const pending = [input]
  const visited = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (
      Object.hasOwn(descriptors, 'grantedSkillLevel') ||
      Object.hasOwn(descriptors, 'currency:perfect-flux') ||
      ['perfect-flux', 'granted-skill-level'].includes(descriptors.kind?.value)
    )
      return true
    for (const descriptor of Object.values(descriptors))
      if (Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value)
  }
  return false
}
