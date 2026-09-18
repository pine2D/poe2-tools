import type { CraftCatalog } from './catalog'
import { catalystStoredQualityLimit } from './catalystQuality'
import { hasProjectCapability } from './projectCapability'
import { isSkillVariantAmulet } from './skillVariantAmulets'

export const INFUSED_CATALYST_RULES_VERSION = 'basic-2026-09-18-v120'

/** 只检查实际状态；原文和报价不授权已有注能品质。 */
export function requiresInfusedCatalystProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
): boolean {
  return hasProjectCapability(input, (fields) => {
    const baseId = fields.baseId?.value
    const catalyst = fields.catalyst?.value
    if (typeof baseId !== 'string' || catalyst === null || typeof catalyst !== 'object')
      return false
    const base = catalog.bases.find((entry) => entry.id === baseId)
    if (!base || !['Ring', 'Amulet'].includes(base.type) || isSkillVariantAmulet(base)) return false
    const limit = catalystStoredQualityLimit(catalog, base)
    const quality = Object.getOwnPropertyDescriptor(catalyst, 'quality')?.value
    return limit !== null && typeof quality === 'number' && quality > limit - 10
  })
}
