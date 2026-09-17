import type { CatalogBase, CatalogEssence, CatalogMod, CraftCatalog } from './catalog'

const commit = 'ce566eac45ea8a86477f513c7ee65a1ebe60014e'
const sources = {
  'src/Data/Essence.lua': '950219488fed20cc3ca1bad17953f577c4361c6b65e371ce9ae3f9cbbae95f74',
  'src/Data/ModItem.lua': '774257f577f8cee8ac59d7848df4bc7a109d266a615eb97c2a2c08ecb6b47cf4',
}
const tiers = [
  ['LesserEssence', 'Lesser Essence of Enhancement', 16, 2, 16, '27-42'],
  ['Essence', 'Essence of Enhancement', 40, 4, 46, '56-67'],
  ['GreaterEssence', 'Greater Essence of Enhancement', 60, 5, 54, '68-79'],
] as const
const families = [
  [
    'str_armour',
    'LocalIncreasedPhysicalDamageReductionRatingPercent',
    'LocalPhysicalDamageReductionRatingPercent',
    'Armour',
    846,
    '1062208444',
    ['armour'],
  ],
  [
    'dex_armour',
    'LocalIncreasedEvasionRatingPercent',
    'LocalEvasionRatingIncreasePercent',
    'Evasion Rating',
    848,
    '124859000',
    ['evasion'],
  ],
  [
    'int_armour',
    'LocalIncreasedEnergyShieldPercent',
    'LocalEnergyShieldPercent',
    'Energy Shield',
    849,
    '4015621042',
    ['energy_shield'],
  ],
  [
    'str_dex_armour',
    'LocalIncreasedArmourAndEvasion',
    'LocalArmourAndEvasion',
    'Armour and Evasion',
    850,
    '2451402625',
    ['armour', 'evasion'],
  ],
  [
    'str_int_armour',
    'LocalIncreasedArmourAndEnergyShield',
    'LocalArmourAndEnergyShield',
    'Armour and Energy Shield',
    851,
    '3321629045',
    ['armour', 'energy_shield'],
  ],
  [
    'dex_int_armour',
    'LocalIncreasedEvasionAndEnergyShield',
    'LocalEvasionAndEnergyShield',
    'Evasion and Energy Shield',
    852,
    '1999113824',
    ['evasion', 'energy_shield'],
  ],
  [
    'str_dex_int_armour',
    'LocalIncreasedArmourAndEvasionAndEnergyShield',
    'LocalArmourAndEvasionAndEnergyShield',
    'Armour, Evasion and Energy Shield',
    854,
    '3523867985',
    ['armour', 'evasion', 'energy_shield'],
  ],
] as const
const categories = ['Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus']

export function isDefenceEssenceId(id: unknown): boolean {
  return tiers.some(([prefix]) => id === `Metadata/Items/Currency/Currency${prefix}Defences`)
}

/** 旧版完整回放使用旧材料资格，避免其他操作间接借到新增的双工艺来源。 */
export function withoutDefenceEssences(catalog: CraftCatalog): CraftCatalog {
  if (
    !catalog.essences?.some(
      (essence) => isDefenceEssenceId(essence.id) && Object.keys(essence.mods).length > 0,
    )
  )
    return catalog
  // 材料身份仍供旧报价使用，仅隔离此前未解析的结果资格。
  return {
    ...catalog,
    essences: catalog.essences.map((essence) =>
      isDefenceEssenceId(essence.id) ? { ...essence, mods: {} } : essence,
    ),
  }
}

export function isDefenceEssenceModId(id: unknown): boolean {
  return families.some(([tag, prefix]) =>
    tiers.some(
      (tier) => id === `${prefix}${tier[3]}${tag === 'dex_int_armour' && tier[3] === 5 ? '_' : ''}`,
    ),
  )
}

/** 原生防御身份决定展示占位的具体结果，不读取已被品质／词缀／镶嵌改变的面板。 */
export function defenceEssenceResult(
  catalog: CraftCatalog,
  base: CatalogBase,
  essence: CatalogEssence,
  findMods: (id: string) => readonly CatalogMod[],
): string[] {
  const index = tiers.findIndex(
    ([prefix]) => essence.id === `Metadata/Items/Currency/Currency${prefix}Defences`,
  )
  const tier = tiers[index]
  if (!tier || catalog._meta.sourceCommit !== commit) return []
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
    essence.type !== 'Defences' ||
    essence.tierLevel !== tier[2] ||
    Object.keys(essence.mods).length !== categories.length ||
    !categories.every((category) => essence.mods[category] === `EssenceDisplayDefences${index + 1}`)
  )
    return []
  if (!categories.includes(base.type) || base.hidden || !base.tags.includes('armour')) return []
  const matching = families.filter(([tag]) => base.tags.includes(tag))
  if (matching.length !== 1) return []
  const family = matching[0]
  if (!family) return []
  const [tag, prefix, group, text, order, hash, tags] = family
  const id = `${prefix}${tier[3]}${tag === 'dex_int_armour' && tier[3] === 5 ? '_' : ''}`
  const matches = findMods(id)
  const mod = matches[0]
  const line = `(${tier[5]})% increased ${text}`
  if (
    matches.length !== 1 ||
    !mod ||
    mod.kind !== 'prefix' ||
    mod.group !== group ||
    mod.level !== tier[4] ||
    mod.lines.length !== 1 ||
    mod.lines[0] !== line ||
    JSON.stringify(mod.statOrder) !== JSON.stringify([order]) ||
    JSON.stringify(mod.tags) !== JSON.stringify(['defences', ...tags]) ||
    mod.addsTags.length !== 0 ||
    JSON.stringify(mod.eligibility) !==
      JSON.stringify([
        { tag, value: 1 },
        { tag: 'default', value: 0 },
      ]) ||
    Object.keys(mod.tradeHashes).length !== 1 ||
    JSON.stringify(mod.tradeHashes[hash]) !== JSON.stringify([line]) ||
    mod.jewelOnly !== undefined ||
    mod.radiusJewelOnly !== undefined ||
    mod.desecratedOnly !== undefined ||
    mod.craftedOnly !== undefined
  )
    return []
  return [id]
}
