import { hasProjectCapability } from './projectCapability'

export const GRANTED_SKILL_TARGET_RULES_VERSION = 'basic-2026-09-17-v97'

/** 仅显式技能目标启用新语义；普通完美溶剂历史继续使用旧版本。 */
export function requiresGrantedSkillTargetProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (descriptors) => descriptors.kind?.value === 'granted-skill')
}
