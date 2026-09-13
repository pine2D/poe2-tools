import type {
  CatalogBase,
  CatalogLiquidEmotion,
  CatalogLiquidEmotionJewel,
  CatalogMod,
  CraftCatalog,
} from './catalog'
import { isBasicJewel, jewelSourceHash } from './jewels'

/** 固定来源仅描述材料映射快照，不代表允许执行液态情感制作。 */
export const LIQUID_EMOTION_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/LiquidEmotions.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/LiquidEmotions.lua',
  sha256: '2f8783e2f3d26fabc2a58c9533ffe96461ae0343ab6b3a2037249c68d00da7a8',
} as const

export function liquidEmotionSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter(
    (source) => source.path === LIQUID_EMOTION_SOURCE.path,
  )
  const source = sources[0]
  return catalog._meta.sourceCommit === LIQUID_EMOTION_SOURCE.commit &&
    sources.length === 1 &&
    source?.url === LIQUID_EMOTION_SOURCE.url &&
    source.sha256 === LIQUID_EMOTION_SOURCE.sha256
    ? source.sha256
    : null
}

export interface LiquidEmotionInspection {
  emotion: CatalogLiquidEmotion
  category: CatalogLiquidEmotionJewel | null
  modId: string | null
  mod: CatalogMod | null
  reason: string | null
}

export function supportedBasicLiquidEmotionId(id: string): boolean {
  return /^Metadata\/Items\/Currency\/DistilledEmotion(?:[1-9]|10)$/.test(id)
}

function jewelCategory(base: CatalogBase): CatalogLiquidEmotionJewel | null {
  return isBasicJewel(base) && ['Ruby', 'Sapphire', 'Emerald'].includes(base.id)
    ? (base.id as CatalogLiquidEmotionJewel)
    : null
}

/** 保留全部材料声明，但只连接已验证的三色基础珠宝单侧工艺映射。 */
export function inspectLiquidEmotions(
  catalog: CraftCatalog,
  base: CatalogBase,
): LiquidEmotionInspection[] {
  const category = jewelCategory(base)
  const trusted = liquidEmotionSourceHash(catalog) !== null && jewelSourceHash(catalog) !== null
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  return (catalog.liquidEmotions ?? []).map((emotion) => {
    if (!trusted)
      return {
        emotion,
        category,
        modId: null,
        mod: null,
        reason: '液态情感或珠宝目录来源指纹缺失或无效。',
      }
    if (category === null)
      return {
        emotion,
        category,
        modId: null,
        mod: null,
        reason: '该材料仅支持红玉、蓝玉或翠绿普通珠宝。',
      }
    if (!supportedBasicLiquidEmotionId(emotion.id) || emotion.radiusJewel)
      return { emotion, category, modId: null, mod: null, reason: '该液态情感类型尚未支持。' }
    const mapping = emotion.mods[category]
    const entries = Object.entries(mapping)
    if (entries.length !== 1)
      return {
        emotion,
        category,
        modId: null,
        mod: null,
        reason: '该材料没有当前珠宝的唯一保证属性。',
      }
    const [kind, modId] = entries[0] as ['prefix' | 'suffix', string]
    const mod = mods.get(modId)
    if (!mod || mod.kind !== kind || mod.jewelOnly !== true || mod.desecratedOnly === true)
      return {
        emotion,
        category,
        modId,
        mod: null,
        reason: '保证属性声明未通过普通珠宝身份与侧别校验。',
      }
    return { emotion, category, modId, mod, reason: null }
  })
}

/** crafted 身份只能由精确材料映射授权，不能由普通生成资格推断。 */
export function isLiquidEmotionMappedMod(
  catalog: CraftCatalog,
  base: CatalogBase,
  modId: string,
): boolean {
  return inspectLiquidEmotions(catalog, base).some(
    (entry) => entry.reason === null && entry.mod?.id === modId,
  )
}
