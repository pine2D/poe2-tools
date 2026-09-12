import { describe, expect, it } from 'vitest'
import type { CatalogBase, CatalogMod, CraftCatalog } from './catalog'
import { estimateDefences } from './defences'
import type { CraftState } from './rehearsal'

const base: CatalogBase = {
  id: 'test',
  name: 'Test',
  type: 'Body Armour',
  tags: ['armour'],
  requirements: {},
  properties: { Armour: 45, Evasion: 30 },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 4,
  hidden: false,
  runeforged: false,
}
const mod = (id: string, group: string, lines: string[]): CatalogMod => ({
  id,
  name: id,
  group,
  lines,
  kind: 'prefix',
  level: 1,
  statOrder: [],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'armour', value: 1 }],
  tradeHashes: {},
})
const catalog = (mods: CatalogMod[] = [], override: Partial<CatalogBase> = {}): CraftCatalog => ({
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [{ ...base, ...override }],
  modifiers: mods,
})
const state = (affixes: CraftState['affixes'] = [], quality?: number): CraftState => ({
  baseId: 'test',
  itemLevel: 80,
  rarity: affixes.length ? 'rare' : 'normal',
  affixes,
  sourceText: null,
  sockets: [],
  ...(quality === undefined ? {} : { quality }),
})

describe('防御估算', () => {
  it('按 flat、本地 increased、品质独立乘区并使用 PoB 半入取整', () => {
    const mods = [
      mod('flat', 'LocalPhysicalDamageReductionRating', ['+(10-20) to Armour']),
      mod('inc', 'LocalPhysicalDamageReductionRatingPercent', ['(40-50)% increased Armour']),
    ]
    expect(
      estimateDefences(
        catalog(mods),
        state(
          [
            { modId: 'flat', lines: ['+10(10-20) to Armour'] },
            { modId: 'inc', lines: ['50(40-50)% increased Armour'] },
          ],
          20,
        ),
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          stat: 'Armour',
          base: 45,
          flat: 10,
          increased: 50,
          runeIncreased: 0,
          quality: 20,
          value: 99,
        },
        {
          stat: 'Evasion',
          base: 30,
          flat: 0,
          increased: 0,
          runeIncreased: 0,
          quality: 20,
          value: 36,
        },
      ],
    })
    expect(
      estimateDefences(catalog([], { properties: { Armour: 45 } }), state([], 10)),
    ).toMatchObject({ ok: true, value: [{ value: 50 }] })
  })

  it('支持复合双防与混合生命组，只计算基底已有防御', () => {
    const mods = [
      mod('flat', 'LocalBaseArmourAndEvasionRating', [
        '+(9-16) to Armour',
        '+(6-10) to Evasion Rating',
      ]),
      mod('life', 'LocalIncreasedArmourAndEvasionAndLife', [
        '(6-13)% increased Armour and Evasion',
        '+(7-10) to maximum Life',
      ]),
    ]
    const result = estimateDefences(
      catalog(mods),
      state(
        [
          { modId: 'flat', lines: ['+16(9-16) to Armour', '+10(6-10) to Evasion Rating'] },
          {
            modId: 'life',
            lines: ['+13(6-13)% increased Armour and Evasion', '+10(7-10) to maximum Life'],
          },
        ],
        0,
      ),
    )
    expect(result).toMatchObject({
      ok: true,
      value: [
        { stat: 'Armour', flat: 16, increased: 13 },
        { stat: 'Evasion', flat: 10, increased: 13 },
      ],
    })
  })

  it('拒绝未掷定范围、每级效果、特殊基底、影响防御的固有和未知孔位', () => {
    const ranged = mod('flat', 'LocalPhysicalDamageReductionRating', ['+(10-20) to Armour'])
    const unresolved = estimateDefences(
      catalog([ranged]),
      state([{ modId: 'flat', lines: ['+(10-20) to Armour'] }], 0),
    )
    expect(unresolved.ok ? '' : unresolved.error).toContain('尚未掷定')
    const perLevel = mod('level', 'LocalBaseEvasionAndEnergyShieldPerLevel', [
      'Has +4 to Evasion Rating per player level',
    ])
    const perLevelResult = estimateDefences(
      catalog([perLevel]),
      state([{ modId: 'level', lines: perLevel.lines }], 0),
    )
    expect(perLevelResult.ok ? '' : perLevelResult.error).toContain('尚未支持')
    expect(estimateDefences(catalog([], { hidden: true }), state([], 0)).ok).toBe(false)
    expect(
      estimateDefences(catalog([], { implicit: '20% increased Armour' }), state([], 0)).ok,
    ).toBe(false)
    expect(estimateDefences(catalog([], { implicit: '+10 to Armour' }), state([], 0)).ok).toBe(
      false,
    )
    const rangedImplicit = estimateDefences(
      catalog([], { implicit: '+(10-20) to Armour' }),
      state([], 0),
    )
    expect(rangedImplicit.ok ? '' : rangedImplicit.error).toContain('固有属性')
    const { sockets: _sockets, ...unknownSockets } = state()
    const focus = estimateDefences(
      catalog([], { type: 'Focus', properties: { EnergyShield: 42 } }),
      unknownSockets,
    )
    expect(focus.ok ? '' : focus.error).toContain('孔')
    expect(estimateDefences(catalog(), { ...state([], 0), sockets: ['unknown-rune'] }).ok).toBe(
      false,
    )
    const unknownGroup = mod('unknown', 'LocalInventedDefence', ['+(10-20) to Armour'])
    expect(
      estimateDefences(
        catalog([unknownGroup]),
        state([{ modId: 'unknown', lines: ['+10(10-20) to Armour'] }], 0),
      ).ok,
    ).toBe(false)
    const specialQuality = mod('quality', 'LocalMaximumQuality', ['+10% to Maximum Quality'])
    const specialResult = estimateDefences(
      catalog([specialQuality]),
      state([{ modId: 'quality', lines: specialQuality.lines }], 0),
    )
    expect(specialResult.ok ? '' : specialResult.error).toContain('特殊')
  })

  it('不采用 sourceQuality，忽略普通全局防御同名组', () => {
    const global = mod('global', 'GlobalPhysicalDamageReductionRatingPercent', [
      '50% increased Armour',
    ])
    expect(
      estimateDefences(
        catalog([global], { properties: { Armour: 45 }, sourceQuality: 20 }),
        state([{ modId: 'global', lines: global.lines }], 0),
      ),
    ).toEqual({
      ok: true,
      value: [
        {
          stat: 'Armour',
          base: 45,
          flat: 0,
          increased: 0,
          runeIncreased: 0,
          quality: 0,
          value: 45,
        },
      ],
    })
    expect(
      estimateDefences(catalog([], { properties: { Armour: 45 }, sourceQuality: 20 }), state()).ok,
    ).toBe(false)
  })
})
