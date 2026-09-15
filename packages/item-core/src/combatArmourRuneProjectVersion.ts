import type { CraftCatalog } from './catalog'
import { isCombatArmourRune } from './combatArmourRuneEffects'
import { hasProjectCapability } from './projectCapability'

export const COMBAT_ARMOUR_RUNE_RULES_VERSION = 'basic-2026-09-16-v80'

/** 起点、导入声明、完整未来历史及未执行指引共用身份核对，不解析观察文本。 */
export function requiresCombatArmourRuneProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  const ids = new Set(catalog.augments?.filter(isCombatArmourRune).map((augment) => augment.id))
  const includes = (value: unknown) =>
    Array.isArray(value) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).some((descriptor) =>
      ids.has(descriptor.value),
    )
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'socket' && ids.has(properties.augmentId?.value)) ||
      includes(properties.sockets?.value) ||
      includes(properties.importedSockets?.value),
  )
}
