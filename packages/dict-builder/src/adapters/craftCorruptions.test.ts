import { describe, expect, it } from 'vitest'
import { normalizeCorruptions } from './craftCorruptions'
import type { LuaTable } from './restrictedLua'

function raw(patch: LuaTable = {}): LuaTable {
  return {
    type: 'Corrupted',
    affix: '',
    level: 1,
    group: 'SyntheticGroup',
    '1': '(1-5)% increased Attack Speed',
    statOrder: { '1': 1 },
    weightKey: { '1': 'weapon', '2': 'default' },
    weightVal: { '1': 1, '2': 0 },
    modTags: { '1': 'attack', '2': 'speed' },
    tags: { '1': 'synthetic_added_tag' },
    tradeHashes: { '42': { '1': '(1-5)% increased Attack Speed' } },
    ...patch,
  }
}
describe('独立腐化目录声明', () => {
  it('保留普通/特殊域与空资格，顺序、动态标签和范围不被重写', () => {
    const input = {
      ordinary: raw(),
      ineligible: raw({ weightKey: {}, weightVal: {} }),
      special: raw({ type: 'SpecialCorrupted', weightKey: {}, weightVal: {} }),
    }
    const before = JSON.stringify(input)
    const result = normalizeCorruptions(input)
    expect(result.map((mod) => mod.kind)).toEqual(['corrupted', 'corrupted', 'special-corrupted'])
    expect(result[0]).toMatchObject({
      id: 'ordinary',
      eligibility: [
        { tag: 'weapon', value: 1 },
        { tag: 'default', value: 0 },
      ],
      addsTags: ['synthetic_added_tag'],
      lines: ['(1-5)% increased Attack Speed'],
    })
    expect(result[1]?.eligibility).toEqual([])
    expect(
      normalizeCorruptions({
        jewel: raw({ weightKey: { '1': 'jewel' }, weightVal: { '1': 1 } }),
      })[0]?.eligibility,
    ).toEqual([{ tag: 'jewel', value: 1 }])
    expect(JSON.stringify(input)).toBe(before)
  })
  it('资格数组不配对、未知字段、错误类型与伪造权重拒绝，不能伪装成前后缀', () => {
    for (const patch of [
      { type: 'Prefix' },
      { type: 'Suffix' },
      { type: null },
      { future: 1 },
      { weightKey: {} },
      { weightVal: { '1': 50, '2': 0 } },
      { level: 0 },
      { tags: { '1': true } },
      { statOrder: {} },
    ] as LuaTable[])
      expect(() => normalizeCorruptions({ bad: raw(patch) })).toThrow()
  })
})
