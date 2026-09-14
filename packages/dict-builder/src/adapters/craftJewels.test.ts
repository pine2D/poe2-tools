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
it('没有完整交易模板的范围声明拒绝生成，无资格记录保留排除审计', () => {
  expect(() => normalizeJewelMods(source('nodeType=2,', '"int_radius_jewel", "jewel"'))).toThrow()
  expect(normalizeJewelMods(source('', '"jewel"', '0')).excluded).toHaveLength(1)
})

it.each([
  [1, 'Small Passive Skills in Radius also grant Value (1-10)'],
  [2, 'Notable Passive Skills in Radius also grant Value (1-10)'],
] as const)('范围节点类型 %s 保留完整来源语义和资格顺序', (nodeType, line) => {
  const raw = source(`nodeType=${nodeType},`, '"int_radius_jewel", "jewel"')
  const sample = raw.sample as Record<string, unknown>
  sample.tradeHashes = { '123': { 1: line } }
  const before = structuredClone(raw)
  expect(normalizeJewelMods(raw)).toMatchObject({
    modifiers: [
      {
        id: 'sample',
        jewelOnly: true,
        radiusJewelOnly: true,
        lines: [line],
        eligibility: [
          { tag: 'int_radius_jewel', value: 1 },
          { tag: 'jewel', value: 0 },
          { tag: 'default', value: 0 },
        ],
      },
    ],
    excluded: [],
  })
  expect(raw).toEqual(before)
  sample.tradeHashes = { '123': { 1: 'Value (1-10)' } }
  expect(() => normalizeJewelMods(raw)).toThrow()
})

it('半径升级原文不添加节点语义，普通与范围正向资格混合时拒绝', () => {
  const raw = source('', '"radius_jewel", "jewel"')
  const sample = raw.sample as Record<string, unknown>
  sample['1'] = 'Upgrades Radius to Large'
  sample.tradeHashes = { '123': { 1: 'Upgrades Radius to Large' } }
  expect(normalizeJewelMods(raw).modifiers[0]).toMatchObject({
    radiusJewelOnly: true,
    lines: ['Upgrades Radius to Large'],
  })
  expect(() =>
    normalizeJewelMods(source('', '"intjewel", "int_radius_jewel", "jewel"', '1, 1, 0')),
  ).toThrow()
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

it('精确材料引用的无节点全零资格声明进入工艺子域并保留范围身份', () => {
  const raw = source('', '"jewel"', '0')
  ;(raw.sample as Record<string, unknown>).tradeHashes = { '123': { 1: 'Value (1-10)' } }
  const before = structuredClone(raw)
  expect(normalizeJewelMods(raw, [emotion()])).toMatchObject({
    modifiers: [{ id: 'sample', jewelOnly: true, craftedOnly: true }],
    excluded: [],
  })
  expect(raw).toEqual(before)
  // 范围材料可复用同一无节点工艺声明，不因此取得执行资格。
  expect(normalizeJewelMods(raw, [emotion(), emotion(true)]).modifiers).toHaveLength(1)
  expect(normalizeJewelMods(raw, [emotion(true)])).toMatchObject({
    modifiers: [{ id: 'sample', jewelOnly: true, craftedOnly: true, radiusJewelOnly: true }],
    excluded: [],
  })
  expect(normalizeJewelMods(source(), [emotion()]).modifiers[0]).not.toHaveProperty('craftedOnly')
})

it('范围专属工艺保留核心天赋语义，缺失对应或出现无关正向资格时拒绝', () => {
  const raw = source('nodeType=2,', '"jewel"', '0')
  const sample = raw.sample as Record<string, unknown>
  sample.tradeHashes = { '123': { 1: 'Notable Passive Skills in Radius also grant Value (1-10)' } }
  expect(normalizeJewelMods(raw, [emotion(true)]).modifiers[0]).toMatchObject({
    craftedOnly: true,
    radiusJewelOnly: true,
    lines: ['Notable Passive Skills in Radius also grant Value (1-10)'],
  })
  sample.tradeHashes = {}
  expect(() => normalizeJewelMods(raw, [emotion(true)])).toThrow()
  expect(() =>
    normalizeJewelMods(source('', '"special", "jewel"', '1, 0'), [emotion(true)]),
  ).toThrow()
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
