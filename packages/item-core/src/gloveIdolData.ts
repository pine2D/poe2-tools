import type { CatalogAugment, CatalogStatScalar } from './catalog'

// 固定 MIT PoB2 ModRunes 快照，公共字段显式还原；不扩展孔位权限。
const rows = [
  [
    'Idol of Sirrius',
    '8% increased Attack Speed',
    985,
    '681332047',
    50,
    1,
    null,
    '20% reduced Slowing Potency of Debuffs on You',
    4746,
  ],
  [
    'Snake Idol',
    '8% increased Curse Magnitudes',
    2376,
    '2353576063',
    0,
    null,
    null,
    'Remnants you create have 15% increased effect',
    9738,
  ],
  [
    'Cat Idol',
    '25% increased Accuracy Rating',
    1332,
    '624954515',
    0,
    null,
    null,
    '30% increased Charm Charges gained',
    5602,
  ],
  [
    'Wolf Idol',
    '15% increased Magnitude of Bleeding you inflict',
    4807,
    '3166958180',
    0,
    null,
    null,
    '25% reduced Magnitude of Bleeding on You',
    4661,
  ],
  [
    'Boar Idol',
    'Gain 1 Rage on Melee Hit',
    6871,
    '2709367754',
    0,
    null,
    null,
    '25% increased Warcry Cooldown Recovery Rate',
    3035,
  ],
  [
    'Idol of Kraityn',
    '15% chance when you gain a Frenzy Charge to gain an additional Frenzy Charge',
    5517,
    '2916861134',
    50,
    1,
    null,
    '+1 to Maximum Frenzy Charges',
    1564,
  ],
  [
    'Carved Majesty',
    'Companions gain Onslaught for 4 seconds on Hitting your Marked targets',
    5730,
    '226999623',
    60,
    1,
    'AncientAugment',
    'Companions deal 30% increased Damage',
    5719,
  ],
  [
    'Carved Mischief',
    "+5% to maximum Block chance if you've Blocked with a raised Shield Recently",
    4207,
    '3617372509',
    60,
    1,
    'AncientAugment',
    '20% increased Block chance',
    1133,
  ],
  [
    'Carved Tenacity',
    'Enemies you Critically Hit get 100% reduced Life Regeneration Rate for 4 seconds',
    5819,
    '3370077792',
    60,
    1,
    'AncientAugment',
    '15% increased Critical Hit Chance',
    976,
  ],
] as const
export const GLOVE_IDOL_RECORDS: readonly CatalogAugment[] = rows.map(
  ([name, line, order, hash, levelReq, limit, limitId, bondedLine, bondedOrder]) => ({
    id: `pob2:augment:${JSON.stringify([name, 'gloves'])}`,
    name,
    category: 'gloves',
    type: 'Idol',
    localMod: false,
    lines: [line],
    statOrder: [order],
    tradeHashes: { [hash]: [line] },
    levelReq,
    ...(limit === null ? {} : { limit }),
    ...(limitId === null ? {} : { limitId }),
    canSocketInUniqueItems: true,
    canSocketInJewellery: true,
    canSocketInCorruptedSanctified: true,
    bonded: { lines: [bondedLine], statOrder: [bondedOrder] },
  }),
)
export const GLOVE_IDOL_SCALABILITY: Readonly<Record<string, readonly CatalogStatScalar[]>> = {
  '8% increased Attack Speed': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '8% increased Curse Magnitudes': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '25% increased Accuracy Rating': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '15% increased Magnitude of Bleeding you inflict': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Gain 1 Rage on Melee Hit': [
    {
      scalable: true,
      formats: [],
    },
  ],
  '15% chance when you gain a Frenzy Charge to gain an additional Frenzy Charge': [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Companions gain Onslaught for 4 seconds on Hitting your Marked targets': [
    {
      scalable: true,
      formats: ['milliseconds_to_seconds_2dp_if_required'],
    },
  ],
  "+5% to maximum Block chance if you've Blocked with a raised Shield Recently": [
    {
      scalable: true,
      formats: [],
    },
  ],
  'Enemies you Critically Hit get 100% reduced Life Regeneration Rate for 4 seconds': [
    {
      scalable: true,
      formats: ['negate'],
    },
    {
      scalable: false,
      formats: [],
    },
  ],
}
