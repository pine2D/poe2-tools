import type { CraftCatalog } from './catalog'
import {
  isOrdinaryAttributeEssenceId,
  ordinaryAttributeEssenceResults,
} from './ordinaryAttributeEssences'
import { hasProjectCapability } from './projectCapability'

export const ORDINARY_ATTRIBUTE_ESSENCE_RULES_VERSION = 'basic-2026-09-18-v117'

/** 原文、普通属性及材料报价不授权新精华；双工艺来源须使用新资格回放。 */
export function requiresOrdinaryAttributeEssenceProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (fields) => {
    if (fields.kind?.value === 'essence' && isOrdinaryAttributeEssenceId(fields.essenceId?.value))
      return true
    const affixes: unknown = fields.affixes?.value
    if (!Array.isArray(affixes)) return false
    const crafted = Object.values(Object.getOwnPropertyDescriptors(affixes)).flatMap((entry) => {
      const value: unknown = entry.value
      if (value === null || typeof value !== 'object') return []
      const props = Object.getOwnPropertyDescriptors(value)
      return props.crafted?.value === true ? [props.modId?.value] : []
    })
    return (
      crafted.length > 1 &&
      crafted.some(
        (id) => typeof id === 'string' && /^(Strength|Dexterity|Intelligence)[246]$/.test(id),
      )
    )
  })
}

/** 保留旧报价身份，仅移除旧版没有的制作声明。 */
export function withoutOrdinaryAttributeEssences(catalog: CraftCatalog): CraftCatalog {
  if (
    !catalog.essences?.some(
      (e) => isOrdinaryAttributeEssenceId(e.id) && Object.keys(e.mods).length > 0,
    )
  )
    return catalog
  return {
    ...catalog,
    essences: catalog.essences.map((e) =>
      isOrdinaryAttributeEssenceId(e.id) ? { ...e, mods: {} } : e,
    ),
  }
}

/** 即使没有执行步骤，已保存的材料指引也依赖完整的固定结果目录。 */
export function ordinaryAttributeEssenceProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresOrdinaryAttributeEssenceProjectVersion(input)) return null
  const hash =
    input !== null && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'essenceSourceHash')?.value
      : undefined
  if (hash !== '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74')
    return '普通属性精华的项目来源指纹缺失或改变，不能恢复。'
  const base = catalog.bases.find((b) => b.id === 'Amber Amulet')
  const essences = catalog.essences?.filter((e) => isOrdinaryAttributeEssenceId(e.id)) ?? []
  if (!base || essences.length !== 3 || new Set(essences.map((e) => e.id)).size !== 3)
    return '普通属性精华的材料或核对基底缺失，不能恢复。'
  for (const essence of essences) {
    if (
      ordinaryAttributeEssenceResults(catalog, base, essence, essence.mods.Amulet ?? '', (id) =>
        catalog.modifiers.filter((m) => m.id === id),
      ).length !== 3
    )
      return '普通属性精华的固定来源或具体结果身份无效，不能恢复。'
  }
  return null
}
