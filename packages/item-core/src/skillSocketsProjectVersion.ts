import { hasProjectCapability } from './projectCapability'

export const SKILL_SOCKETS_RULES_VERSION = 'basic-2026-09-17-v99'

/** 全量检查结果、未来操作、嵌套指引及报价；观察文本不构成能力声明。 */
export function requiresSkillSocketsProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (descriptors) =>
      Object.hasOwn(descriptors, 'grantedSkillSockets') ||
      ['skill-sockets', 'granted-skill-sockets'].includes(descriptors.kind?.value) ||
      ['lesser', 'greater', 'perfect'].some((tier) =>
        Object.hasOwn(descriptors, `currency:${tier}-jewellers`),
      ),
  )
}
