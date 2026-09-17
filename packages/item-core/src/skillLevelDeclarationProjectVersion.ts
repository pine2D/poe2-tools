import { hasProjectCapability } from './projectCapability'

export const SKILL_LEVEL_DECLARATION_RULES_VERSION = 'basic-2026-09-17-v101'

/** 声明必须在读取完整项目树时检查，未执行历史也不能借旧版本进入。 */
export function requiresSkillLevelDeclarationProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (descriptors) =>
    Object.hasOwn(descriptors, 'declaredSkillLevel'),
  )
}
