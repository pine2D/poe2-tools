import type {
  CatalogBase,
  CatalogLiquidEmotion,
  CatalogLiquidEmotionJewel,
  CatalogMod,
  CraftCatalog,
} from './catalog'
import { JEWEL_EFFECT_EMOTION_ID, jewelEffectModKind } from './jewelEffectRules'
import { isBasicJewel, jewelSourceHash } from './jewels'
import { statScalabilitySourceHash } from './statScalability'

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
  outcomes: CatalogMod[]
  reason: string | null
}

export function supportedBasicLiquidEmotionId(id: string): boolean {
  return /^Metadata\/Items\/Currency\/DistilledEmotion(?:[1-9]|10)$/.test(id)
}

export function supportedLiquidEmotionId(id: string): boolean {
  return (
    supportedBasicLiquidEmotionId(id) ||
    id === JEWEL_EFFECT_EMOTION_ID ||
    id === 'Metadata/Items/Currency/EndgameDistilledEmotion1' ||
    id === 'Metadata/Items/Currency/EndgameDistilledEmotion3'
  )
}

function jewelCategory(base: CatalogBase): CatalogLiquidEmotionJewel | null {
  return isBasicJewel(base) ? (base.id as CatalogLiquidEmotionJewel) : null
}

/** 固定快照中的增容身份；不能从任意相似文本推断容量。 */
export function jewelCapacityModKind(mod: CatalogMod): 'prefix' | 'suffix' | null {
  if (mod.jewelOnly !== true || mod.craftedOnly !== true || mod.desecratedOnly === true) return null
  for (const kind of ['prefix', 'suffix'] as const) {
    const opposite = kind === 'prefix' ? 'Suffix' : 'Prefix'
    if (
      mod.id === `CraftedJewelAdditional${opposite}Allowed` &&
      mod.kind === kind &&
      mod.group === 'PrefixSuffixAllowed' &&
      mod.lines.length === 1 &&
      mod.lines[0] === `+1 ${opposite} Modifier allowed`
    )
      return kind
  }
  return null
}

/** 所有保证结果都必须通过身份校验；部分损坏不能退化成单侧材料。 */
export function inspectLiquidEmotions(
  catalog: CraftCatalog,
  base: CatalogBase,
): LiquidEmotionInspection[] {
  const category = jewelCategory(base)
  const trusted = liquidEmotionSourceHash(catalog) !== null && jewelSourceHash(catalog) !== null
  const mods = new Map(catalog.modifiers.map((mod) => [mod.id, mod]))
  return (catalog.liquidEmotions ?? []).map((emotion) => {
    const unavailable = (reason: string): LiquidEmotionInspection => ({
      emotion,
      category,
      modId: null,
      mod: null,
      outcomes: [],
      reason,
    })
    if (!trusted) return unavailable('液态情感或珠宝目录来源指纹缺失或无效。')
    if (category === null) return unavailable('该材料仅支持普通珠宝；范围与特殊珠宝尚未支持。')
    if (!supportedLiquidEmotionId(emotion.id) || emotion.radiusJewel)
      return unavailable('该液态情感类型尚未支持。')
    const mapping = emotion.mods[category]
    const entries = Object.entries(mapping)
    const effect = emotion.id === JEWEL_EFFECT_EMOTION_ID
    const capacity = emotion.id === 'Metadata/Items/Currency/EndgameDistilledEmotion3'
    const dual = effect || capacity
    if (effect && statScalabilitySourceHash(catalog) === null)
      return unavailable('珠宝增效需要可信的属性缩放来源指纹。')
    if (entries.length !== (dual ? 2 : 1))
      return unavailable('该材料没有当前珠宝的完整保证属性映射。')
    const outcomes: CatalogMod[] = []
    for (const [kind, modId] of entries) {
      const mod = mods.get(modId)
      if (
        !mod ||
        !['prefix', 'suffix'].includes(kind) ||
        mod.kind !== kind ||
        mod.jewelOnly !== true ||
        mod.desecratedOnly === true ||
        (capacity && jewelCapacityModKind(mod) !== kind) ||
        (!capacity && jewelCapacityModKind(mod) !== null) ||
        (effect && jewelEffectModKind(mod) !== kind) ||
        (!effect && jewelEffectModKind(mod) !== null)
      )
        return unavailable('保证属性声明未通过普通珠宝身份与侧别校验。')
      outcomes.push(mod)
    }
    const mod = outcomes.length === 1 ? (outcomes[0] ?? null) : null
    return { emotion, category, modId: mod?.id ?? null, mod, outcomes, reason: null }
  })
}

/** crafted 身份只能由精确材料映射授权，不能由普通生成资格推断。 */
export function isLiquidEmotionMappedMod(
  catalog: CraftCatalog,
  base: CatalogBase,
  modId: string,
): boolean {
  return inspectLiquidEmotions(catalog, base).some(
    (entry) => entry.reason === null && entry.outcomes.some((mod) => mod.id === modId),
  )
}
