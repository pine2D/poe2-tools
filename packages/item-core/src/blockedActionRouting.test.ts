import { expect, it } from 'vitest'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { catalog, state } from './partialTargetFixture'

const strategy = (): CraftStrategy => ({
  maxSteps: 10,
  flow: {
    entryStageId: 'a',
    stages: [
      { id: 'a', name: '升稀有' },
      { id: 'b', name: '准备' },
    ],
  },
  rules: [
    {
      stageId: 'a',
      onBlockedStageId: 'b',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'regal' },
    },
    {
      stageId: 'b',
      nextStageId: 'a',
      conditions: [{ kind: 'always' }],
      action: { kind: 'currency', currency: 'transmutation' },
    },
  ],
})
it('不能开始的富豪转向蜕变并显示原因，合法富豪不跳转', () => {
  expect(readCraftStrategy(strategy())).toEqual({ ok: true, value: strategy() })
  expect(evaluateCraftStrategy(catalog(), state('normal'), strategy(), 0)).toMatchObject({
    ok: true,
    value: {
      kind: 'action',
      ruleIndex: 1,
      action: { kind: 'currency', currency: 'transmutation' },
      route: [{ ruleIndex: 0, from: 'a', to: 'b', blockedReason: expect.any(String) }],
    },
  })
  expect(evaluateCraftStrategy(catalog(), state('magic', ['p1']), strategy(), 1)).toEqual({
    ok: true,
    value: { kind: 'action', ruleIndex: 0, action: { kind: 'currency', currency: 'regal' } },
  })
})
it('无fallback维持拒绝，失败转向最终无匹配仍保留原因', () => {
  const input = strategy()
  input.rules[0] = {
    stageId: 'a',
    conditions: [{ kind: 'always' }],
    action: { kind: 'currency', currency: 'regal' },
  }
  expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', ruleIndex: 0 },
  })
  const empty = strategy()
  empty.rules.pop()
  expect(evaluateCraftStrategy(catalog(), state('normal'), empty, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched', route: [{ blockedReason: expect.any(String) }] },
  })
})
it('fallback自环、互环和jump混合环均被阻止，原失败原因不丢失', () => {
  const self = strategy()
  self.rules[0] = {
    stageId: 'a',
    onBlockedStageId: 'a',
    conditions: [{ kind: 'always' }],
    action: { kind: 'currency', currency: 'regal' },
  }
  expect(evaluateCraftStrategy(catalog(), state('normal'), self, 0)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', route: [{ from: 'a', to: 'a', blockedReason: expect.any(String) }] },
  })
  for (const action of [
    { kind: 'jump' } as const,
    { kind: 'currency', currency: 'regal' } as const,
  ]) {
    const input = strategy()
    input.rules[1] = {
      stageId: 'b',
      ...(action.kind === 'jump' ? { nextStageId: 'a' } : { onBlockedStageId: 'a' }),
      conditions: [{ kind: 'always' }],
      action,
    }
    expect(evaluateCraftStrategy(catalog(), state('normal'), input, 0)).toMatchObject({
      ok: true,
      value: {
        kind: 'blocked',
        message: expect.stringContaining('循环'),
        route: [{ blockedReason: expect.any(String) }, { to: 'a' }],
      },
    })
  }
})
it('全局步骤上限及失联目标先阻止，不能利用fallback绕过', () => {
  expect(evaluateCraftStrategy(catalog(), state('normal'), strategy(), 10)).toEqual({
    ok: true,
    value: { kind: 'stop', reason: 'step-limit' },
  })
  const input = strategy()
  input.rules.push({
    stageId: 'b',
    conditions: [{ kind: 'selected-targets', modIds: ['p1'], min: 1, value: true }],
    action: { kind: 'stop' },
  })
  const result = evaluateCraftStrategy(catalog(), state('normal'), input, 0)
  expect(result).toMatchObject({
    ok: true,
    value: { kind: 'blocked', message: expect.stringContaining('已移除') },
  })
  expect(result.ok && result.value.route).toBeUndefined()
})
it('fallback只能用于flow实际工作动作且必须引用已有阶段', () => {
  const input = strategy(),
    first = input.rules[0]
  if (!first) throw new Error('缺规则')
  for (const onBlockedStageId of [undefined, '', 'unknown', 1])
    expect(readCraftStrategy({ ...input, rules: [{ ...first, onBlockedStageId }] }).ok).toBe(false)
  for (const kind of ['stop', 'jump'])
    expect(
      readCraftStrategy({ ...input, rules: [{ ...first, nextStageId: 'b', action: { kind } }] }).ok,
    ).toBe(false)
  expect(
    readCraftStrategy({
      maxSteps: 10,
      rules: [{ conditions: first.conditions, action: first.action, onBlockedStageId: 'b' }],
    }).ok,
  ).toBe(false)
})
