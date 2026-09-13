import { describe, expect, it } from 'vitest'
import { normalizeLiquidEmotions } from './craftLiquidEmotions'
import { type LuaTable, parsePobModFile } from './restrictedLua'

const id = 'Metadata/Items/Currency/DistilledEmotion1'
const raw: LuaTable = {
  name: 'Diluted Liquid Ire',
  radiusJewel: false,
  tierLevel: 1,
  mods: {
    Ruby: { Prefix: 'JewelArmour' },
    Sapphire: { Suffix: 'JewelEnergyShield' },
    Emerald: { Prefix: 'JewelEvasion', Suffix: 'JewelEvasionSuffix' },
    Diamond: {},
  },
}

describe('PoB2 液态情感声明适配器', () => {
  it('保留四类空映射、双侧效果和古老材料标记，不修改输入', () => {
    const ancientId = 'Metadata/Items/Currency/DistilledEmotionTimeLost1'
    const source = { [id]: raw, [ancientId]: { ...raw, radiusJewel: true } }
    const before = structuredClone(source)
    expect(normalizeLiquidEmotions(source)).toEqual([
      {
        id,
        name: 'Diluted Liquid Ire',
        radiusJewel: false,
        tierLevel: 1,
        mods: {
          Ruby: { prefix: 'JewelArmour' },
          Sapphire: { suffix: 'JewelEnergyShield' },
          Emerald: { prefix: 'JewelEvasion', suffix: 'JewelEvasionSuffix' },
          Diamond: {},
        },
      },
      expect.objectContaining({ id: ancientId, radiusJewel: true }),
    ])
    expect(source).toEqual(before)
  })

  it('接受受限 Lua 的真实形状并拒绝重复身份和重复侧', () => {
    const source = parsePobModFile(`return { ["${id}"] = {
      name="Test", radiusJewel=false, tierLevel=0,
      mods={Ruby={Prefix="A"},Sapphire={},Emerald={},Diamond={Suffix="B"}}
    } }`)
    expect(normalizeLiquidEmotions(source)[0]?.mods).toEqual({
      Ruby: { prefix: 'A' },
      Sapphire: {},
      Emerald: {},
      Diamond: { suffix: 'B' },
    })
    expect(() => parsePobModFile(`return { ["${id}"]={}, ["${id}"]={} }`)).toThrow()
    expect(() =>
      parsePobModFile(`return { ["${id}"]={mods={Ruby={Prefix="A",Prefix="B"}}} }`),
    ).toThrow()
  })

  it('拒绝未知字段、缺失或额外类别、非法侧和值', () => {
    const invalid = [
      { ...raw, futureRule: true },
      { ...raw, name: '' },
      { ...raw, radiusJewel: 0 },
      { ...raw, tierLevel: -1 },
      { ...raw, tierLevel: 1.5 },
      { ...raw, mods: { Ruby: {}, Sapphire: {}, Emerald: {} } },
      { ...raw, mods: { ...(raw.mods as LuaTable), Topaz: {} } },
      { ...raw, mods: { ...(raw.mods as LuaTable), Ruby: { Implicit: 'A' } } },
      { ...raw, mods: { ...(raw.mods as LuaTable), Ruby: { Prefix: '' } } },
      { ...raw, mods: { ...(raw.mods as LuaTable), Ruby: null } },
    ]
    for (const entry of invalid) expect(() => normalizeLiquidEmotions({ [id]: entry })).toThrow()
    for (const source of [{}, { Test: raw }, { 'Metadata/Items/Currency/': raw }, { [id]: null }])
      expect(() => normalizeLiquidEmotions(source)).toThrow()
  })
})
