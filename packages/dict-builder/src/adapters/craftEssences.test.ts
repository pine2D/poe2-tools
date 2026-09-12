import { describe, expect, it } from 'vitest'
import { normalizeEssences } from './craftEssences'
import { type LuaTable, parsePobModFile } from './restrictedLua'

const id = 'Metadata/Items/Currency/TestEssence'
const raw = { name: 'Test Essence', type: 'Test', tierLevel: 12, mods: { Staff: 'UnknownMod' } }

describe('PoB2 精华声明适配器', () => {
  it('保留原生身份、来源顺序和未知效果，不修改输入', () => {
    const source = { [id]: raw, [`${id}Two`]: { ...raw, mods: { Warstaff: 'OtherMod' } } }
    const before = structuredClone(source)
    expect(normalizeEssences(source)).toEqual([
      { id, ...raw },
      { id: `${id}Two`, ...raw, mods: { Warstaff: 'OtherMod' } },
    ])
    expect(source).toEqual(before)
  })

  it('接受原生空映射；受限 Lua 解析器拒绝重复身份和重复类别', () => {
    expect(normalizeEssences({ [id]: { ...raw, mods: {} } })[0]?.mods).toEqual({})
    expect(() => parsePobModFile(`return { ["${id}"]={}, ["${id}"]={} }`)).toThrow()
    expect(() => parsePobModFile('return { mods={ Staff="A", Staff="B" } }')).toThrow()
  })

  it('拒绝畸形、空值、未知字段和非原生 ID', () => {
    for (const fields of [
      { name: '' },
      { name: ' ' },
      { type: '' },
      { type: false },
      { tierLevel: -1 },
      { tierLevel: 1.5 },
      { tierLevel: Number.NaN },
      { tierLevel: Number.POSITIVE_INFINITY },
      { tierLevel: '12' },
      { mods: null },
      { mods: { Staff: '' } },
      { mods: { ' ': 'Mod' } },
      { mods: { Staff: 1 } },
      { futureRule: true },
      { '1': 'unknown' },
    ])
      expect(() => normalizeEssences({ [id]: { ...raw, ...fields } })).toThrow()
    for (const source of [{}, { Test: raw }, { 'Metadata/Items/Currency/': raw }, { [id]: null }])
      expect(() => normalizeEssences(source)).toThrow()
    expect(() => normalizeEssences([] as unknown as LuaTable)).toThrow()
    expect(() => normalizeEssences({ 'Metadata/Items/Currency/Test!': raw })).toThrow()
  })

  it('限制集合大小，避免异常数据无限扩张', () => {
    expect(() =>
      normalizeEssences(
        Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`${id}${i}`, raw])),
      ),
    ).toThrow()
    expect(() =>
      normalizeEssences({
        [id]: {
          ...raw,
          mods: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`Category${i}`, 'Mod'])),
        },
      }),
    ).toThrow()
  })
})
