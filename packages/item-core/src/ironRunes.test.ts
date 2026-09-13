import { describe, expect, it } from 'vitest'
import type { CatalogAugment, CatalogBase, CraftCatalog } from './catalog'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { estimateDefences } from './defences'
import { parseRuneEffectTotals } from './runeEffects'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates } from './sockets'

const iron = (name = 'Iron Rune', value = 16): CatalogAugment => ({
  id: `iron-${value}`,
  name,
  category: 'armour',
  type: 'Rune',
  localMod: true,
  lines: [`${value}% increased Armour, Evasion and Energy Shield`],
  statOrder: [1],
  tradeHashes: {},
  levelReq: 0,
  bonded: { lines: ['+99 to maximum Life'], statOrder: [2] },
})
const fire: CatalogAugment = {
  ...iron('Lesser Desert Rune', 10),
  id: 'fire-10',
  localMod: false,
  lines: ['+10% to Fire Resistance'],
}
const base: CatalogBase = {
  id: 'body',
  name: 'Body',
  type: 'Body Armour',
  tags: ['armour'],
  requirements: {},
  properties: { Armour: 100, Evasion: 50, EnergyShield: 25 },
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const catalog = (augments: CatalogAugment[] = []): CraftCatalog => ({
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [
      { path: 'src/Data/ModRunes.lua', url: 'https://example.test', sha256: 'a'.repeat(64) },
    ],
  },
  bases: [base],
  modifiers: [],
  augments,
})

describe('钢铁符文核心', () => {
  it('共享解析器只接受正整数三抗和三防并精确求和', () => {
    expect(
      parseRuneEffectTotals([
        '+10% to Fire Resistance',
        '14% increased Armour, Evasion and Energy Shield',
        '16% increased Armour, Evasion and Energy Shield',
      ]),
    ).toEqual({ Fire: 10, Cold: 0, Lightning: 0, Defences: 30 })
    expect(parseRuneEffectTotals([])).toEqual({ Fire: 0, Cold: 0, Lightning: 0, Defences: 0 })
    for (const lines of [
      ['0% increased Armour, Evasion and Energy Shield'],
      ['14.5% increased Armour, Evasion and Energy Shield'],
      ['14% increased Armour, Evasion and Energy Shield', '+1 to maximum Life'],
    ])
      expect(parseRuneEffectTotals(lines)).toBeNull()
  })

  it('支持四档Iron且严格核对family、localMod和普通效果', () => {
    const names = ['Lesser Iron Rune', 'Iron Rune', 'Greater Iron Rune', 'Perfect Iron Rune']
    const source = catalog(names.map((name, index) => iron(name, 14 + index * 2)))
    const state = {
      baseId: 'body',
      itemLevel: 1,
      rarity: 'normal' as const,
      affixes: [],
      sourceText: null,
      sockets: [null],
      quality: 0,
    }
    expect(socketCandidates(source, state).map(({ name }) => name)).toEqual(names)
    for (const patch of [
      { localMod: false },
      { category: 'weapon' },
      { lines: ['16% increased Armour, Evasion and Energy Shield', '+1 to maximum Life'] },
      { lines: ['+16% to Fire Resistance'] },
    ])
      expect(socketCandidates(catalog([{ ...iron(), ...patch }]), state)).toEqual([])
  })

  it('两枚Iron相加进入本地总提高，品质独立乘算且Bonded不生效', () => {
    const source = catalog([iron('Lesser Iron Rune', 14), iron('Iron Rune', 16), fire])
    source.modifiers = [
      {
        id: 'armour',
        name: 'armour',
        kind: 'prefix',
        group: 'LocalPhysicalDamageReductionRating',
        level: 1,
        lines: ['+(10-20) to Armour', '(5-10)% increased Armour'],
        statOrder: [1, 2],
        tags: [],
        addsTags: [],
        eligibility: [{ tag: 'armour', value: 1 }],
        tradeHashes: {},
      },
    ]
    const result = estimateDefences(source, {
      baseId: 'body',
      itemLevel: 1,
      rarity: 'magic',
      affixes: [{ modId: 'armour', lines: ['+20(10-20) to Armour', '10(5-10)% increased Armour'] }],
      sourceText: null,
      sockets: ['iron-14', 'iron-16'],
      quality: 20,
    })
    expect(result).toEqual({
      ok: true,
      value: [
        {
          stat: 'Armour',
          base: 100,
          flat: 20,
          increased: 40,
          runeIncreased: 30,
          quality: 20,
          value: 202,
        },
        {
          stat: 'Evasion',
          base: 50,
          flat: 0,
          increased: 30,
          runeIncreased: 30,
          quality: 20,
          value: 78,
        },
        {
          stat: 'EnergyShield',
          base: 25,
          flat: 0,
          increased: 30,
          runeIncreased: 30,
          quality: 20,
          value: 39,
        },
      ],
    })
    expect(
      estimateDefences(source, {
        baseId: 'body',
        itemLevel: 1,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        sockets: ['fire-10'],
        quality: 20,
      }),
    ).toMatchObject({
      ok: true,
      value: [
        { stat: 'Armour', increased: 0, runeIncreased: 0, value: 120 },
        { stat: 'Evasion', increased: 0, runeIncreased: 0, value: 60 },
        { stat: 'EnergyShield', increased: 0, runeIncreased: 0, value: 30 },
      ],
    })
  })

  it('导入来源可用一条三防合计核对两枚Iron并保留来源身份', () => {
    const source = catalog([iron('Lesser Iron Rune', 14), iron('Iron Rune', 16)])
    const state = {
      baseId: 'body',
      itemLevel: 1,
      rarity: 'normal' as const,
      affixes: [],
      sourceText: 'source',
      sockets: ['iron-14', 'iron-16'],
      runeSourceLines: ['30% increased Armour, Evasion and Energy Shield'],
      quality: 0,
    }
    expect(runeSocketContributionError(source, state)).toBeNull()
    expect(state.runeSourceLines).toEqual(['30% increased Armour, Evasion and Energy Shield'])
    expect(
      runeSocketContributionError(source, {
        ...state,
        runeSourceLines: ['29% increased Armour, Evasion and Energy Shield'],
      }),
    ).not.toBeNull()
  })

  it('v13往返，v5-v8从合法旧基线拒绝游标后的Iron操作', () => {
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v24')
    const source = catalog([iron(), fire])
    const current = {
      schemaVersion: 1,
      sourceCommit: 'test',
      rulesVersion: CRAFT_RULES_VERSION,
      augmentSourceHash: 'a'.repeat(64),
      initialState: {
        baseId: 'body',
        itemLevel: 1,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        sockets: [null],
        quality: 0,
      },
      operations: [{ kind: 'socket', socketIndex: 0, augmentId: 'iron-16' }],
      cursor: 0,
    }
    expect(parseCraftProject(JSON.stringify(current), source).ok).toBe(true)
    for (let version = 5; version <= 8; version++) {
      const baseline = {
        ...current,
        rulesVersion: `basic-2026-09-12-v${version}`,
        initialState: { ...current.initialState, quality: undefined },
        operations: [{ kind: 'socket', socketIndex: 0, augmentId: fire.id }],
        cursor: 0,
      }
      expect(parseCraftProject(JSON.stringify(baseline), source).ok).toBe(true)
      const rejected = parseCraftProject(
        JSON.stringify({
          ...baseline,
          operations: [...baseline.operations, current.operations[0]],
        }),
        source,
      )
      expect(rejected.ok ? '' : rejected.error).toContain('钢铁符文')
    }
  })

  it('v9从起点及导入声明两条路径拒绝Iron', () => {
    const source = catalog([iron(), fire])
    const baseProject = {
      schemaVersion: 1,
      sourceCommit: 'test',
      rulesVersion: 'basic-2026-09-12-v9',
      augmentSourceHash: 'a'.repeat(64),
      initialState: {
        baseId: 'body',
        itemLevel: 1,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
        sockets: [null],
        quality: 0,
      },
      operations: [],
      cursor: 0,
    }
    for (const input of [
      { ...baseProject, initialState: { ...baseProject.initialState, sockets: ['iron-16'] } },
      {
        ...baseProject,
        initialState: {
          ...baseProject.initialState,
          sourceText:
            'Item Class: Body Armours\nRarity: Normal\nBody\n--------\nItem Level: 1\n--------\nSockets: S',
        },
        importedSockets: ['iron-16'],
      },
    ]) {
      const rejected = parseCraftProject(JSON.stringify(input), source)
      expect(rejected.ok ? '' : rejected.error).toContain('钢铁符文')
    }
  })
})
