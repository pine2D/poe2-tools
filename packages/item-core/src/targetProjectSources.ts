import { type CraftCatalog, hasExistingModEligibility } from './catalog'
import { supportedEssenceId } from './essences'

/** 目标与失联引用的类型来源需求；判定不能依赖待核对指纹是否存在。 */
export function targetProjectSourceUsage(
  catalog: CraftCatalog,
  baseId: unknown,
  targetIds: readonly string[],
): { essence: boolean; desecration: boolean; liquid: boolean; jewel: boolean } {
  const base = catalog.bases.find((entry) => entry.id === baseId)
  const referenced = new Set(targetIds)
  const mods = catalog.modifiers.filter((mod) => referenced.has(mod.id))
  const essenceIds = new Set(
    (catalog.essences ?? [])
      .filter((entry) => supportedEssenceId(entry.id))
      .flatMap((entry) => Object.values(entry.mods)),
  )
  return {
    essence:
      base !== undefined &&
      mods.some((mod) => essenceIds.has(mod.id) && !hasExistingModEligibility(base, mod)),
    desecration: mods.some((mod) => mod.desecratedOnly),
    liquid: mods.some((mod) => mod.jewelOnly && mod.craftedOnly),
    jewel: mods.some((mod) => mod.jewelOnly),
  }
}
