import type { CraftCatalog } from './catalog'
import { defenceEssenceResult, isDefenceEssenceId, isDefenceEssenceModId } from './defenceEssences'
import { hasProjectCapability } from './projectCapability'

export const DEFENCE_ESSENCE_RULES_VERSION = 'basic-2026-09-18-v115'

/** 普通防御词缀、原文和材料报价不授权新精华操作。 */
export function requiresDefenceEssenceProjectVersion(input: unknown): boolean {
  return hasProjectCapability(input, (fields) => {
    if (fields.kind?.value === 'essence' && isDefenceEssenceId(fields.essenceId?.value)) return true
    const affixes: unknown = fields.affixes?.value
    if (!Array.isArray(affixes)) return false
    // 单工艺旧起点原本允许普通防御；双工艺才依赖本次新增的精华来源资格。
    const crafted = Object.values(Object.getOwnPropertyDescriptors(affixes)).flatMap((entry) => {
      const value: unknown = entry.value
      if (value === null || typeof value !== 'object') return []
      const props = Object.getOwnPropertyDescriptors(value)
      return props.crafted?.value === true ? [props.modId?.value] : []
    })
    return crafted.length > 1 && crafted.some(isDefenceEssenceModId)
  })
}

export function defenceEssenceProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresDefenceEssenceProjectVersion(input)) return null
  const source =
    input !== null && typeof input === 'object'
      ? Object.getOwnPropertyDescriptor(input, 'essenceSourceHash')?.value
      : undefined
  if (source !== '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74')
    return '防御精华的项目来源指纹缺失或改变，不能恢复。'
  const bases = catalog.bases.filter((b) => b.type === 'Body Armour' && !b.hidden)
  const tags = [
    'str_armour',
    'dex_armour',
    'int_armour',
    'str_dex_armour',
    'str_int_armour',
    'dex_int_armour',
    'str_dex_int_armour',
  ]
  const essences = catalog.essences?.filter((e) => isDefenceEssenceId(e.id)) ?? []
  if (essences.length !== 3 || new Set(essences.map((e) => e.id)).size !== 3)
    return '防御精华材料声明缺失或重复，不能恢复。'
  for (const essence of essences)
    for (const tag of tags) {
      const base = bases.find((b) => b.tags.includes(tag))
      if (
        !base ||
        defenceEssenceResult(catalog, base, essence, (id) =>
          catalog.modifiers.filter((m) => m.id === id),
        ).length !== 1
      )
        return '防御精华的固定来源或具体结果身份无效，不能恢复。'
    }
  return null
}
