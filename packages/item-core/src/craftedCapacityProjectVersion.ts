import { isAstridRune } from './astridRune'
import type { CraftCatalog } from './catalog'
import { hasProjectCapability } from './projectCapability'

export const CRAFTED_CAPACITY_RULES_VERSION = 'basic-2026-09-16-v87'

/** 扫描结构化能力声明；多工艺自身也要求新版，不能通过删掉符文逃避版本检查。 */
export function requiresCraftedCapacityProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  const augments = catalog.augments?.filter((augment) => isAstridRune(augment)) ?? []
  const ids = new Set(augments.map((augment) => augment.id))
  const materials = new Set(augments.map((augment) => `augment:${augment.name}`))
  const values = (value: unknown): unknown[] =>
    Array.isArray(value)
      ? Object.values(Object.getOwnPropertyDescriptors(value)).map((descriptor) => descriptor.value)
      : []
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'socket' && ids.has(properties.augmentId?.value)) ||
      values(properties.sockets?.value).some(
        (value) => typeof value === 'string' && ids.has(value),
      ) ||
      values(properties.importedSockets?.value).some(
        (value) => typeof value === 'string' && ids.has(value),
      ) ||
      Object.keys(properties).some((key) => materials.has(key)) ||
      values(properties.affixes?.value).filter(
        (affix) =>
          affix !== null &&
          typeof affix === 'object' &&
          Object.getOwnPropertyDescriptor(affix, 'crafted')?.value === true,
      ).length > 1,
  )
}
