import type { CraftCatalog } from './catalog'
import { catalystQualityLimit } from './catalystQuality'
import { hasProjectCapability } from './projectCapability'
import { isSkillVariantAmulet } from './skillVariantAmulets'

export const RETAINED_CATALYST_RULES_VERSION = 'basic-2026-09-16-v79'

function data(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key)?.value
    : undefined
}

/** 只读取实际状态；未来能力由调用方传入完整历史，项目读取逐步回放后另作核对。 */
export function requiresRetainedCatalystProjectVersion(
  input: unknown,
  catalog: CraftCatalog,
  infusedCatalyst = false,
): boolean {
  return hasProjectCapability(input, (properties) => {
    const baseId = properties.baseId?.value
    const catalyst = properties.catalyst?.value
    if (typeof baseId !== 'string' || catalyst === null || typeof catalyst !== 'object')
      return false
    const quality = data(catalyst, 'quality')
    const base = catalog.bases.find((entry) => entry.id === baseId)
    const limit = base ? catalystQualityLimit(base) : null
    // 首饰已有注能品质允许额外10；超出此量才依赖裂隙精华来源。
    const sourceIndependentLimit =
      limit === null
        ? null
        : limit +
          (base &&
          (isSkillVariantAmulet(base) ||
            (infusedCatalyst && ['Ring', 'Amulet'].includes(base.type)))
            ? 10
            : 0)
    if (
      typeof quality === 'number' &&
      sourceIndependentLimit !== null &&
      quality > sourceIndependentLimit
    )
      return true
    const affixes = properties.affixes?.value
    return (
      Array.isArray(affixes) &&
      Object.values(Object.getOwnPropertyDescriptors(affixes)).some(
        (entry) => data(entry.value, 'modId') === 'EssenceBreach',
      )
    )
  })
}
