import { hasProjectCapability } from './projectCapability'

export const SKILL_VARIANT_AMULET_RULES_VERSION = 'basic-2026-09-17-v102'

/** 完整持久化树按基底身份检查，未执行历史也不能借旧版本进入。 */
export function requiresSkillVariantAmuletProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (descriptors) => {
    const baseId = descriptors.baseId
    return (
      baseId !== undefined &&
      Object.hasOwn(baseId, 'value') &&
      ['Lament Amulet', 'Portent Amulet', 'Absent Amulet'].includes(baseId.value)
    )
  })
}
