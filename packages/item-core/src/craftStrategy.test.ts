import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { jewelFixture } from './jewelTestFixture'
import { catalog, state } from './partialTargetFixture'

const strategy: CraftStrategy = {
  maxSteps: 10,
  rules: [
    { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
    {
      conditions: [{ kind: 'rarity', value: 'normal' }],
      action: { kind: 'currency', currency: 'transmutation' },
    },
    {
      conditions: [{ kind: 'rarity', value: 'magic' }],
      action: { kind: 'currency', currency: 'regal' },
    },
    { conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'chaos' } },
  ],
}

it('按当前状态选择第一匹配规则，无目标不会误停止，次数到限不再开步骤', () => {
  expect(evaluateCraftStrategy(catalog(), state('normal'), strategy, 0)).toMatchObject({
    ok: true,
    value: { kind: 'action', ruleIndex: 1, action: { currency: 'transmutation' } },
  })
  expect(evaluateCraftStrategy(catalog(), state('magic', ['p1']), strategy, 1)).toMatchObject({
    ok: true,
    value: { kind: 'action', ruleIndex: 2 },
  })
  expect(evaluateCraftStrategy(catalog(), state('rare', ['p1', 's1']), strategy, 10)).toMatchObject(
    { ok: true, value: { kind: 'stop', reason: 'step-limit' } },
  )
  expect(evaluateCraftStrategy(catalog(), state('normal'), strategy, -1).ok).toBe(false)
})
it('数量、数值、固有与指定破裂共同参与目标条件', () => {
  const goals = { targetModIds: ['p1', 's1'], minimumTargetCount: 1 }
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), strategy, 1, goals),
  ).toMatchObject({ ok: true, value: { kind: 'stop', ruleIndex: 0 } })
  expect(
    evaluateCraftStrategy(catalog(), state('magic', ['p1']), strategy, 1, {
      ...goals,
      targetValues: [{ modId: 'p1', bounds: [{ index: 0, min: 8 }] }],
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action', ruleIndex: 2 } })
  expect(
    evaluateCraftStrategy(catalog(), state('rare', ['p1']), strategy, 1, {
      ...goals,
      targetFracturedModId: 'p1',
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action', ruleIndex: 3 } })
  const s = {
    ...state('rare', ['p1']),
    affixes: [{ modId: 'p1', lines: ['p1 5'], fractured: true as const }],
  }
  expect(
    evaluateCraftStrategy(catalog(), s, strategy, 1, { ...goals, targetFracturedModId: 'p1' }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  const source = catalog(undefined, { implicit: 'Implicit (1-10)' })
  expect(
    evaluateCraftStrategy(
      source,
      { ...state('magic', ['p1']), implicitLines: ['Implicit 2'] },
      strategy,
      1,
      { ...goals, targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }] },
    ),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
})
it('空位条件取当前稀有度容量，多个条件必须同时满足，无匹配保留明确状态', () => {
  const input: CraftStrategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [
          { kind: 'rarity', value: 'magic' },
          { kind: 'open-prefix', min: 1 },
        ],
        action: { kind: 'currency', currency: 'augmentation' },
      },
    ],
  }
  expect(evaluateCraftStrategy(catalog(), state('magic', ['s1']), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
  expect(evaluateCraftStrategy(catalog(), state('magic', ['p1']), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(evaluateCraftStrategy(catalog(), state('rare', ['s1']), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})
it('首条命中而操作非法时阻塞，不落入下一条；预兆依动作独立校验', () => {
  const input: CraftStrategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'exalted', omen: 'sinistral_exaltation' },
      },
      { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  }
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', ruleIndex: 0, message: expect.stringContaining('稀有') },
  })
  expect(
    evaluateCraftStrategy(catalog(), state('rare', ['p1', 'p2', 'p3']), input, 0),
  ).toMatchObject({ ok: true, value: { kind: 'blocked', ruleIndex: 0 } })
})
it('严格拒绝多余字段、重复条件、空列表、错误值和不兼容预兆', () => {
  expect(readCraftStrategy(strategy).ok).toBe(true)
  for (const bad of [
    null,
    { ...strategy, maxSteps: 0 },
    { ...strategy, maxSteps: 1001 },
    { ...strategy, rules: [] },
    { ...strategy, surprise: true },
    { ...strategy, rules: Array(13).fill(strategy.rules[0]) },
    ...[
      { conditions: [], action: { kind: 'stop' } },
      { conditions: [{ kind: 'always' }, { kind: 'always' }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'always', value: 1 }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'open-prefix', min: 0 }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'targets-met', value: 'true' }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'rarity', value: 'unique' }], action: { kind: 'stop' } },
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'transmutation', omen: 'whittling' },
      },
      {
        conditions: [{ kind: 'always' }],
        action: { kind: 'currency', currency: 'divine', omen: undefined },
      },
      { conditions: [{ kind: 'always' }], action: { kind: 'stop', currency: 'chaos' } },
    ].map((rule) => ({ maxSteps: 10, rules: [rule] })),
  ])
    expect(readCraftStrategy(bad).ok).toBe(false)
})

it('未揭示状态不能被已完成目标或普通动作跳过', () => {
  const source = boneCatalog()
  const pending = applyCraftStep(source, boneState(), {
    kind: 'desecrate',
    boneId: 'preserved_rib',
    affixKind: 'suffix',
  })
  if (!pending.ok) throw new Error(pending.error)
  expect(evaluateCraftStrategy(source, pending.value, strategy, 1)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', message: expect.stringContaining('先完成亵渎揭示') },
  })
})

it('普通珠宝稀有容量是两前两后，不能按普通装备给出第三个空位', () => {
  const { catalog, state } = jewelFixture()
  state.affixes = boneState(['prefix1', 'prefix2']).affixes
  const input: CraftStrategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'open-prefix', min: 1 }],
        action: { kind: 'currency', currency: 'exalted' },
      },
    ],
  }
  expect(evaluateCraftStrategy(catalog, state, input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  const first = input.rules[0]
  if (!first) throw new Error('缺少规则')
  first.conditions = [{ kind: 'open-suffix', min: 2 }]
  expect(evaluateCraftStrategy(catalog, state, input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
})
