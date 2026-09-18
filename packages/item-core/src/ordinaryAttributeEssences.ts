import {
  type CatalogBase,
  type CatalogEssence,
  type CatalogMod,
  type CraftCatalog,
  hasCraftModEligibility,
} from './catalog'

const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const sources = {
  'src/Data/Essence.lua': '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74',
  'src/Data/ModItem.lua': '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4',
}
const tiers = [
  [
    'LesserEssence',
    'Lesser Essence of the Infinite',
    12,
    2,
    11,
    '9-12',
    ['Wrestler', 'Lynx', 'Student'],
  ],
  ['Essence', 'Essence of the Infinite', 40, 4, 33, '17-20', ['Lion', 'Falcon', 'Augur']],
  [
    'GreaterEssence',
    'Greater Essence of the Infinite',
    60,
    6,
    55,
    '25-27',
    ['Goliath', 'Leopard', 'Sage'],
  ],
] as const
const attributes = [
  [
    'Strength',
    992,
    '4080418644',
    [
      'ring',
      'amulet',
      'belt',
      'str_armour',
      'str_dex_armour',
      'str_int_armour',
      'str_dex_int_armour',
      'mace',
      'axe',
      'sword',
      'spear',
      'flail',
      'crossbow',
      'sceptre',
      'talisman',
    ],
  ],
  [
    'Dexterity',
    993,
    '3261801346',
    [
      'ring',
      'amulet',
      'gloves',
      'quiver',
      'dex_armour',
      'dex_int_armour',
      'str_dex_armour',
      'str_dex_int_armour',
      'sword',
      'spear',
      'claw',
      'warstaff',
      'dagger',
      'bow',
      'crossbow',
      'trap',
    ],
  ],
  [
    'Intelligence',
    994,
    '328541901',
    [
      'ring',
      'amulet',
      'helmet',
      'int_armour',
      'str_int_armour',
      'dex_int_armour',
      'str_dex_int_armour',
      'dagger',
      'warstaff',
      'flail',
      'wand',
      'staff',
      'sceptre',
      'trap',
      'talisman',
    ],
  ],
] as const

export function isOrdinaryAttributeEssenceId(id: unknown): boolean {
  return tiers.some(([prefix]) => id === `Metadata/Items/Currency/Currency${prefix}Attribute`)
}

/** 只展开三属性均有普通资格的基底；不将尚未核实的跨资格结果缩为部分候选。 */
export function ordinaryAttributeEssenceResults(
  catalog: CraftCatalog,
  base: CatalogBase,
  essence: CatalogEssence,
  declared: string,
  findMods: (id: string) => readonly CatalogMod[],
): string[] {
  const index = tiers.findIndex(
    ([prefix]) => essence.id === `Metadata/Items/Currency/Currency${prefix}Attribute`,
  )
  const tier = tiers[index]
  if (!tier || base.hidden || catalog._meta.sourceCommit !== commit) return []
  for (const [path, hash] of Object.entries(sources)) {
    const matches = catalog._meta.sources.filter((s) => s.path === path)
    if (
      matches.length !== 1 ||
      matches[0]?.sha256 !== hash ||
      matches[0]?.url !==
        `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${commit}/${path}`
    )
      return []
  }
  if (
    essence.name !== tier[1] ||
    essence.type !== 'Attribute' ||
    essence.tierLevel !== tier[2] ||
    declared !== `EssenceDisplayAttributes${index + 1}`
  )
    return []
  const results: string[] = []
  for (const [i, [attribute, order, hash, tags]] of attributes.entries()) {
    const id = `${attribute}${tier[3]}`
    const matches = findMods(id)
    const mod = matches[0]
    const line = `+(${tier[5]}) to ${attribute}`
    if (
      matches.length !== 1 ||
      !mod ||
      mod.kind !== 'suffix' ||
      mod.group !== attribute ||
      mod.name !== `of the ${tier[6][i]}` ||
      mod.level !== tier[4] ||
      JSON.stringify(mod.lines) !== JSON.stringify([line]) ||
      JSON.stringify(mod.statOrder) !== JSON.stringify([order]) ||
      JSON.stringify(mod.tags) !== JSON.stringify(['attribute']) ||
      mod.addsTags.length !== 0 ||
      JSON.stringify(mod.eligibility) !==
        JSON.stringify([...tags.map((tag) => ({ tag, value: 1 })), { tag: 'default', value: 0 }]) ||
      Object.keys(mod.tradeHashes).length !== 1 ||
      JSON.stringify(mod.tradeHashes[hash]) !== JSON.stringify([line]) ||
      mod.jewelOnly !== undefined ||
      mod.radiusJewelOnly !== undefined ||
      mod.desecratedOnly !== undefined ||
      mod.craftedOnly !== undefined ||
      !hasCraftModEligibility(base, mod)
    )
      return []
    results.push(id)
  }
  return results
}
