import { describe, expect, it } from 'vitest'
import { normalizeBase, normalizeMod } from './craftCatalog'

const raw = {
  type: 'Prefix',
  affix: 'Testing',
  '1': '+(10-20) to maximum Life',
  level: 5,
  group: 'Life',
  statOrder: { '1': 12.1 },
  weightKey: { '1': 'focus', '2': 'default' },
  weightVal: { '1': 1, '2': 0 },
  modTags: { '1': 'life' },
  tags: { '1': 'no_other' },
  tradeHashes: { '42': { '1': 'First line', '2': 'Second line' } },
}

describe('PoB2 制作目录归一化', () => {
  it('保留生成身份、标签顺序、一个hash多行和附加标签，不生成概率或tier', () => {
    const mod = normalizeMod('Demo', raw)
    expect(mod.id).toBe('Demo')
    expect(mod.tradeHashes['42']).toEqual(['First line', 'Second line'])
    expect(mod.eligibility).toEqual([
      { tag: 'focus', value: 1 },
      { tag: 'default', value: 0 },
    ])
    expect(mod.addsTags).toEqual(['no_other'])
    expect(mod).not.toHaveProperty('tier')
    expect(mod).not.toHaveProperty('weight')
  })
  it('资格字段不匹配、新语义字段和非二元值必须报错，不能静默改变池', () => {
    expect(() => normalizeMod('Demo', { ...raw, weightVal: { '1': 1 } })).toThrow()
    expect(() => normalizeMod('Demo', { ...raw, futureRule: true })).toThrow()
    expect(() => normalizeMod('Demo', { ...raw, weightVal: { '1': 100, '2': 0 } })).toThrow()
  })
  it('独立保留仅结界的基底、隐藏与符文锻造标签，不把源预设品质作为物品品质', () => {
    const base = normalizeBase('Test Ward', {
      type: 'Focus',
      tags: { default: true, focus: true, runeforged: true },
      req: {},
      armour: { Ward: 30 },
      quality: 20,
      socketLimit: 3,
      implicitModTypes: {},
      hidden: true,
    })
    expect(base.name).toBe('Test Ward')
    expect(base.properties).toEqual({ Ward: 30 })
    expect(base.requirements).toEqual({})
    expect(base.hidden).toBe(true)
    expect(base.runeforged).toBe(true)
    expect(base).not.toHaveProperty('quality')
  })
})
