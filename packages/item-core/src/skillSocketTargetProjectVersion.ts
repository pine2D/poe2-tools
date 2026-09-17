import { hasProjectCapability } from './projectCapability'

export const SKILL_SOCKET_TARGET_RULES_VERSION = 'basic-2026-09-17-v100'

/** 起点声明和辅助孔目标要求新规则；v99 已有辅助孔条件仍沿用旧能力。 */
export function requiresSkillSocketTargetProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (descriptors) =>
      Object.hasOwn(descriptors, 'declaredSkillSockets') ||
      (descriptors.kind?.value === 'granted-skill-sockets' &&
        Object.hasOwn(descriptors, 'lineIndex')),
  )
}
