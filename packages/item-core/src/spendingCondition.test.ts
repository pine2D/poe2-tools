import { expect, it } from 'vitest'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'
import type { CraftStrategySpending } from './strategySpending'

const data = catalog()
const condition = { kind: 'spent-cost' as const, unit: 'divine' as const, min: 0.2 }
const strategy: CraftStrategy = {
  maxSteps: 10,
  rules: [
    { conditions: [condition], action: { kind: 'stop' } },
    { conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'chaos' } },
  ],
}
const spending: CraftStrategySpending = {
  operations: [
    { currency: 'exalted', modIds: ['p1'] },
    { currency: 'exalted', modIds: ['s1'] },
  ],
  pricing: { unit: 'divine', prices: { 'currency:exalted': 0.1 } },
}
const run = (input: CraftStrategy, cursor: number, context?: CraftStrategySpending) =>
  evaluateCraftStrategy(data, state('rare', ['p1', 's1']), input, cursor, {}, undefined, context)
it('累计已用费用达标停止，撤销或改价重新判断，未来不计入', () => {
  expect(run(strategy, 1, spending)).toMatchObject({ ok: true, value: { kind: 'action' } })
  expect(run(strategy, 2, spending)).toMatchObject({
    ok: true,
    value: { kind: 'stop', reason: 'rule', ruleIndex: 0 },
  })
  expect(
    run(strategy, 2, {
      ...spending,
      pricing: { unit: 'divine', prices: { 'currency:exalted': 0.01 } },
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
})
it('缺价和单位不匹配暂停，取反不能绕过；逻辑已确定时可短路', () => {
  const not: CraftStrategy = {
    ...strategy,
    rules: [
      { conditions: [{ kind: 'not', condition }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'chaos' } },
    ],
  }
  for (const input of [strategy, not]) {
    expect(run(input, 1)).toMatchObject({
      ok: true,
      value: { kind: 'blocked', message: expect.stringContaining('历史') },
    })
    expect(run(input, 1, { ...spending, pricing: { unit: 'chaos', prices: {} } })).toMatchObject({
      ok: true,
      value: { kind: 'blocked', message: expect.stringContaining('单位') },
    })
  }
  const certain: CraftStrategy = {
    ...strategy,
    rules: [
      {
        conditions: [{ kind: 'any', conditions: [condition, { kind: 'always' }] }],
        action: { kind: 'stop' },
      },
    ],
  }
  expect(run(certain, 1)).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('费用范围拒绝负数、过高精度、倒置范围及非法单位，不改旧条件', () => {
  for (const patch of [
    { min: -1 },
    { min: 0.0000001 },
    { min: 2, max: 1 },
    { unit: 'gold' },
    { max: null },
  ]) {
    expect(
      readCraftStrategy({
        ...strategy,
        rules: [{ conditions: [{ ...condition, ...patch }], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
  }
  expect(readCraftStrategy(strategy).ok).toBe(true)
})
