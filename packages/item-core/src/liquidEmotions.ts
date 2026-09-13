import type { CraftCatalog } from './catalog'

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
