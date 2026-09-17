import type { CraftCatalog } from './catalog'

export const FLASK_SOURCE = {
  commit: 'ce566eac45ea8a86477f513c7ee65a1ebe60014e',
  path: 'src/Data/ModFlask.lua',
  url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/ce566eac45ea8a86477f513c7ee65a1ebe60014e/src/Data/ModFlask.lua',
  sha256: 'd50d074c1b7e0a57c164b7c49add1670d90ba806a25d946467e4ca7af9feb350',
} as const

export function flaskSourceHash(catalog: CraftCatalog): string | null {
  const sources = catalog._meta.sources.filter((source) => source.path === FLASK_SOURCE.path)
  const source = sources[0]
  return catalog._meta.sourceCommit === FLASK_SOURCE.commit &&
    sources.length === 1 &&
    source?.url === FLASK_SOURCE.url &&
    source.sha256 === FLASK_SOURCE.sha256
    ? source.sha256
    : null
}
