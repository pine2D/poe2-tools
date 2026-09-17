import type { CatalogAugment, CatalogStatScalar } from './catalog'

// 固定 MIT PoB2 ModRunes 快照，完整身份保留。
export const BODY_IDOL_RECORDS: readonly CatalogAugment[] = [
  {
    id: 'pob2:augment:["Idol of Maxarius","body armour"]',
    name: 'Idol of Maxarius',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['+1 Charm Slot'],
    statOrder: [9317],
    tradeHashes: {
      '554899692': ['+1 Charm Slot'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['Storm Skills have +1 to Limit'],
      statOrder: [10115],
    },
  },
  {
    id: 'pob2:augment:["Rabbit Idol","body armour"]',
    name: 'Rabbit Idol',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['12% increased Rarity of Items found'],
    statOrder: [941],
    tradeHashes: {
      '3917489142': ['12% increased Rarity of Items found'],
    },
    levelReq: 0,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['10% increased Quantity of Gold Dropped by Slain Enemies'],
      statOrder: [6915],
    },
  },
  {
    id: 'pob2:augment:["Fox Idol","body armour"]',
    name: 'Fox Idol',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['Idols socketed in this item gain the benefits of their Bonded modifiers'],
    statOrder: [7734],
    tradeHashes: {
      '726496846': ['Idols socketed in this item gain the benefits of their Bonded modifiers'],
      '3843204282': [''],
    },
    levelReq: 0,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+5% to Quality of all Skills'],
      statOrder: [975],
    },
  },
  {
    id: 'pob2:augment:["Idol of Eramir","body armour"]',
    name: 'Idol of Eramir',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['Skills have 10% chance to not remove Charges but still count as consuming them'],
    statOrder: [5600],
    tradeHashes: {
      '2942439603': [
        'Skills have 10% chance to not remove Charges but still count as consuming them',
      ],
    },
    levelReq: 50,
    limit: 1,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['15% chance for Charms you use to not consume Charges'],
      statOrder: [5631],
    },
  },
  {
    id: 'pob2:augment:["Panther Idol","body armour"]',
    name: 'Panther Idol',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['+10% of Armour also applies to Chaos Damage'],
    statOrder: [4645],
    tradeHashes: {
      '3972229254': ['+10% of Armour also applies to Chaos Damage'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+8% to Chaos Resistance'],
      statOrder: [1024],
    },
  },
  {
    id: 'pob2:augment:["Hawk Idol","body armour"]',
    name: 'Hawk Idol',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['10% increased Deflection Rating'],
    statOrder: [6115],
    tradeHashes: {
      '3040571529': ['10% increased Deflection Rating'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+12% to Cold Resistance'],
      statOrder: [1020],
    },
  },
  {
    id: 'pob2:augment:["Stoat Idol","body armour"]',
    name: 'Stoat Idol',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['5% of Damage taken bypasses Energy Shield'],
    statOrder: [1456],
    tradeHashes: {
      '2448633171': ['5% of Damage taken bypasses Energy Shield'],
    },
    levelReq: 50,
    limit: 1,
    canSocketInChakraSlots: true,
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['+12% to Lightning Resistance'],
      statOrder: [1023],
    },
  },
  {
    id: 'pob2:augment:["Carved Cunning","body armour"]',
    name: 'Carved Cunning',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ["Prevent +5% of Damage from Deflected Hits if you've", 'Deflected no Hits Recently'],
    statOrder: [4679, 4679.1],
    tradeHashes: {
      '967155385': [
        "Prevent +5% of Damage from Deflected Hits if you've",
        'Deflected no Hits Recently',
      ],
    },
    levelReq: 60,
    limit: 1,
    limitId: 'AncientAugment',
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['8% increased Deflection Rating'],
      statOrder: [6115],
    },
  },
  {
    id: 'pob2:augment:["Carved Majesty","body armour"]',
    name: 'Carved Majesty',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ['+3 to Spirit per Idol socketed in your Equipment'],
    statOrder: [4752],
    tradeHashes: {
      '1073847159': ['+3 to Spirit per Idol socketed in your Equipment'],
    },
    levelReq: 60,
    limit: 1,
    limitId: 'AncientAugment',
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['5% increased Spirit'],
      statOrder: [1417],
    },
  },
  {
    id: 'pob2:augment:["Carved Mischief","body armour"]',
    name: 'Carved Mischief',
    category: 'body armour',
    type: 'Idol',
    localMod: false,
    lines: ["200% increased Stun Threshold if you've been Stunned Recently"],
    statOrder: [10138],
    tradeHashes: {
      '751944209': ["200% increased Stun Threshold if you've been Stunned Recently"],
    },
    levelReq: 60,
    limit: 1,
    limitId: 'AncientAugment',
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: {
      lines: ['25% increased Stun Threshold'],
      statOrder: [2983],
    },
  },
]

export const BODY_IDOL_SCALABILITY: Readonly<Record<string, readonly CatalogStatScalar[]>> = {
  '+1 Charm Slot': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Storm Skills have +1 to Limit': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '12% increased Rarity of Items found': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '10% increased Quantity of Gold Dropped by Slain Enemies': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Idols socketed in this item gain the benefits of their Bonded modifiers': [],
  '+5% to Quality of all Skills': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Skills have 10% chance to not remove Charges but still count as consuming them': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '15% chance for Charms you use to not consume Charges': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+10% of Armour also applies to Chaos Damage': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+8% to Chaos Resistance': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '10% increased Deflection Rating': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+12% to Cold Resistance': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '5% of Damage taken bypasses Energy Shield': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+12% to Lightning Resistance': [
    {
      scalable: true,
      formats: [],
    },
  ],
  "Prevent +5% of Damage from Deflected Hits if you've\nDeflected no Hits Recently": [
    {
      scalable: true,
      formats: [],
    },
  ],
  '8% increased Deflection Rating': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '+3 to Spirit per Idol socketed in your Equipment': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '5% increased Spirit': [
    {
      scalable: true,
      formats: [],
    },
  ],
  "200% increased Stun Threshold if you've been Stunned Recently": [
    {
      scalable: true,
      formats: [],
    },
  ],
  '25% increased Stun Threshold': [
    {
      scalable: true,
      formats: [],
    },
  ],
}
