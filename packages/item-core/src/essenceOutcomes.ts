import type { CatalogBase, CatalogEssence, CraftCatalog } from './catalog'

const perfectInfiniteId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
const resultIdentity = [
  ['Strength', '734614379', 999],
  ['Dexterity', '4139681126', 1000],
  ['Intelligence', '656461285', 1001],
] as const

export function essenceCategory(base: CatalogBase): string {
  if (base.type === 'Staff' && base.subType === 'Warstaff') return 'Warstaff'
  if (base.type === 'Shield' && base.tags.includes('buckler')) return 'Buckler'
  return base.type
}

/** 只授权固定来源中已核实的结果集合，不将展示占位或普通池资格当作结果依据。 */
export function essenceResultModIds(
  catalog: CraftCatalog,
  base: CatalogBase,
  essence: CatalogEssence,
): string[] {
  const category = essenceCategory(base)
  const declared = Object.hasOwn(essence.mods, category) ? essence.mods[category] : undefined
  if (declared === undefined) return []
  const resultIds = resultIdentity.map(([attribute]) => `EssencePercent${attribute}1`)
  if (essence.id !== perfectInfiniteId)
    return !resultIds.includes(declared) && catalog.modifiers.some((mod) => mod.id === declared)
      ? [declared]
      : []
  if (
    base.type !== 'Amulet' ||
    declared !== 'EssenceDisplayAttributes5' ||
    essence.name !== 'Perfect Essence of the Infinite' ||
    essence.type !== 'Attribute' ||
    essence.tierLevel !== 72
  )
    return []
  const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
  if (catalog._meta.sourceCommit !== commit) return []
  for (const [path, hash] of [
    ['src/Data/Essence.lua', '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74'],
    ['src/Data/ModItem.lua', '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4'],
  ]) {
    const sources = catalog._meta.sources.filter((source) => source.path === path)
    if (
      sources.length !== 1 ||
      sources[0]?.sha256 !== hash ||
      sources[0]?.url !==
        `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${commit}/${path}`
    )
      return []
  }
  for (const [attribute, hash, order] of resultIdentity) {
    const mods = catalog.modifiers.filter((mod) => mod.id === `EssencePercent${attribute}1`)
    const mod = mods[0]
    const line = `(7-10)% increased ${attribute}`
    if (
      mods.length !== 1 ||
      !mod ||
      mod.kind !== 'suffix' ||
      mod.name !== 'of the Essence' ||
      mod.group !== `Percentage${attribute}` ||
      mod.level !== 72 ||
      mod.lines.length !== 1 ||
      mod.lines[0] !== line ||
      mod.statOrder.length !== 1 ||
      mod.statOrder[0] !== order ||
      mod.tags.length !== 1 ||
      mod.tags[0] !== 'attribute' ||
      mod.addsTags.length !== 0 ||
      mod.eligibility.length !== 1 ||
      mod.eligibility[0]?.tag !== 'default' ||
      mod.eligibility[0]?.value !== 0 ||
      Object.keys(mod.tradeHashes).length !== 1 ||
      mod.tradeHashes[hash]?.length !== 1 ||
      mod.tradeHashes[hash]?.[0] !== line ||
      mod.jewelOnly !== undefined ||
      mod.radiusJewelOnly !== undefined ||
      mod.desecratedOnly !== undefined ||
      mod.craftedOnly !== undefined
    )
      return []
  }
  return resultIds
}
