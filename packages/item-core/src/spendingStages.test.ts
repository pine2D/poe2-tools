import { expect, it } from 'vitest'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type DefinitionCraftStrategy, definitionStrategyStageAt } from './definitionStrategy'
import { catalog, state } from './partialTargetFixture'
import { strategyStageAt } from './strategyStages'

const data = catalog()
const operations: CraftStep[] = [
  { currency: 'transmutation', modIds: ['p1'] },
  { currency: 'regal', modIds: ['s1'] },
  { currency: 'exalted', modIds: ['p2'] },
]
const states = [state('normal')]
for (const operation of operations) {
  const current = states.at(-1)
  if (!current) throw Error('缺少状态')
  const next = applyCraftStep(data, current, operation)
  if (!next.ok) throw Error(next.error)
  states.push(next.value)
}
const strategy: DefinitionCraftStrategy = {
  maxSteps: 10,
  flow: {
    stages: [
      { id: 'a', name: '制作' },
      { id: 'b', name: '到价' },
      { id: 'c', name: '收尾' },
    ],
    entryStageId: 'a',
  },
  rules: [
    {
      stageId: 'a',
      conditions: [{ kind: 'spent-cost', unit: 'divine', min: 0.2 }],
      action: { kind: 'jump' },
      nextStageId: 'b',
    },
    {
      stageId: 'a',
      conditions: [{ kind: 'rarity', value: 'normal' }],
      action: { kind: 'currency', currency: 'transmutation' },
    },
    {
      stageId: 'a',
      conditions: [{ kind: 'rarity', value: 'magic' }],
      action: { kind: 'currency', currency: 'regal' },
    },
    {
      stageId: 'b',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'exalted' },
      nextStageId: 'c',
    },
    { stageId: 'c', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
  ],
}
const pricing = {
  unit: 'divine' as const,
  prices: { 'currency:transmutation': 0.1, 'currency:regal': 0.1, 'currency:exalted': 1 },
}
it('历史费用未知不能被当前稀有度短路而绕过阶段停止', () => {
  const flow: DefinitionCraftStrategy = {
    maxSteps: 10,
    flow: {
      entryStageId: 'a',
      stages: [
        { id: 'a', name: '制作' },
        { id: 'b', name: '停止' },
      ],
    },
    rules: [
      {
        stageId: 'a',
        conditions: [
          { kind: 'rarity', value: 'normal' },
          { kind: 'spent-cost', unit: 'divine', min: 0 },
        ],
        action: { kind: 'currency', currency: 'transmutation' },
        nextStageId: 'b',
      },
      {
        stageId: 'a',
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'augmentation' },
      },
      { stageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  }
  const run = (unit: 'divine' | 'chaos') =>
    definitionStrategyStageAt(
      data,
      states.slice(0, 2),
      operations.slice(0, 1),
      flow,
      0,
      1,
      { definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] } },
      { unit, prices: { 'currency:transmutation': 1 } },
    )
  expect(run('divine')).toEqual({ ok: true, value: 'b' })
  expect(run('chaos')).toMatchObject({ ok: false, error: expect.stringContaining('阶段') })
})
it('阶段使用每个历史位置的累计前缀，重新起阶段不清零材料费用，改价重新回放', () => {
  const definitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
  for (const [cursor, stage] of [
    [0, 'a'],
    [1, 'a'],
    [2, 'a'],
    [3, 'c'],
  ] as const) {
    expect(
      definitionStrategyStageAt(
        data,
        states,
        operations,
        strategy,
        0,
        cursor,
        { definitions },
        pricing,
      ),
    ).toEqual({ ok: true, value: stage })
  }
  expect(
    definitionStrategyStageAt(data, states, operations, strategy, 2, 3, { definitions }, pricing),
  ).toEqual({ ok: true, value: 'c' })
  expect(
    definitionStrategyStageAt(
      data,
      states,
      operations,
      strategy,
      0,
      3,
      { definitions },
      { ...pricing, prices: { 'currency:transmutation': 0.01, 'currency:regal': 0.01 } },
    ),
  ).toEqual({ ok: true, value: 'a' })
  const plain = {
    ...strategy,
    rules: strategy.rules.map((rule) => ({
      ...rule,
      conditions: rule.conditions as import('./craftStrategy').CraftStrategyCondition[],
    })),
  }
  expect(strategyStageAt(data, states, operations, plain, 0, 3, {}, pricing)).toEqual({
    ok: true,
    value: 'c',
  })
})
