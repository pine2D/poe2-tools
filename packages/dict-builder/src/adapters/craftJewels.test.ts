import type { CatalogLiquidEmotion } from '@poe2-tools/item-core'
import { expect, it } from 'vitest'
import { normalizeJewelMods } from './craftJewels'
import { parsePobModFile } from './restrictedLua'

const source = (extra = '', keys = '"intjewel", "jewel"', values = '1, 0') =>
  parsePobModFile(`return {
 ["sample"] = {type="Prefix",affix="Sample",level=1,group="Sample", "Value (1-10)",statOrder={1},weightKey={${keys}},weightVal={${values}},modTags={},tradeHashes={},${extra}}
}`)
it('普通珠宝保留资格顺序和来源标记，补零兜底不开放其他装备', () => {
  expect(normalizeJewelMods(source())).toMatchObject({
    modifiers: [
      {
        id: 'sample',
        jewelOnly: true,
        eligibility: [
          { tag: 'intjewel', value: 1 },
          { tag: 'jewel', value: 0 },
          { tag: 'default', value: 0 },
        ],
      },
    ],
    excluded: [],
  })
})
it('范围珠宝与无生成资格记录保留明确排除审计', () => {
  expect(normalizeJewelMods(source('nodeType=2,', '"int_radius_jewel", "jewel"'))).toMatchObject({
    modifiers: [],
    excluded: [{ id: 'sample', reason: expect.any(String) }],
  })
  expect(normalizeJewelMods(source('', '"jewel"', '0')).excluded).toHaveLength(1)
})
it('拒绝异常兜底、未知字段及普通珠宝携带范围节点语义', () => {
  for (const raw of [
    source('', '"intjewel", "jewel"', '1, 1'),
    source('future=true,'),
    source('nodeType=2,'),
    source('', '"default"', '1'),
  ])
    expect(() => normalizeJewelMods(raw)).toThrow()
})

const emotion = (radiusJewel = false): CatalogLiquidEmotion => ({
  id: 'Metadata/Items/Currency/DistilledEmotion11',
  name: '合成材料',
  radiusJewel,
  tierLevel: 3,
  mods: { Ruby: { prefix: 'sample' }, Sapphire: {}, Emerald: {}, Diamond: {} },
})

it('仅精确非范围材料引用的无节点全零资格声明进入工艺子域', () => {
  const raw = source('', '"jewel"', '0')
  const before = structuredClone(raw)
  expect(normalizeJewelMods(raw, [emotion()])).toMatchObject({
    modifiers: [{ id: 'sample', jewelOnly: true, craftedOnly: true }],
    excluded: [],
  })
  expect(raw).toEqual(before)
  // 范围材料可复用同一无节点工艺声明，不因此取得执行资格。
  expect(normalizeJewelMods(raw, [emotion(), emotion(true)]).modifiers).toHaveLength(1)
  expect(normalizeJewelMods(raw, [emotion(true)]).excluded).toHaveLength(1)
  expect(normalizeJewelMods(source(), [emotion()]).modifiers[0]).not.toHaveProperty('craftedOnly')
})

it('工艺映射侧别、来源节点及非普通正向资格不一致时拒绝', () => {
  const wrongSide = emotion()
  wrongSide.mods.Ruby = { suffix: 'sample' }
  for (const [raw, emotions] of [
    [source('', '"jewel"', '0'), [wrongSide]],
    [source('nodeType=1,', '"jewel"', '0'), [emotion()]],
    [source('', '"special", "jewel"', '1, 0'), [emotion()]],
    [{}, [emotion()]],
  ] as const)
    expect(() => normalizeJewelMods(raw, emotions)).toThrow()
})
