import type { CraftCatalog } from './catalog'
import { isBasicFlaskBaseId } from './flasks'
import { hasProjectCapability } from './projectCapability'

export const FLASK_CRAFT_RULES_VERSION = 'basic-2026-09-17-v106'

/** 只检查基底和词缀引用字段；说明、阶段名和观察文本不属于制作身份。 */
export function requiresFlaskProjectVersion(input: unknown, catalog?: CraftCatalog): boolean {
  const bases = new Set(
    catalog?.bases.filter((base) => base.type === 'Flask').map((base) => base.id),
  )
  const mods = new Set(catalog?.modifiers.filter((mod) => mod.flaskOnly).map((mod) => mod.id))
  const modId = (id: unknown) =>
    typeof id === 'string' && (catalog ? mods.has(id) : /^Flask[A-Z]/.test(id))
  return hasProjectCapability(input, (properties) => {
    if (
      Object.hasOwn(properties, 'flaskSourceHash') ||
      (catalog
        ? bases.has(properties.baseId?.value)
        : isBasicFlaskBaseId(properties.baseId?.value)) ||
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
