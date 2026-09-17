import type { CraftCatalog } from './catalog'
import { hasProjectCapability } from './projectCapability'
import { isBasicTalismanBaseId } from './talismans'

export const TALISMAN_CRAFT_RULES_VERSION = 'basic-2026-09-17-v107'

// 固定 ModVeiled.lua 的四个魔符独占引用；共享武器词缀不能触发版本升级。
const exclusiveModIds = new Set([
  'AbyssModTalismanUlamanSuffixGainXRageOnMeleeHit',
  'AbyssModTalismanAmanamuPrefixMinionsDealIncreasedDamageIfYouHitRecently',
  'AbyssModTalismanKurgalPrefixWarcriesEmpowerXAdditionalAttacks',
  'AbyssModTalismanKurgalSuffixCriticalHitChanceAgainstMarkedTargets',
])

/** 扫描完整身份引用，不执行访问器，也不解释观察文本或显示名称。 */
export function requiresTalismanProjectVersion(input: unknown, catalog?: CraftCatalog): boolean {
  const bases = new Set(
    catalog?.bases.filter((base) => base.type === 'Talisman').map((base) => base.id),
  )
  const modId = (value: unknown) => typeof value === 'string' && exclusiveModIds.has(value)
  return hasProjectCapability(input, (properties) => {
    const baseId = properties.baseId?.value
    if (
      isBasicTalismanBaseId(baseId) ||
      bases.has(baseId) ||
      modId(properties.modId?.value) ||
      modId(properties.removeModId?.value) ||
      modId(properties.targetFracturedModId?.value)
    )
      return true
    return ['modIds', 'targetModIds'].some((key) => {
      const value = properties[key]?.value
      return (
        Array.isArray(value) &&
        Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) =>
          modId(descriptor.value),
        )
      )
    })
  })
}
