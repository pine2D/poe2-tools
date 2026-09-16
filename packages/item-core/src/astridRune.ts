import type { CatalogAugment, CraftCatalog } from './catalog'

export const ASTRID_NAME = "Astrid's Creativity"
export const ASTRID_LINE = 'Can have 1 additional Crafted Modifier'

/** 容量语义不从相似文案猜测；类别仍由具体基底核对。 */
export function isAstridRune(augment: CatalogAugment): boolean {
  return (
    augment.name === ASTRID_NAME &&
    ['weapon', 'armour', 'caster'].includes(augment.category) &&
    augment.id === `pob2:augment:${JSON.stringify([ASTRID_NAME, augment.category])}` &&
    augment.type === 'Rune' &&
    augment.localMod === true &&
    augment.limit === 1 &&
    augment.limitId === undefined &&
    augment.isSocketBound !== true &&
    augment.canSocketInJewellery === true &&
    augment.lines.length === 1 &&
    augment.lines[0] === ASTRID_LINE
  )
}

export function astridSourceValid(catalog: CraftCatalog): boolean {
  const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
  const path = 'src/Data/ModRunes.lua'
  const sources = catalog._meta.sources.filter((s) => s.path === path)
  return (
    catalog._meta.sourceCommit === commit &&
    sources.length === 1 &&
    sources[0]?.url ===
      `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${commit}/${path}` &&
    sources[0]?.sha256 === 'd3dac48143209d7d9a02a8c03bd86f21604a0961a8ced49290d6a1d243f8223a'
  )
}

export function astridSourceMatches(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  return (
    expected.filter((line) => line === ASTRID_LINE).length ===
    actual.filter((line) => line === ASTRID_LINE).length
  )
}
