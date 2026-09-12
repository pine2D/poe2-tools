import * as crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { normalizeBaseDeclarations } from './baseVariants'
import type { LuaTable } from './restrictedLua'

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof crypto>()
  return { ...original, createHash: vi.fn(original.createHash) }
})

const value: LuaTable = {
  type: 'Focus',
  tags: { default: true, focus: true },
  req: { level: 20, int: 30 },
  armour: { EnergyShield: 20 },
  implicit: '+(10-20)% to Fire Resistance',
}

function entry(index: number, changes: LuaTable = {}) {
  return {
    name: 'Demo Focus',
    value: { ...value, ...changes },
    sourcePath: 'src/Data/Bases/focus.lua',
    index,
  }
}

describe('同名基底行为变体', () => {
  it('单声明保留英文身份与名称，不增加变体信息', () => {
    const bases = normalizeBaseDeclarations([entry(0)])
    expect(bases).toHaveLength(1)
    expect(bases[0]).toMatchObject({ id: 'Demo Focus', name: 'Demo Focus' })
    expect(bases[0]).not.toHaveProperty('variant')
  })

  it.each([
    { implicit: '+(10-20)% to Cold Resistance' },
    { armour: { EnergyShield: 21 } },
    { tags: { default: true, focus: true, cold_implicit_skill: true } },
    { req: { level: 21, int: 30 } },
  ])('保留影响制作行为的字段差异 %j', (changes) => {
    const bases = normalizeBaseDeclarations([entry(0), entry(1, changes)])
    expect(bases).toHaveLength(2)
    expect(new Set(bases.map((base) => base.id)).size).toBe(2)
    for (const base of bases) {
      expect(base.id).toMatch(/^pob2:base:v1:[a-f0-9]{64}$/)
      expect(base.name).toBe('Demo Focus')
      expect(base.variant?.visibility).toBe('visible')
    }
  })

  it('隐藏镜像合并为一个行为变体且保留每条声明', () => {
    const bases = normalizeBaseDeclarations([entry(7, { hidden: true }), entry(2)])
    expect(bases).toHaveLength(1)
    expect(bases[0]).toMatchObject({
      hidden: false,
      variant: {
        visibility: 'mixed',
        declarations: [
          { sourcePath: 'src/Data/Bases/focus.lua', index: 2, hidden: false },
          { sourcePath: 'src/Data/Bases/focus.lua', index: 7, hidden: true },
        ],
      },
    })
  })

  it('完全相同的声明合并，全隐藏才标记隐藏', () => {
    const bases = normalizeBaseDeclarations([
      entry(0, { hidden: true }),
      entry(1, { hidden: true }),
    ])
    expect(bases).toHaveLength(1)
    expect(bases[0]?.hidden).toBe(true)
    expect(bases[0]?.variant?.visibility).toBe('hidden')
    expect(bases[0]?.variant?.declarations).toHaveLength(2)
  })

  it('声明和对象键重排不改变身份或输出顺序', () => {
    const other = entry(1, { armour: { EnergyShield: 30 } })
    const source = [entry(0), other]
    const reordered = [
      other,
      entry(0, { tags: { focus: true, default: true }, req: { int: 30, level: 20 } }),
    ]
    const normalized = normalizeBaseDeclarations(source)
    expect(normalized).toHaveLength(2)
    expect(normalizeBaseDeclarations(reordered)).toEqual(normalized)
  })

  it('数组次序保留，不能合并不同次序的固有属性标签', () => {
    const bases = normalizeBaseDeclarations([
      entry(0, { implicitModTypes: { '1': { '1': 'fire', '2': 'cold' } } }),
      entry(1, { implicitModTypes: { '1': { '1': 'cold', '2': 'fire' } } }),
    ])
    expect(bases).toHaveLength(2)
  })

  it('哈希碰撞时拒绝不同内容，不能覆盖或合并', () => {
    const hash = { update: () => hash, digest: () => 'same-hash' }
    const mock = vi
      .spyOn(crypto, 'createHash')
      .mockReturnValue(hash as unknown as ReturnType<typeof crypto.createHash>)
    try {
      expect(() =>
        normalizeBaseDeclarations([entry(0), entry(1, { implicit: 'different' })]),
      ).toThrow(/碰撞/)
    } finally {
      mock.mockRestore()
    }
  })
})
