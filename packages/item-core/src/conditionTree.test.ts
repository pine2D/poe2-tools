import { expect, it } from 'vitest'
import {
  type CraftStrategy,
  type CraftStrategyCondition,
  evaluateCraftStrategy,
  readCraftStrategy,
} from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

const strategy = (condition: CraftStrategyCondition): CraftStrategy => ({
  maxSteps: 10,
  rules: [{ conditions: [condition], action: { kind: 'stop' } }],
})
const decide = (
  condition: CraftStrategyCondition,
  rarity: 'normal' | 'magic' | 'rare' = 'normal',
) => evaluateCraftStrategy(catalog(), state(rarity), strategy(condition), 0)

it('任一与取反嵌套表达混合条件，同类型叶子可并存', () => {
  const condition: CraftStrategyCondition = {
    kind: 'all',
    conditions: [
      {
        kind: 'any',
        conditions: [
          { kind: 'rarity', value: 'normal' },
          { kind: 'rarity', value: 'magic' },
        ],
      },
      { kind: 'not', condition: { kind: 'targets-met', value: true } },
    ],
  }
  for (const rarity of ['normal', 'magic'] as const)
    expect(decide(condition, rarity)).toMatchObject({
      ok: true,
      value: { kind: 'stop', reason: 'rule' },
    })
  expect(decide(condition, 'rare')).toEqual({ ok: true, value: { kind: 'unmatched' } })
})
it('未知孔位不能通过取反变真，all/any采用确定真值传播', () => {
  const unknown: CraftStrategyCondition = {
    kind: 'not',
    condition: { kind: 'open-sockets', min: 1, max: 3 },
  }
  expect(decide(unknown)).toEqual({ ok: true, value: { kind: 'unmatched' } })
  expect(decide({ kind: 'any', conditions: [unknown, { kind: 'always' }] })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(
    decide({
      kind: 'not',
      condition: { kind: 'all', conditions: [unknown, { kind: 'rarity', value: 'rare' }] },
    }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(
    decide({
      kind: 'not',
      condition: { kind: 'any', conditions: [unknown, { kind: 'rarity', value: 'rare' }] },
    }),
  ).toEqual({ ok: true, value: { kind: 'unmatched' } })
  const s = state('normal')
  s.sockets = []
  expect(evaluateCraftStrategy(catalog(), s, strategy(unknown), 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
})
it('深层目标仍分析，短路与取反不能绕过失联引用，全局预算先于条件', () => {
  const condition: CraftStrategyCondition = {
    kind: 'any',
    conditions: [
      { kind: 'always' },
      { kind: 'not', condition: { kind: 'selected-targets', modIds: ['p1'], min: 1, value: true } },
    ],
  }
  expect(decide(condition)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', message: expect.stringContaining('已移除') },
  })
  expect(evaluateCraftStrategy(catalog(), state('normal'), strategy(condition), 10)).toMatchObject({
    ok: true,
    value: { kind: 'stop', reason: 'step-limit' },
  })
  const tree: CraftStrategyCondition = {
    kind: 'not',
    condition: { kind: 'selected-targets', modIds: ['p1'], min: 1, value: false },
  }
  const s = state('rare', ['p1'])
  expect(
    evaluateCraftStrategy(catalog(), s, strategy(tree), 0, { targetModIds: ['p1'] }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('深度、节点、子数、字段与循环输入有明确界限，旧根重复仍拒绝', () => {
  let nested: CraftStrategyCondition = { kind: 'always' }
  for (let n = 0; n < 4; n++) nested = { kind: 'not', condition: nested }
  expect(readCraftStrategy(strategy(nested)).ok).toBe(true)
  expect(readCraftStrategy(strategy({ kind: 'not', condition: nested })).ok).toBe(false)
  const group: CraftStrategyCondition = {
    kind: 'all',
    conditions: Array.from({ length: 4 }, () => ({ kind: 'always' })),
  }
  const branch: CraftStrategyCondition = {
    kind: 'all',
    conditions: [group, group, group, { kind: 'always' }],
  }
  const p = strategy(branch)
  const rule = p.rules[0]
  if (!rule) throw Error('缺规则')
  rule.conditions = [branch, branch]
  expect(readCraftStrategy(p).ok).toBe(false)
  rule.conditions = [
    branch,
    { kind: 'all', conditions: [group, group, { kind: 'always' }, { kind: 'always' }] },
  ]
  expect(readCraftStrategy(p).ok).toBe(true)
  const sixteen: CraftStrategyCondition = {
    kind: 'all',
    conditions: [
      group,
      group,
      { kind: 'any', conditions: [{ kind: 'always' }, { kind: 'always' }, { kind: 'always' }] },
      { kind: 'always' },
    ],
  }
  rule.conditions = [sixteen, sixteen]
  expect(readCraftStrategy(p).ok).toBe(true)
  rule.conditions.push({ kind: 'rarity', value: 'rare' })
  expect(readCraftStrategy(p).ok).toBe(false)
  for (const condition of [
    { kind: 'any', conditions: [] },
    { kind: 'all', conditions: Array(5).fill({ kind: 'always' }) },
    { kind: 'not', conditions: [{ kind: 'always' }] },
    { kind: 'any', conditions: [{ kind: 'always' }], extra: 1 },
  ])
    expect(
      readCraftStrategy({
        maxSteps: 10,
        rules: [{ conditions: [condition], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
  const cycle: Record<string, unknown> = { kind: 'not' }
  cycle.condition = cycle
  expect(
    readCraftStrategy({ maxSteps: 10, rules: [{ conditions: [cycle], action: { kind: 'stop' } }] })
      .ok,
  ).toBe(false)
  expect(
    readCraftStrategy({
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' }, { kind: 'always' }], action: { kind: 'stop' } }],
    }).ok,
  ).toBe(false)
})

it('稀疏数组的空位必须拒绝，不能被all视作空真值', () => {
  for (const conditions of [
    Array(1),
    [{ kind: 'all', conditions: Array(1) }],
    [{ kind: 'any', conditions: Object.assign(Array(2), { 0: { kind: 'always' } }) }],
  ])
    expect(
      readCraftStrategy({ maxSteps: 10, rules: [{ conditions, action: { kind: 'stop' } }] }).ok,
    ).toBe(false)
})
