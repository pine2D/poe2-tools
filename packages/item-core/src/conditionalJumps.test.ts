import { expect, it } from 'vitest'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'
import { strategyStageAt } from './strategyStages'

const flow = (): CraftStrategy => ({
  maxSteps: 20,
  flow: {
    stages: [
      { id: 'a', name: '判断' },
      { id: 'b', name: '复核' },
      { id: 'c', name: '制作' },
    ],
    entryStageId: 'a',
  },
  rules: [
    { stageId: 'a', nextStageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'jump' } },
    { stageId: 'b', nextStageId: 'c', conditions: [{ kind: 'always' }], action: { kind: 'jump' } },
    {
      stageId: 'c',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'transmutation' },
    },
  ],
})
const route = [
  { ruleIndex: 0, from: 'a', to: 'b' },
  { ruleIndex: 1, from: 'b', to: 'c' },
]
it('无消费多跳展开为最终工作动作，并保留可解释路径', () => {
  expect(readCraftStrategy(flow())).toEqual({ ok: true, value: flow() })
  expect(evaluateCraftStrategy(catalog(), state('normal'), flow(), 0)).toEqual({
    ok: true,
    value: {
      kind: 'action',
      ruleIndex: 2,
      action: { kind: 'currency', currency: 'transmutation' },
      route,
    },
  })
})
it('停止、无匹配和非法工作动作保留路径，预算在展开前停止', () => {
  const input = flow()
  input.rules[2] = { stageId: 'c', conditions: [{ kind: 'always' }], action: { kind: 'stop' } }
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop', ruleIndex: 2, route },
  })
  input.rules.pop()
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toEqual({
    ok: true,
    value: { kind: 'unmatched', route },
  })
  expect(evaluateCraftStrategy(catalog(), state('rare'), flow(), 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', ruleIndex: 2, route },
  })
  expect(evaluateCraftStrategy(catalog(), state('normal'), flow(), 20)).toEqual({
    ok: true,
    value: { kind: 'stop', reason: 'step-limit' },
  })
})
it('自环和多阶段零消费循环被阻止，不修改装备或消耗操作步数', () => {
  for (const destination of ['a', 'b']) {
    const input = flow()
    input.rules[1] = {
      stageId: 'b',
      nextStageId: destination,
      conditions: [{ kind: 'always' }],
      action: { kind: 'jump' },
    }
    const result = evaluateCraftStrategy(catalog(), state('normal'), input, 0)
    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'blocked',
        message: expect.stringContaining('循环'),
        route: expect.any(Array),
      },
    })
  }
})
it('首条匹配优先，其他分支的循环不妨碍停止；失联目标先阻止', () => {
  const input = flow()
  input.rules.unshift({ stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } })
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toEqual({
    ok: true,
    value: { kind: 'stop', reason: 'rule', ruleIndex: 0 },
  })
  input.rules[0] = {
    stageId: 'a',
    conditions: [{ kind: 'selected-targets', modIds: ['p1'], min: 1, value: false }],
    action: { kind: 'stop' },
  }
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', message: expect.stringContaining('已移除') },
  })
})
it('匹配工作动作后无next时留在实际制作阶段，其他手动动作保留历史阶段', () => {
  const source = catalog(),
    initial = state('normal'),
    operation = { currency: 'transmutation' as const, modIds: ['p1'] }
  const applied = applyCraftStep(source, initial, operation)
  if (!applied.ok) throw new Error(applied.error)
  expect(strategyStageAt(source, [initial, applied.value], [operation], flow(), 0, 1)).toEqual({
    ok: true,
    value: 'c',
  })
  expect(strategyStageAt(source, [initial, applied.value], [operation], flow(), 0, 0)).toEqual({
    ok: true,
    value: 'a',
  })
  const different = flow()
  different.rules[2] = {
    stageId: 'c',
    conditions: [{ kind: 'always' }],
    action: { kind: 'currency', currency: 'alchemy' },
  }
  expect(strategyStageAt(source, [initial, applied.value], [operation], different, 0, 1)).toEqual({
    ok: true,
    value: 'a',
  })
})
it('jump必须在flow中并指定已有阶段，不能夹带制作参数', () => {
  const base = flow(),
    first = base.rules[0]
  if (!first) throw new Error('缺少规则')
  for (const nextStageId of [undefined, '', 'missing'])
    expect(readCraftStrategy({ ...base, rules: [{ ...first, nextStageId }] }).ok).toBe(false)
  expect(
    readCraftStrategy({
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'always' }], action: { kind: 'jump' } }],
    }).ok,
  ).toBe(false)
  expect(
    readCraftStrategy({
      ...base,
      rules: [{ ...first, action: { kind: 'jump', currency: 'divine' } }],
    }).ok,
  ).toBe(false)
})
