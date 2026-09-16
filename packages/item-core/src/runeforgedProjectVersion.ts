import type { CraftCatalog } from './catalog'
import { hasProjectCapability } from './projectCapability'

export const RUNEFORGED_ARMOUR_RULES_VERSION = 'basic-2026-09-16-v81'

/** 旧版本不能借新引擎取得锻造基底或结界条件，包括未执行的条件树。 */
export function requiresRuneforgedArmourProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  const ids = new Set(catalog.bases.filter((base) => base.runeforged).map((base) => base.id))
  return hasProjectCapability(
    input,
    (properties) =>
      ids.has(properties.baseId?.value) ||
      (properties.kind?.value === 'item-property' && properties.property?.value === 'Ward'),
  )
}
