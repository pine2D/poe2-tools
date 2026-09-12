import { describe, expect, it } from 'vitest'
import { normalizeAugments } from './craftAugments'
import { parsePobModFile } from './restrictedLua'

const raw = {
  type: 'Rune',
  localMod: false,
  '1': '+14% to Fire Resistance',
  statOrder: { '1': 14.1 },
  tradeHashes: { '42': { '1': 'First line', '2': 'Second line' } },
  levelReq: 0,
}

describe('PoB2 镶嵌声明适配器', () => {
  it('类别保留独立身份和全部限制字段，效果与 Bonded 不相加', () => {
    const full = {
      ...raw,
      limit: 1,
      limitId: 'AncientAugment',
      isSocketBound: false,
      canSocketInChakraSlots: true,
      canSocketInUniqueItems: false,
      canSocketInJewellery: true,
      canSocketInCorruptedSanctified: false,
      bonded: { '1': 'Bonded effect', statOrder: { '1': 1.2 } },
    }
    const source = { 'Test Rune': { armour: full, weapon: raw } }
    const before = structuredClone(source)
    const augments = normalizeAugments(source)
    expect(source).toEqual(before)
    expect(augments).toHaveLength(2)
    expect(augments[0]).toEqual({
      id: 'pob2:augment:["Test Rune","armour"]',
      name: 'Test Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+14% to Fire Resistance'],
      statOrder: [14.1],
      tradeHashes: { '42': ['First line', 'Second line'] },
      levelReq: 0,
      limit: 1,
      limitId: 'AncientAugment',
      isSocketBound: false,
      canSocketInChakraSlots: true,
      canSocketInUniqueItems: false,
      canSocketInJewellery: true,
      canSocketInCorruptedSanctified: false,
      bonded: { lines: ['Bonded effect'], statOrder: [1.2] },
    })
    expect(augments[1]?.id).toBe('pob2:augment:["Test Rune","weapon"]')
    expect(augments[1]).not.toHaveProperty('canSocketInUniqueItems')
    expect(augments[1]).not.toHaveProperty('bonded')
  })

  it('组合名称与类别用 JSON 元组区分，并复用受限 Lua 声明解析', () => {
    const source = parsePobModFile(`return {
      ["A/B"] = { ["C"] = {type="Rune",localMod=true,"Effect",statOrder={1.5},tradeHashes={},levelReq=0}},
      ["A"] = { ["B/C"] = {type="Idol",localMod=false,"Other",statOrder={2},tradeHashes={},levelReq=50}}
    }`)
    expect(normalizeAugments(source).map((entry) => entry.id)).toEqual([
      'pob2:augment:["A/B","C"]',
      'pob2:augment:["A","B/C"]',
    ])
  })

  it('仅有 Bonded 的来源可缺少普通 statOrder，空贸易文本原样保留', () => {
    const parsed = parsePobModFile(`return {
      ["Test Idol"] = { ["buckler"] = {
        type="Idol", localMod=false, tradeHashes={ [42]={""} }, levelReq=50,
        bonded={"Bonded effect",statOrder={1}}
      }}
    }`)
    expect(normalizeAugments(parsed)[0]).toMatchObject({
      lines: [],
      statOrder: [],
      tradeHashes: { '42': [''] },
      bonded: { lines: ['Bonded effect'], statOrder: [1] },
    })
    expect(() =>
      normalizeAugments({
        Test: {
          armour: {
            type: 'Rune',
            localMod: false,
            '1': 'Effect',
            tradeHashes: {},
            levelReq: 0,
          },
        },
      }),
    ).toThrow()
  })

  it('拒绝未适配字段和畸形声明，不能丢掉限制继续构建', () => {
    for (const fields of [
      { futureRule: true },
      { type: 'FutureAugment' },
      { localMod: 'false' },
      { levelReq: -1 },
      { levelReq: 1.5 },
      { limit: 0 },
      { limitId: '' },
      { isSocketBound: 'true' },
      { canSocketInJewellery: null },
      { '3': 'Hole in lines' },
      { statOrder: {} },
      { statOrder: { '1': Number.NaN } },
      { tradeHashes: { bad: { '1': 'effect' } } },
      { tradeHashes: { '42': { '2': 'hole' } } },
      { bonded: { '1': 'effect', statOrder: {} } },
      { bonded: { '1': 'effect', statOrder: { '1': 1 }, futureRule: true } },
    ]) {
      expect(() => normalizeAugments({ Test: { armour: { ...raw, ...fields } } })).toThrow()
    }
    expect(() => normalizeAugments({ Test: {} })).toThrow()
    expect(() => normalizeAugments({ Test: { armour: null } })).toThrow()
  })
})
