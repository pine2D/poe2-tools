import type { CatalogAugment, CatalogStatScalar } from './catalog'

// 固定 MIT PoB2 ce566eac 快照；圆盾 Silk 正常显示文本缺失，不纳入允许集。
export const OFFHAND_IDOL_RECORDS: readonly CatalogAugment[] = [
  {
    id: 'pob2:augment:["Owl Idol","focus"]',
    name: 'Owl Idol',
    category: 'focus',
    type: 'Idol',
    localMod: false,
    lines: ['12% increased Cooldown Recovery Rate'],
    statOrder: [4103],
    tradeHashes: {
      '1004011302': ['12% increased Cooldown Recovery Rate'],
    },
    levelReq: 0,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['20% increased effect of Archon Buffs on you'],
      statOrder: [4345],
    },
  },
  {
    id: 'pob2:augment:["Ox Idol","shield"]',
    name: 'Ox Idol',
    category: 'shield',
    type: 'Idol',
    localMod: true,
    lines: ['15% increased Block chance'],
    statOrder: [839],
    tradeHashes: {
      '2481353198': ['15% increased Block chance'],
    },
    levelReq: 0,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['15% chance for Damage of Enemies Hitting you to be Unlucky'],
      statOrder: [6400],
    },
  },
  {
    id: 'pob2:augment:["Ox Idol","buckler"]',
    name: 'Ox Idol',
    category: 'buckler',
    type: 'Idol',
    localMod: true,
    lines: ['15% increased Block chance'],
    statOrder: [839],
    tradeHashes: {
      '2481353198': ['15% increased Block chance'],
    },
    levelReq: 0,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['15% chance for Damage of Enemies Hitting you to be Unlucky'],
      statOrder: [6400],
    },
  },
  {
    id: 'pob2:augment:["Idol of Greust","shield"]',
    name: 'Idol of Greust',
    category: 'shield',
    type: 'Idol',
    localMod: false,
    lines: ['+25% of Armour also applies to Elemental Damage'],
    statOrder: [1027],
    tradeHashes: {
      '3362812763': ['+25% of Armour also applies to Elemental Damage'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['12% increased Damage for each type of Elemental Ailment on Enemy'],
      statOrder: [5950],
    },
  },
  {
    id: 'pob2:augment:["Idol of Greust","buckler"]',
    name: 'Idol of Greust',
    category: 'buckler',
    type: 'Idol',
    localMod: false,
    lines: ['Gain Deflection Rating equal to 20% of Evasion Rating'],
    statOrder: [1028],
    tradeHashes: {
      '3033371881': ['Gain Deflection Rating equal to 20% of Evasion Rating'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['12% increased Damage for each type of Elemental Ailment on Enemy'],
      statOrder: [5950],
    },
  },
  {
    id: 'pob2:augment:["Idol of Silk","shield"]',
    name: 'Idol of Silk',
    category: 'shield',
    type: 'Idol',
    localMod: false,
    lines: ['15% increased Block chance while your Companion is in your Presence'],
    statOrder: [4937],
    tradeHashes: {
      '3087034595': ['15% increased Block chance while your Companion is in your Presence'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+3% to maximum Block chance'],
      statOrder: [1734],
    },
  },
]
export const OFFHAND_IDOL_SCALABILITY: Readonly<Record<string, readonly CatalogStatScalar[]>> = {
  '12% increased Cooldown Recovery Rate': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '15% increased Block chance': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+25% of Armour also applies to Elemental Damage': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Gain Deflection Rating equal to 20% of Evasion Rating': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '15% increased Block chance while your Companion is in your Presence': [
    {
      scalable: true,
      formats: [],
    },
  ],
}
