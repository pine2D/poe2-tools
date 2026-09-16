import type { CraftCatalog } from './catalog'
import { isExtendedArmourRune } from './extendedArmourRuneEffects'
import { hasProjectCapability } from './projectCapability'

export const EXTENDED_ARMOUR_RUNE_RULES_VERSION = 'basic-2026-09-16-v84'

/** 起点、导入声明、完整未来历史及未执行指引共用身份核对，不解析观察文本。 */
export function requiresExtendedArmourRuneProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  const augments = catalog.augments?.filter(isExtendedArmourRune) ?? []
  const ids = new Set(augments.map((augment) => augment.id))
  const materials = new Set(augments.map((augment) => `augment:${augment.name}`))
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
      includes(properties.importedSockets?.value) ||
      Object.keys(properties).some((key) => materials.has(key)),
  )
}
