import type { CatalogAugment } from './catalog'

// 已登记固定 MIT ModRunes 与 ModScalability 的长杖分支，完整参数用于来源核对。
export const STAFF_RUNES: readonly CatalogAugment[] = [
  {
    id: 'pob2:augment:["Hedgewitch Assandra\'s Rune of Wisdom","staff"]',
    name: "Hedgewitch Assandra's Rune of Wisdom",
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['+1 to Level of all Spell Skills'],
    statOrder: [950],
    tradeHashes: {
      '124131830': ['+1 to Level of all Spell Skills'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['Archon recovery period expires 30% faster'],
      statOrder: [4343],
    },
  },
  {
    id: 'pob2:augment:["Saqawal\'s Rune of the Sky","staff"]',
    name: "Saqawal's Rune of the Sky",
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['Gain 5% of Damage as Extra Damage of all Elements'],
    statOrder: [9264],
    tradeHashes: {
      '731403740': ['Gain 5% of Damage as Extra Damage of all Elements'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: [
        '12% chance when collecting an Elemental Infusion to gain an',
        'additional Elemental Infusion of the same type',
      ],
      statOrder: [4193, 4193.1],
    },
  },
  {
    id: 'pob2:augment:["Fenumus\' Rune of Agony","staff"]',
    name: "Fenumus' Rune of Agony",
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['Gain 13% of Damage as Extra Chaos Damage'],
    statOrder: [1672],
    tradeHashes: {
      '3398787959': ['Gain 13% of Damage as Extra Chaos Damage'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['Gain 8% of Damage as Extra Physical Damage'],
      statOrder: [1671],
    },
  },
  {
    id: 'pob2:augment:["Thane Girt\'s Rune of Wildness","staff"]',
    name: "Thane Girt's Rune of Wildness",
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['25% chance for Spell Skills to fire 2 additional Projectiles'],
    statOrder: [10037],
    tradeHashes: {
      '2910761524': ['25% chance for Spell Skills to fire 2 additional Projectiles'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['Every Rage also grants 1% increased Spell Damage'],
      statOrder: [10011],
    },
  },
  {
    id: 'pob2:augment:["Warding Rune of Desperation","staff"]',
    name: 'Warding Rune of Desperation',
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['Spell damage Penetrates 25% of enemy Elemental Resistances while on Low Runic Ward'],
    statOrder: [10045],
    tradeHashes: {
      '267552601': [
        'Spell damage Penetrates 25% of enemy Elemental Resistances while on Low Runic Ward',
      ],
    },
    levelReq: 15,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['12% increased Elemental Damage'],
      statOrder: [1726],
    },
  },
  {
    id: 'pob2:augment:["Ancient Rune of Discovery","staff"]',
    name: 'Ancient Rune of Discovery',
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['30% chance to create an additional Remnant'],
    statOrder: [5406],
    tradeHashes: {
      '2328443419': ['30% chance to create an additional Remnant'],
    },
    levelReq: 30,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+1 to maximum number of Elemental Infusions'],
      statOrder: [8875],
    },
  },
  {
    id: 'pob2:augment:["Rune of Reach","staff"]',
    name: 'Rune of Reach',
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: [
      'Remnants you create have 25% reduced effect',
      'Remnants can be collected from 50% further away',
    ],
    statOrder: [9738, 9740],
    tradeHashes: {
      '1999910726': ['Remnants you create have 25% reduced effect'],
      '3482326075': ['Remnants can be collected from 50% further away'],
    },
    levelReq: 15,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['20% increased Exposure Effect'],
      statOrder: [6530],
    },
  },
  {
    id: 'pob2:augment:["Legacy of Dusk Vigil","staff"]',
    name: 'Legacy of Dusk Vigil',
    category: 'staff',
    type: 'Rune',
    localMod: false,
    lines: ['Gain 30% of Physical Damage as Extra Fire Damage'],
    statOrder: [1674],
    tradeHashes: {
      '1936645603': ['Gain 30% of Physical Damage as Extra Fire Damage'],
    },
    levelReq: 65,
    limit: 1,
    limitId: 'AldursLegacyLimit1',
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['Triggered Spells deal 20% increased Spell Damage'],
      statOrder: [10330],
    },
  },
]
export const STAFF_RUNE_SCALABILITY = {
  '+1 to Level of all Spell Skills': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Gain 5% of Damage as Extra Damage of all Elements': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Gain 13% of Damage as Extra Chaos Damage': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '25% chance for Spell Skills to fire 2 additional Projectiles': [
    {
      scalable: true,
      formats: [],
    },
    {
      scalable: false,
      formats: [],
    },
  ],
  'Spell damage Penetrates 25% of enemy Elemental Resistances while on Low Runic Ward': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '30% chance to create an additional Remnant': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Remnants you create have 25% reduced effect': [
    {
      scalable: true,
      formats: ['negate'],
    },
  ],
  'Remnants can be collected from 50% further away': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Gain 30% of Physical Damage as Extra Fire Damage': [
    {
      scalable: true,
      formats: [],
    },
  ],
}
