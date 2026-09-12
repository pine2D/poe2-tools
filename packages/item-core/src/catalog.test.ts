import { describe, expect, it } from 'vitest'
import { type CatalogBase, type CatalogMod, inspectModPool, searchBases } from './catalog'
import { parseCraftCatalog } from './catalogFormat'

const base: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
  type: 'Focus',
  tags: ['default', 'focus', 'int_armour'],
  requirements: {},
  properties: { EnergyShield: 30 },
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const mod: CatalogMod = {
  id: 'TestShield',
  kind: 'prefix',
  name: 'Test',
  group: 'LocalShield',
  level: 40,
  lines: ['+(30-40) to maximum Energy Shield'],
  statOrder: [1],
  tags: ['defences'],
  addsTags: [],
  eligibility: [
    { tag: 'focus', value: 1 },
    { tag: 'default', value: 0 },
  ],
  tradeHashes: { '4052037485': ['+(30-40) to maximum Energy Shield'] },
}

describe('制作基底搜索和适用词缀池', () => {
  it('目录边界拒绝旧版本、重复身份和不可信资格数值，合法快照可读取', () => {
    const catalog = {
      _meta: {
        schemaVersion: 2,
        tier: 'primary',
        sourceCommit: 'a'.repeat(40),
        gameVersion: null,
        generatedAt: '2026-09-12',
        weightStatus: 'unknown',
        sources: [],
        excludedBases: [],
      },
      bases: [base],
      modifiers: [mod],
    }
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    expect(() =>
      parseCraftCatalog({ ...catalog, _meta: { ...catalog._meta, schemaVersion: 1 } }),
    ).toThrow()
    expect(() => parseCraftCatalog({ ...catalog, bases: [base, base] })).toThrow()
    expect(() =>
      parseCraftCatalog({
        ...catalog,
        modifiers: [{ ...mod, eligibility: [{ tag: 'focus', value: 100 }] }],
      }),
    ).toThrow()
    for (const eligibility of [
      [],
      [{ tag: 'focus', value: 1 }],
      [...mod.eligibility, { tag: 'focus', value: 0 }],
    ]) {
      expect(() =>
        parseCraftCatalog({ ...catalog, modifiers: [{ ...mod, eligibility }] }),
      ).toThrow()
    }
    for (const fields of [
      { subType: 42 },
      { variantList: 42 },
      { grantedSkillsHaveNoReservation: 'true' },
      { charmLimit: '3' },
      { spirit: Number.NaN },
      { flask: { chargesMax: '40' } },
      { charm: 'broken' },
      { charm: { duration: 3, chargesUsed: 15, chargesMax: 40, buff: [42] } },
    ]) {
      expect(() => parseCraftCatalog({ ...catalog, bases: [{ ...base, ...fields }] })).toThrow()
    }
    expect(
      parseCraftCatalog({
        ...catalog,
        bases: [
          {
            ...base,
            subType: 'Test',
            variantList: ['A', 'B'],
            grantedSkillsHaveNoReservation: false,
            charmLimit: 3,
            spirit: 100,
            flask: { chargesMax: 40 },
            charm: { duration: 3, chargesUsed: 15, chargesMax: 40, buff: ['Test buff'] },
          },
        ],
      }).bases[0]?.charm?.chargesMax,
    ).toBe(40)
    const variant = {
      ...base,
      id: `pob2:base:v1:${'b'.repeat(64)}`,
      variant: {
        visibility: 'mixed',
        declarations: [
          { sourcePath: 'src/Data/Bases/focus.lua', index: 0, hidden: false },
          { sourcePath: 'src/Data/Bases/focus.lua', index: 1, hidden: true },
        ],
      },
    }
    expect(parseCraftCatalog({ ...catalog, bases: [variant] }).bases).toHaveLength(1)
    for (const fields of [
      { id: 'not-a-content-id' },
      { variant: undefined },
      { hidden: true },
      { variant: { ...variant.variant, visibility: 'visible' } },
      { variant: { ...variant.variant, declarations: [] } },
      {
        variant: {
          ...variant.variant,
          declarations: [variant.variant.declarations[0], variant.variant.declarations[0]],
        },
      },
    ]) {
      expect(() => parseCraftCatalog({ ...catalog, bases: [{ ...variant, ...fields }] })).toThrow()
    }
  })
  it('搜索中英文名称与类别，隐藏数据不进入普通目录，精确名称优先', () => {
    const bases = [
      { ...base, id: 'Test Focus Large', name: 'Test Focus Large' },
      base,
      { ...base, id: 'Hidden Focus', hidden: true },
    ]
    expect(searchBases(bases, '测试法器', { 'Test Focus': '测试法器' }).map((b) => b.id)).toEqual([
      'Test Focus',
    ])
    expect(searchBases(bases, 'test focus', {}).map((b) => b.id)).toEqual([
      'Test Focus',
      'Test Focus Large',
    ])
    expect(searchBases(bases, 'Focus', {})).toHaveLength(2)
  })
  it('适用性按标签首个命中，不将0/1解释为概率或任意禁止标签优先', () => {
    const forbidden: CatalogMod = {
      ...mod,
      id: 'Blocked',
      eligibility: [{ tag: 'no_defences', value: 0 }, ...mod.eligibility],
    }
    const result = inspectModPool(base, [mod, forbidden], 50, [], ['no_defences'])
    expect(result.map((entry) => entry.mod.id)).toEqual(['TestShield'])
    expect(result[0]?.reasons).toEqual([])
    expect(result[0]).not.toHaveProperty('probability')
  })
  it('等级和冲突分别解释，同trade hash不同组仍独立，不能推断游戏阶级', () => {
    const differentGroup = { ...mod, id: 'Other', group: 'OtherShield' }
    const result = inspectModPool(base, [mod, differentGroup], 30, ['LocalShield'])
    expect(result[0]?.reasons).toEqual(['level', 'conflict'])
    expect(result[1]?.reasons).toEqual(['level'])
    expect(result[0]).not.toHaveProperty('tier')
  })
  it('拒绝无效物品等级，零适用性词缀不进入池', () => {
    expect(() => inspectModPool(base, [mod], Number.NaN)).toThrow()
    expect(() => inspectModPool(base, [mod], 0)).toThrow()
    expect(
      inspectModPool(base, [{ ...mod, eligibility: [{ tag: 'default', value: 0 }] }], 100),
    ).toEqual([])
  })
})
