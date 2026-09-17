import type { CatalogBase } from './catalog'

// 固定 MIT PoB2 ce566eac 快照的普通魔符身份；不把目录品质和孔上限写入装备状态。
const IMPLICITS = [
  ['+(14-18)% to Block chance', [['block']]],
  ['(50-80)% increased Flammability Magnitude', [['elemental', 'fire', 'ailment']]],
  [null, []],
  ['(10-20)% increased Effect of your Mark Skills', [['caster', 'curse']]],
  ['Minions deal (30-50)% increased Damage', [['minion_damage', 'damage', 'minion']]],
  ['+(7-10) to Maximum Rage', [[]]],
  ['(20-30)% increased Magnitude of Shock you inflict', [['elemental', 'lightning', 'ailment']]],
] as const
const BASES = [
  [
    'Alpha',
    'maraketh_basetype',
    { level: 75, str: 98, int: 72 },
    { PhysicalMin: 63, PhysicalMax: 94, CritChanceBase: 9, AttackRateBase: 1.3, Range: 12 },
    0,
  ],
  [
    'Ashbark',
    'ezomyte_basetype',
    { level: 72, str: 94, int: 67 },
    {
      PhysicalMin: 50,
      PhysicalMax: 105,
      FireMin: 21,
      FireMax: 45,
      CritChanceBase: 8,
      AttackRateBase: 1.2,
      Range: 12,
    },
    1,
  ],
  [
    'Changeling',
    'ezomyte_basetype',
    {},
    { PhysicalMin: 9, PhysicalMax: 15, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Cinderbark',
    'ezomyte_basetype',
    { level: 10, str: 15, int: 11 },
    {
      PhysicalMin: 12,
      PhysicalMax: 25,
      FireMin: 5,
      FireMax: 10,
      CritChanceBase: 8,
      AttackRateBase: 1.2,
      Range: 12,
    },
    1,
  ],
  [
    'Condemned',
    null,
    { level: 65, str: 74, int: 52 },
    { PhysicalMin: 68, PhysicalMax: 113, CritChanceBase: 9, AttackRateBase: 1.25, Range: 12 },
    3,
  ],
  [
    'Cruel',
    'vaal_basetype',
    { level: 63, str: 72, int: 51 },
    { PhysicalMin: 62, PhysicalMax: 103, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Familial',
    'maraketh_basetype',
    { level: 16, str: 21, int: 16 },
    { PhysicalMin: 20, PhysicalMax: 34, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    4,
  ],
  [
    'Fang',
    'maraketh_basetype',
    { level: 77, str: 89, int: 68 },
    { PhysicalMin: 70, PhysicalMax: 116, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    4,
  ],
  [
    'Frenzied',
    'maraketh_basetype',
    { level: 22, str: 28, int: 20 },
    { PhysicalMin: 23, PhysicalMax: 38, CritChanceBase: 8, AttackRateBase: 1.4, Range: 12 },
    2,
  ],
  [
    'Fungal',
    'maraketh_basetype',
    { level: 78, str: 96, int: 70 },
    { PhysicalMin: 59, PhysicalMax: 98, CritChanceBase: 8, AttackRateBase: 1.4, Range: 12 },
    2,
  ],
  [
    'Fury',
    'vaal_basetype',
    { level: 59, str: 67, int: 48 },
    { PhysicalMin: 49, PhysicalMax: 91, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    5,
  ],
  [
    'Howling',
    'maraketh_basetype',
    { level: 55, str: 63, int: 45 },
    { PhysicalMin: 52, PhysicalMax: 78, CritChanceBase: 9, AttackRateBase: 1.3, Range: 12 },
    0,
  ],
  [
    'Jade',
    'karui_basetype',
    { level: 78, str: 109, int: 65 },
    { PhysicalMin: 101, PhysicalMax: 151, CritChanceBase: 5, AttackRateBase: 1.1, Range: 12 },
    2,
  ],
  [
    'Lumbering',
    'karui_basetype',
    { level: 52, str: 60, int: 43 },
    { PhysicalMin: 71, PhysicalMax: 107, CritChanceBase: 5, AttackRateBase: 1.1, Range: 12 },
    2,
  ],
  [
    'Maji',
    'vaal_basetype',
    { level: 79, str: 100, int: 67 },
    { PhysicalMin: 61, PhysicalMax: 114, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    5,
  ],
  [
    'Nettle',
    'ezomyte_basetype',
    { level: 5, str: 9, int: 8 },
    { PhysicalMin: 12, PhysicalMax: 20, CritChanceBase: 11, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Primal',
    'maraketh_basetype',
    { level: 28, str: 34, int: 25 },
    { PhysicalMin: 31, PhysicalMax: 46, CritChanceBase: 9, AttackRateBase: 1.3, Range: 12 },
    0,
  ],
  [
    'Rabid',
    'vaal_basetype',
    { level: 34, str: 40, int: 29 },
    { PhysicalMin: 31, PhysicalMax: 58, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    5,
  ],
  [
    'Roaring',
    null,
    { level: 58, str: 66, int: 47 },
    { PhysicalMin: 57, PhysicalMax: 96, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    5,
  ],
  [
    'Spiny',
    'ezomyte_basetype',
    { level: 67, str: 86, int: 65 },
    { PhysicalMin: 60, PhysicalMax: 99, CritChanceBase: 11, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Thunder',
    'karui_basetype',
    { level: 77, str: 102, int: 72 },
    {
      PhysicalMin: 23,
      PhysicalMax: 130,
      LightningMin: 9,
      LightningMax: 56,
      CritChanceBase: 8,
      AttackRateBase: 1.3,
      Range: 12,
    },
    6,
  ],
  [
    'Vicious',
    'vaal_basetype',
    { level: 40, str: 47, int: 34 },
    { PhysicalMin: 43, PhysicalMax: 71, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Voltfang',
    'karui_basetype',
    { level: 46, str: 53, int: 38 },
    {
      PhysicalMin: 16,
      PhysicalMax: 91,
      LightningMin: 6,
      LightningMax: 39,
      CritChanceBase: 8,
      AttackRateBase: 1.3,
      Range: 12,
    },
    6,
  ],
  [
    'Wildwood',
    'vaal_basetype',
    { level: 70, str: 98, int: 72 },
    { PhysicalMin: 67, PhysicalMax: 112, CritChanceBase: 8, AttackRateBase: 1.25, Range: 12 },
    2,
  ],
  [
    'Wingbeat',
    null,
    { level: 65, str: 74, int: 52 },
    { PhysicalMin: 45, PhysicalMax: 83, CritChanceBase: 7, AttackRateBase: 1.45, Range: 12 },
    2,
  ],
] as const

export function isBasicTalismanBaseId(id: unknown): boolean {
  return BASES.some(([name]) => id === `${name} Talisman`)
}

function sameNumbers(
  actual: Record<string, number>,
  expected: Readonly<Record<string, number>>,
): boolean {
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  )
}

/** 精确基底与标签共用一个入口，不能借同类名称伪造孔位、技能或局部面板。 */
export function isBasicTalismanBase(base: CatalogBase): boolean {
  const row = BASES.find(([name]) => base.id === `${name} Talisman`)
  if (
    !row ||
    base.type !== 'Talisman' ||
    base.name !== base.id ||
    base.hidden !== false ||
    base.runeforged !== false ||
    base.sourceQuality !== 20 ||
    base.socketLimit !== 4 ||
    [
      'subType',
      'variant',
      'variantList',
      'flask',
      'charm',
      'charmLimit',
      'spirit',
      'grantedSkillsHaveNoReservation',
    ].some((key) => Object.hasOwn(base, key))
  )
    return false
  const [, culture, requirements, properties, implicitIndex] = row
  const tags = [
    'default',
    'talisman',
    'two_hand_weapon',
    'twohand',
    'weapon',
    ...(culture ? [culture] : []),
  ]
  const [implicit, implicitTags] = IMPLICITS[implicitIndex]
  return (
    base.tags.length === tags.length &&
    tags.every((tag) => base.tags.includes(tag)) &&
    sameNumbers(base.requirements, requirements) &&
    sameNumbers(base.properties, properties) &&
    base.implicit === implicit &&
    base.implicitTags.length === implicitTags.length &&
    implicitTags.every(
      (group, index) =>
        base.implicitTags[index]?.length === group.length &&
        group.every((tag) => base.implicitTags[index]?.includes(tag)),
    )
  )
}
