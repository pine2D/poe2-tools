import { expect, it } from 'vitest'
import { catalog } from './partialTargetFixture'
import { readStrategySpending } from './strategySpending'

const data = catalog()
const operations = [
  { currency: 'exalted' as const, modIds: ['p1'] },
  { currency: 'exalted' as const, modIds: ['s1'] },
  { currency: 'divine' as const, modIds: [], rolls: [] },
]
const pricing = {
  unit: 'divine' as const,
  baseCost: 100,
  prices: { 'currency:exalted': 0.1, 'currency:divine': 2 },
}
it('缺价材料使用独立国服译名，同译名保留原名区分，未知译名不猜填', () => {
  const context = {
    operations: [
      {
        currency: 'exalted' as const,
        modIds: ['p1', 'p2'],
        omen: 'greater_sinistral_exaltation' as const,
      },
    ],
    pricing: { unit: 'divine' as const, prices: { 'currency:exalted': 0 } },
  }
  const translated = {
    ...data,
    localizedNames: {
      'zh-CN': {
        'Omen of Greater Exaltation': '合成同名预兆',
        'Omen of Sinistral Exaltation': '合成同名预兆',
      },
      'zh-TW': {},
    },
  }
  const result = readStrategySpending(translated, context, 1, 'divine')
  expect(result).toMatchObject({
    ok: false,
    error: expect.stringContaining('合成同名预兆（Omen of Greater Exaltation）'),
  })
  expect(result).toMatchObject({
    ok: false,
    error: expect.stringContaining('合成同名预兆（Omen of Sinistral Exaltation）'),
  })
  expect(readStrategySpending(data, context, 1, 'divine')).toMatchObject({
    ok: false,
    error:
      '已用材料缺少报价：Omen of Greater Exaltation、Omen of Sinistral Exaltation；无法判断费用条件。',
  })
})
it('仅累计游标前实际材料，排除起点、未来且小数精确', () => {
  for (const [cursor, value] of [
    [0, 0],
    [1, 0.1],
    [2, 0.2],
    [3, 2.2],
  ] as const) {
    expect(readStrategySpending(data, { operations, pricing }, cursor, 'divine')).toEqual({
      ok: true,
      value,
    })
  }
})
it('缺价和单位不同明确失败；零价不是未知', () => {
  expect(readStrategySpending(data, undefined, 0, 'divine')).toMatchObject({ ok: false })
  expect(readStrategySpending(data, { operations }, 1, 'divine')).toMatchObject({ ok: false })
  expect(readStrategySpending(data, { operations, pricing }, 1, 'chaos')).toMatchObject({
    ok: false,
  })
  expect(
    readStrategySpending(data, { operations, pricing: { ...pricing, prices: {} } }, 1, 'divine'),
  ).toMatchObject({ ok: false, error: expect.stringContaining('崇高石') })
  expect(
    readStrategySpending(
      data,
      { operations, pricing: { ...pricing, prices: { 'currency:exalted': 0 } } },
      1,
      'divine',
    ),
  ).toEqual({ ok: true, value: 0 })
})
it('非法游标或报价不返回可用于预算判断的数字', () => {
  for (const cursor of [-1, 0.5, 4, Number.NaN]) {
    expect(readStrategySpending(data, { operations, pricing }, cursor, 'divine').ok).toBe(false)
  }
  expect(
    readStrategySpending(
      data,
      { operations, pricing: { ...pricing, prices: { 'currency:exalted': -1 } } },
      1,
      'divine',
    ).ok,
  ).toBe(false)
})
