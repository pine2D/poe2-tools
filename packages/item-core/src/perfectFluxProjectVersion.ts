import { hasProjectCapability } from './projectCapability'

export const PERFECT_FLUX_CRAFT_RULES_VERSION = 'basic-2026-09-16-v76'

/** 只检测能力，不推断历史；字符串中的旧观察文本不构成材料消费。 */
export function requiresPerfectFluxProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (descriptors) =>
      Object.hasOwn(descriptors, 'grantedSkillLevel') ||
      Object.hasOwn(descriptors, 'currency:perfect-flux') ||
      ['perfect-flux', 'granted-skill-level'].includes(descriptors.kind?.value),
  )
}
