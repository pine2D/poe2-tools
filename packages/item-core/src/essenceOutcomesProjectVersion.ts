import type { CraftCatalog } from './catalog'
import { essenceResultModIds } from './essenceOutcomes'
import { hasProjectCapability } from './projectCapability'

export const ESSENCE_OUTCOMES_RULES_VERSION = 'basic-2026-09-16-v89'
const ESSENCE_ID = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
const RESULT_IDS = new Set([
  'EssencePercentStrength1',
  'EssencePercentDexterity1',
  'EssencePercentIntelligence1',
])
const SOURCES = {
  'src/Data/Essence.lua': '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74',
  'src/Data/ModItem.lua': '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4',
}

/** 固定能力身份独立于目录完整性；观察文本及旧有材料报价不授予新能力。 */
export function requiresEssenceOutcomesProjectVersion(input: unknown): boolean {
  return hasProjectCapability(
    input,
    (properties) =>
      (properties.kind?.value === 'essence' &&
        (properties.essenceId?.value === ESSENCE_ID || Object.hasOwn(properties, 'resultModId'))) ||
      Object.entries(properties).some(
        ([key, descriptor]) =>
          (['modId', 'resultModId', 'targetFracturedModId', 'removeModId'].includes(key) ||
            /^\d+$/.test(key)) &&
          typeof descriptor.value === 'string' &&
          RESULT_IDS.has(descriptor.value),
      ),
  )
}

/** 未执行目标和材料级指引也核对固定来源及精确结果映射。 */
export function essenceOutcomesProjectCapabilityError(
  input: unknown,
  catalog: CraftCatalog,
): string | null {
  if (!requiresEssenceOutcomesProjectVersion(input)) return null
  for (const [path, hash] of Object.entries(SOURCES)) {
    const sources = catalog._meta.sources.filter((source) => source.path === path)
    if (sources.length !== 1 || sources[0]?.sha256 !== hash)
      return '多结果精华的固定来源指纹缺失或已改变，不能恢复。'
  }
  if (
    input === null ||
    typeof input !== 'object' ||
    Object.getOwnPropertyDescriptor(input, 'essenceSourceHash')?.value !==
      SOURCES['src/Data/Essence.lua']
  )
    return '多结果精华的项目来源指纹缺失或已改变，不能恢复。'
  const essences = catalog.essences?.filter((essence) => essence.id === ESSENCE_ID) ?? []
  const base = catalog.bases.find((entry) => entry.type === 'Amulet')
  const ids =
    base && essences.length === 1 && essences[0]
      ? essenceResultModIds(catalog, base, essences[0])
      : []
  if (ids.length !== RESULT_IDS.size || !ids.every((id) => RESULT_IDS.has(id)))
    return '多结果精华的精确材料声明或真实结果身份无效，不能恢复。'
  return null
}
