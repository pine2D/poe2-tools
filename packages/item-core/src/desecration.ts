import type { CraftCatalog } from './catalog'

/** 固定来源仅描述目录快照，不代表允许执行亵渎制作。 */
export const DESECRATION_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModVeiled.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModVeiled.lua',
  sha256: '95234097bcb70946ad451fbdb80b93cff3bd4a57abfdf29052305905fd32a632',
} as const

export const DESECRATION_FAMILIES = ['amanamu_mod', 'kurgal_mod', 'ulaman_mod'] as const

/** 目录来源必须精确匹配固定快照，不能接受仅有合法哈希形状的伪造声明。 */
export function desecrationSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter((source) => source.path === DESECRATION_SOURCE.path)
  const source = sources[0]
  return catalog._meta.sourceCommit === DESECRATION_SOURCE.commit &&
    sources.length === 1 &&
    source?.url === DESECRATION_SOURCE.url &&
    source.sha256 === DESECRATION_SOURCE.sha256
    ? source.sha256
    : null
}
