import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'
import { operationMatchesStrategyAction, strategyStageAt } from './strategyStages'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('测试缺少声明')
  return value
}
const staged = (): CraftStrategy => ({
  maxSteps: 20,
  flow: {
    stages: [
      { id: 'prepare', name: '准备' },
      { id: 'finish', name: '收尾' },
    ],
    entryStageId: 'prepare',
  },
  rules: [
    {
      stageId: 'prepare',
      nextStageId: 'finish',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'transmutation' },
    },
    {
      stageId: 'finish',
      nextStageId: 'prepare',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'regal' },
    },
  ],
})
it('阶段只匹配所属规则，非法当前阶段拒绝，旧策略维持顺序', () => {
  expect(readCraftStrategy(staged())).toEqual({ ok: true, value: staged() })
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), staged(), 1, {}, 'finish'),
  ).toMatchObject({ ok: true, value: { kind: 'action', ruleIndex: 1 } })
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), staged(), 1, {}, 'missing').ok,
  ).toBe(false)
})
it('应用后前进、回连；逐游标与重启起点重算，不保存当前阶段', () => {
  const source = catalog(),
    states = [state('normal')]
  const operations: CraftStep[] = [
    { currency: 'transmutation', modIds: ['p1'] },
    { currency: 'regal', modIds: ['s1'] },
  ]
  for (const operation of operations) {
    const previous = states.at(-1)
    if (!previous) throw new Error('缺起点')
    const applied = applyCraftStep(source, previous, operation)
    if (!applied.ok) throw new Error(applied.error)
    states.push(applied.value)
  }
  for (const [cursor, stage] of ['prepare', 'finish', 'prepare'].entries())
    expect(strategyStageAt(source, states, operations, staged(), 0, cursor)).toEqual({
      ok: true,
      value: stage,
    })
  expect(strategyStageAt(source, states, operations, staged(), 2, 1)).toEqual({
    ok: true,
    value: 'prepare',
  })
  expect(strategyStageAt(source, states, operations, staged(), 0, 3)).toEqual({
    ok: false,
    error: expect.any(String),
  })
})
it('不同手动动作不推进，停止、预算和失联目标不推进', () => {
  const source = catalog(),
    start = state('normal'),
    operation = { currency: 'transmutation' as const, modIds: ['p1'] }
  const applied = applyCraftStep(source, start, operation)
  if (!applied.ok) throw new Error(applied.error)
  const states = [start, applied.value],
    strategy = staged()
  strategy.rules[0] = {
    stageId: 'prepare',
    conditions: [{ kind: 'always' }],
    action: { kind: 'stop' },
  }
  expect(strategyStageAt(source, states, [operation], strategy, 0, 1)).toMatchObject({
    ok: true,
    value: 'prepare',
  })
  const limit = staged()
  limit.maxSteps = 1
  expect(
    strategyStageAt(source, [start, start, applied.value], [operation, operation], limit, 1, 2),
  ).toMatchObject({ ok: true, value: 'prepare' })
  const stale = staged()
  required(stale.rules[0]).conditions = [
    { kind: 'selected-targets', modIds: ['p1'], min: 1, value: false },
  ]
  expect(strategyStageAt(source, states, [operation], stale, 0, 1)).toMatchObject({
    ok: true,
    value: 'prepare',
  })
})
it('操作身份核对档位、预兆、材料与孔位，揭示中间步骤不推进', () => {
  const s = state('normal')
  expect(
    operationMatchesStrategyAction(
      s,
      { kind: 'currency', currency: 'exalted' },
      { currency: 'exalted', modIds: ['p1'] },
    ),
  ).toBe(true)
  expect(
    operationMatchesStrategyAction(
      s,
      { kind: 'currency', currency: 'exalted' },
      { currency: 'exalted', omen: 'sinistral_exaltation', modIds: ['p1'] },
    ),
  ).toBe(false)
  expect(
    operationMatchesStrategyAction(
      s,
      { kind: 'reveal' },
      { kind: 'desecration-offer', modIds: ['p1', 'p2', 'p3'] },
    ),
  ).toBe(false)
  expect(
    operationMatchesStrategyAction(
      s,
      { kind: 'reveal' },
      { kind: 'desecration-reveal', modId: 'p1', values: [1] },
    ),
  ).toBe(true)
  const socket = { kind: 'socket' as const, augmentId: 'a', socketIndex: 'first-empty' as const }
  expect(
    operationMatchesStrategyAction({ ...s, sockets: ['b', null] }, socket, {
      kind: 'socket',
      augmentId: 'a',
      socketIndex: 1,
    }),
  ).toBe(true)
  expect(
    operationMatchesStrategyAction({ ...s, sockets: ['b', null] }, socket, {
      kind: 'socket',
      augmentId: 'a',
      socketIndex: 0,
    }),
  ).toBe(false)
})
it('拒绝阶段重复/未知引用/未声明归属/停止跳转，允许空阶段供编辑', () => {
  for (const mutate of [
    (s: CraftStrategy) => {
      required(required(s.flow).stages[1]).id = 'prepare'
    },
    (s: CraftStrategy) => {
      required(s.flow).entryStageId = 'missing'
    },
    (s: CraftStrategy) => {
      required(s.rules[0]).nextStageId = 'missing'
    },
    (s: CraftStrategy) => {
      delete required(s.rules[0]).stageId
    },
    (s: CraftStrategy) => {
      required(s.rules[0]).action = { kind: 'stop' }
    },
    (s: CraftStrategy) => {
      delete s.flow
    },
  ]) {
    const s = staged()
    mutate(s)
    expect(readCraftStrategy(s).ok).toBe(false)
  }
  const empty = staged()
  empty.rules.pop()
  expect(readCraftStrategy(empty).ok).toBe(true)
  expect(evaluateCraftStrategy(catalog(), state('normal'), empty, 0, {}, 'finish')).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})

it('骨骼施加与最终揭示推进，展示候选保留阶段，预兆材料身份必须一致', () => {
  const source = boneCatalog(),
    states = [boneState()]
  const strategy: CraftStrategy = {
    ...staged(),
    rules: [
      {
        stageId: 'prepare',
        nextStageId: 'finish',
        conditions: [{ kind: 'always' }],
        action: { kind: 'desecrate', boneId: 'preserved_rib' },
      },
      {
        stageId: 'finish',
        nextStageId: 'prepare',
        conditions: [{ kind: 'always' }],
        action: { kind: 'reveal' },
      },
    ],
  }
  const operations: CraftStep[] = [
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'suffix' },
    { kind: 'desecration-offer', modIds: ['exclusive1', 'exclusive2', 'exclusive3'] },
    { kind: 'desecration-reveal', modId: 'exclusive1', values: [7] },
  ]
  for (const operation of operations) {
    const applied = applyCraftStep(source, required(states.at(-1)), operation)
    if (!applied.ok) throw new Error(applied.error)
    states.push(applied.value)
  }
  for (const [cursor, stage] of ['prepare', 'finish', 'finish', 'prepare'].entries())
    expect(strategyStageAt(source, states, operations, strategy, 0, cursor)).toEqual({
      ok: true,
      value: stage,
    })
  expect(
    operationMatchesStrategyAction(
      required(states[0]),
      { kind: 'desecrate', boneId: 'preserved_rib' },
      { kind: 'desecrate', boneId: 'ancient_rib', affixKind: 'suffix' },
    ),
  ).toBe(false)
})
