import { describe, expect, it } from 'vitest'
import { normalizeDesecratedMods } from './craftDesecrated'
import { type LuaTable, parsePobModFile } from './restrictedLua'

function raw(patch: LuaTable = {}): LuaTable {
  return {
    '1': '+(1-5) to maximum Life',
    type: 'Prefix',
    affix: 'Synthetic',
    level: 1,
    group: 'SyntheticGroup',
    statOrder: { '1': 1 },
    weightKey: { '1': 'helmet', '2': 'default' },
    weightVal: { '1': 1, '2': 0 },
    modTags: { '1': 'unveiled_mod', '2': 'amanamu_mod' },
    tradeHashes: { '42': { '1': '+(1-5) to maximum Life' } },
    ...patch,
  }
}
describe('亵渎专属源规范化', () => {
  it('珠宝专属按正向资格分域，范围核心天赋补全并核验原文', () => {
    const jewel = raw({
      weightKey: { '1': 'strjewel', '2': 'default' },
      modTags: { '1': 'unveiled_mod' },
    })
    const radius = raw({
      nodeType: 2,
      weightKey: { '1': 'int_radius_jewel', '2': 'default' },
      modTags: { '1': 'unveiled_mod' },
      tradeHashes: {
        '42': { '1': 'Notable Passive Skills in Radius also grant +(1-5) to maximum Life' },
      },
    })
    const result = normalizeDesecratedMods({ jewel, radius })
    expect(result.excluded).toEqual([])
    expect(result.modifiers).toMatchObject([
      { id: 'jewel', jewelOnly: true, desecratedOnly: true },
      {
        id: 'radius',
        jewelOnly: true,
        radiusJewelOnly: true,
        desecratedOnly: true,
        lines: ['Notable Passive Skills in Radius also grant +(1-5) to maximum Life'],
      },
    ])
    for (const patch of [
      { nodeType: 2 },
      { modTags: { '1': 'unveiled_mod', '2': 'amanamu_mod' } },
      {
        weightKey: { '1': 'strjewel', '2': 'helmet', '3': 'default' },
        weightVal: { '1': 1, '2': 1, '3': 0 },
      },
    ])
      expect(() => normalizeDesecratedMods({ bad: { ...jewel, ...patch } })).toThrow()
    expect(() =>
      normalizeDesecratedMods({ bad: { ...radius, tradeHashes: jewel.tradeHashes } }),
    ).toThrow()
  })
  it('只采纳明确side、已揭示且三族唯一的记录，其余完整记录排除原因', () => {
    const { type: _, ...untyped } = raw()
    const source = {
      prefix: raw(),
      suffix: raw({ type: 'Suffix', modTags: { '1': 'unveiled_mod', '2': 'ulaman_mod' } }),
      untyped,
      unrevealed: raw({ modTags: { '1': 'amanamu_mod' } }),
      special: raw({
        modTags: { '1': 'unveiled_mod', '2': 'historic_abyss_jewel_1' },
        nodeType: 2,
      }),
    }
    const before = JSON.stringify(source)
    const result = normalizeDesecratedMods(source)
    expect(result.modifiers.map((mod) => [mod.id, mod.kind, mod.desecratedOnly])).toEqual([
      ['prefix', 'prefix', true],
      ['suffix', 'suffix', true],
    ])
    expect(result.modifiers[0]?.eligibility).toEqual([
      { tag: 'helmet', value: 1 },
      { tag: 'default', value: 0 },
    ])
    expect(result.excluded.map((entry) => entry.id)).toEqual(['untyped', 'unrevealed', 'special'])
    expect(result.excluded.every((entry) => entry.reason.length > 0)).toBe(true)
    expect(JSON.stringify(source)).toBe(before)
  })
  it('缺side或非三族同样严格核验字段，不把损坏数据归入excluded', () => {
    for (const patch of [
      { future: 1 },
      { type: 'Unknown' },
      { type: null },
      { level: 0 },
      { modTags: null },
      { modTags: { '2': 'amanamu_mod' } },
      { weightVal: { '1': 42, '2': 0 } },
      { nodeType: '2' },
      { nodeType: 3 },
      { tags: { '1': true } },
      { modTags: { '1': 'unveiled_mod', '2': 'amanamu_mod', '3': 'kurgal_mod' } },
      { modTags: { '1': 'unveiled_mod', '2': 'amanamu_mod', '3': 'amanamu_mod' } },
    ] as LuaTable[]) {
      expect(() => normalizeDesecratedMods({ bad: raw(patch) })).toThrow()
      const { type: _, ...untyped } = raw(patch)
      if (!Object.hasOwn(patch, 'type'))
        expect(() => normalizeDesecratedMods({ bad: untyped })).toThrow()
    }
    expect(() => normalizeDesecratedMods({ bad: raw({ nodeType: 2 }) })).toThrow()
    for (const value of [null, [], { bad: null }, { bad: 1 }])
      expect(() => normalizeDesecratedMods(value as never)).toThrow()
    expect(() => parsePobModFile('return { ["duplicate"] = {}, ["duplicate"] = {} }')).toThrow(
      /重复键/,
    )
  })
})
