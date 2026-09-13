import type { CatalogBase, CraftCatalog } from './catalog'

export const JEWEL_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModJewel.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModJewel.lua',
  sha256: '44285abc35fa4c32b2b0ba169570c99b01fd97136d1a801462b9b1398db82e80',
} as const

export function jewelSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter((source) => source.path === JEWEL_SOURCE.path)
  const source = sources[0]
  return catalog._meta.sourceCommit === JEWEL_SOURCE.commit &&
    sources.length === 1 &&
    source?.url === JEWEL_SOURCE.url &&
    source.sha256 === JEWEL_SOURCE.sha256
    ? source.sha256
    : null
}

export function isBasicJewel(base: CatalogBase): boolean {
  return (
    base.type === 'Jewel' &&
    base.subType === undefined &&
    ['Ruby', 'Emerald', 'Sapphire', 'Diamond'].includes(base.id) &&
    !base.tags.includes('radius_jewel')
  )
}

/** 只描述已支持基底的固有容量；特殊增容需要单独实现。 */
export function craftAffixLimit(base: CatalogBase, rarity: 'normal' | 'magic' | 'rare'): number {
  return rarity === 'normal' ? 0 : rarity === 'magic' ? 1 : isBasicJewel(base) ? 2 : 3
}
