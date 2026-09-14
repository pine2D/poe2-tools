import type { CraftCatalog } from './catalog'

export const CORRUPTION_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModCorrupted.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModCorrupted.lua',
  sha256: '50549cb0cbe722e28b337b30e4918e14ddf14bd4aa5da5d064984b1ba8f99351',
} as const

export function corruptionSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter((source) => source.path === CORRUPTION_SOURCE.path)
  const source = sources[0]
  return catalog._meta.sourceCommit === CORRUPTION_SOURCE.commit &&
    sources.length === 1 &&
    source?.url === CORRUPTION_SOURCE.url &&
    source.sha256 === CORRUPTION_SOURCE.sha256
    ? source.sha256
    : null
}
