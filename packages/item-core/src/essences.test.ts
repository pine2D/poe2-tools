import { describe, expect, it } from 'vitest'
import type { CatalogBase, CraftCatalog } from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { essenceCategory, inspectEssences } from './essences'

const sourceCommit = 'a'.repeat(40)
const source = {
  path: 'src/Data/Essence.lua',
  url: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${sourceCommit}/src/Data/Essence.lua`,
  sha256: 'b'.repeat(64),
}
const essence = {
  id: 'Metadata/Items/Currency/TestEssence',
  name: 'Test Essence',
  type: 'Test',
  tierLevel: 72,
  mods: {
    Focus: 'test',
    Shield: 'shield',
    Buckler: 'buckler',
    Staff: 'staff',
    Warstaff: 'warstaff',
  },
}
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit,
    gameVersion: null,
    generatedAt: '2026-09-12',
    weightStatus: 'unknown',
    sources: [source],
    excludedBases: [],
  },
  bases: [],
  modifiers: [
    {
      id: 'test',
      kind: 'prefix',
      name: 'Test',
      group: 'Test',
      level: 90,
      lines: ['+(10-20) to maximum Mana'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 0 }],
      tradeHashes: {},
    },
  ],
  essences: [essence],
}
const base: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
  type: 'Focus',
  tags: ['focus'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}

describe('精华目录与查询', () => {
  it('保留来源值和保证映射，不依据普通生成池或等级过滤', () => {
    expect(parseCraftCatalog(catalog)).toBe(catalog)
    expect(inspectEssences(catalog, base)).toEqual([
      {
        essence,
        category: 'Focus',
        modId: 'test',
        mod: catalog.modifiers[0],
      },
    ])
    expect(inspectEssences(catalog, base)[0]?.essence.tierLevel).toBe(72)
  })

  it('保持小圆盾和战杖类别独立，不退回盾与法杖映射', () => {
    const buckler = { ...base, type: 'Shield', subType: 'Evasion', tags: ['shield', 'buckler'] }
    const warstaff = { ...base, type: 'Staff', subType: 'Warstaff' }
    expect(essenceCategory(buckler)).toBe('Buckler')
    expect(essenceCategory(warstaff)).toBe('Warstaff')
    expect(inspectEssences(catalog, buckler)[0]?.modId).toBe('buckler')
    expect(inspectEssences(catalog, warstaff)[0]?.modId).toBe('warstaff')
    const noSubtypes = {
      ...catalog,
      essences: [{ ...essence, mods: { Shield: 'shield', Staff: 'staff' } }],
    }
    expect(inspectEssences(noSubtypes, buckler)).toEqual([])
    expect(inspectEssences(noSubtypes, warstaff)).toEqual([])
    expect(
      essenceCategory({ ...base, type: 'Shield', subType: 'Armour/Evasion', tags: ['shield'] }),
    ).toBe('Shield')
  })

  it('未解析ID原样保留，旧目录和无类别映射返回空列表', () => {
    const unresolved = { ...catalog, essences: [{ ...essence, mods: { Focus: 'DisplayUnknown' } }] }
    expect(parseCraftCatalog(unresolved)).toBe(unresolved)
    expect(inspectEssences(unresolved, base)[0]).toMatchObject({
      modId: 'DisplayUnknown',
      mod: null,
    })
    const { essences: _, ...legacy } = catalog
    expect(parseCraftCatalog(legacy)).toBe(legacy)
    expect(inspectEssences(legacy, base)).toEqual([])
    expect(inspectEssences(catalog, { ...base, type: 'Charm' })).toEqual([])
  })

  it('保留源中空类别声明，不伪造适用类别', () => {
    const empty = { ...catalog, essences: [{ ...essence, mods: {} }] }
    expect(parseCraftCatalog(empty)).toBe(empty)
    expect(inspectEssences(empty, base)).toEqual([])
  })

  it('拒绝损坏、未知字段、重复材料及空映射值', () => {
    for (const essences of [null, {}, [], [essence, essence], Array(1001).fill(essence)]) {
      expect(() => parseCraftCatalog({ ...catalog, essences })).toThrow()
    }
    for (const changes of [
      { id: 'wrong' },
      { id: 'Metadata/Items/Currency/' },
      { name: '' },
      { type: ' ' },
      { tierLevel: -1 },
      { tierLevel: 1.5 },
      { tierLevel: Number.NaN },
      { tierLevel: Number.MAX_SAFE_INTEGER + 1 },
      { tierLevel: '72' },
      { mods: [] },
      { mods: { Focus: '' } },
      { mods: { '': 'test' } },
      { mods: { Focus: ['test'] } },
      { mods: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`type${i}`, 'test'])) },
      { futureEffect: true },
    ])
      expect(() =>
        parseCraftCatalog({ ...catalog, essences: [{ ...essence, ...changes }] }),
      ).toThrow()
  })

  it('精华目录必须有唯一对应固定提交的来源，来源缺失不能静默放行', () => {
    for (const sources of [
      [],
      [source, source],
      [{ ...source, sha256: 'bad' }],
      [{ ...source, url: source.url.replace(sourceCommit, 'c'.repeat(40)) }],
      [{ ...source, url: source.url.replace('raw.githubusercontent.com', 'example.com') }],
      [{ ...source, path: 'src/Data/ModItem.lua' }],
    ])
      expect(() =>
        parseCraftCatalog({ ...catalog, _meta: { ...catalog._meta, sources } }),
      ).toThrow()
  })
})
