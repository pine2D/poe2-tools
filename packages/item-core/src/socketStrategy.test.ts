import { expect, it } from 'vitest'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { socketStrategyCatalog, socketStrategyState } from './socketStrategyFixture'
import { prepareStrategySocket } from './strategySockets'

const catalog = socketStrategyCatalog()
const strategy: CraftStrategy = {
  maxSteps: 20,
  rules: [
    {
      conditions: [{ kind: 'open-sockets', min: 1, max: 3 }],
      action: { kind: 'socket', augmentId: 'fire', socketIndex: 'first-empty' },
    },
    { conditions: [{ kind: 'socket-count', min: 2, max: 3 }], action: { kind: 'stop' } },
    { conditions: [{ kind: 'always' }], action: { kind: 'artificer' } },
  ],
}
it('零孔打孔与首个空孔填充循环，达到两孔停止且不覆盖已镶物', () => {
  let state = socketStrategyState()
  const initial = structuredClone(state)
  for (let i = 0; i < 4; i++) {
    const decision = evaluateCraftStrategy(catalog, state, strategy, i)
    expect(decision).toMatchObject({
      ok: true,
      value: { kind: 'action', action: { kind: i % 2 ? 'socket' : 'artificer' } },
    })
    if (!decision.ok || decision.value.kind !== 'action') throw Error('未命中动作')
    const action = decision.value.action
    if (action.kind !== 'socket' && action.kind !== 'artificer') throw Error('错误动作')
    const step = prepareStrategySocket(catalog, state, action)
    if (!step.ok) throw Error(step.error)
    const next = applyCraftStep(catalog, state, step.value)
    if (!next.ok) throw Error(next.error)
    state = next.value
  }
  expect(state.sockets).toEqual(['fire', 'fire'])
  expect(initial.sockets).toEqual([])
  expect(evaluateCraftStrategy(catalog, state, strategy, 4)).toMatchObject({
    ok: true,
    value: { kind: 'stop', ruleIndex: 1 },
  })
})
it('未知孔位不匹配零孔条件，额外孔计入范围且打孔受原上限约束', () => {
  const exactZero: CraftStrategy = {
    maxSteps: 10,
    rules: [{ conditions: [{ kind: 'socket-count', min: 0, max: 0 }], action: { kind: 'stop' } }],
  }
  const state = socketStrategyState()
  delete state.sockets
  expect(evaluateCraftStrategy(catalog, state, exactZero, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(evaluateCraftStrategy(catalog, { ...state, sockets: [] }, exactZero, 0)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(prepareStrategySocket(catalog, state, { kind: 'artificer' }).ok).toBe(false)
  expect(
    prepareStrategySocket(catalog, { ...state, sockets: [null, null, null] }, { kind: 'artificer' })
      .ok,
  ).toBe(false)
})
it('第一空孔不覆盖，指定第二孔沿原引擎替换并拒绝未知材料和孔位', () => {
  const state = { ...socketStrategyState(), sockets: ['fire', 'cold'] }
  expect(
    prepareStrategySocket(catalog, state, {
      kind: 'socket',
      augmentId: 'fire',
      socketIndex: 'first-empty',
    }).ok,
  ).toBe(false)
  expect(
    prepareStrategySocket(catalog, state, { kind: 'socket', augmentId: 'fire', socketIndex: 1 }),
  ).toEqual({ ok: true, value: { kind: 'socket', augmentId: 'fire', socketIndex: 1 } })
  for (const patch of [{ augmentId: 'unknown' }, { socketIndex: 2 }])
    expect(
      prepareStrategySocket(catalog, state, {
        kind: 'socket',
        augmentId: 'fire',
        socketIndex: 0,
        ...patch,
      }).ok,
    ).toBe(false)
  expect(state.sockets).toEqual(['fire', 'cold'])
})
it('孔位规则严格校验闭区间及动作字段', () => {
  expect(readCraftStrategy(strategy).ok).toBe(true)
  for (const condition of [
    { kind: 'socket-count', min: 2, max: 1 },
    { kind: 'open-sockets', min: 0, max: 4 },
    { kind: 'socket-count', min: 0.5, max: 2 },
    { kind: 'socket-count', min: 0 },
  ])
    expect(
      readCraftStrategy({
        maxSteps: 10,
        rules: [{ conditions: [condition], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
  for (const action of [
    { kind: 'artificer', socketIndex: 0 },
    { kind: 'socket', augmentId: 'fire', socketIndex: 3 },
    { kind: 'socket', augmentId: '', socketIndex: 0 },
    { kind: 'socket', augmentId: 'fire' },
    { kind: 'socket', augmentId: 'fire', socketIndex: 0, omen: undefined },
  ])
    expect(
      readCraftStrategy({ maxSteps: 10, rules: [{ conditions: [{ kind: 'always' }], action }] }).ok,
    ).toBe(false)
})

it('待揭示时孔位规则仍被原引擎阻止，不跳过命中规则或改写状态', () => {
  const pending = applyCraftStep(
    catalog,
    { ...socketStrategyState(), rarity: 'rare', sockets: [null] },
    { kind: 'desecrate', boneId: 'preserved_rib', affixKind: 'prefix' },
  )
  if (!pending.ok) throw Error(pending.error)
  const snapshot = structuredClone(pending.value)
  expect(evaluateCraftStrategy(catalog, pending.value, strategy, 1)).toMatchObject({
    ok: true,
    value: { kind: 'blocked', ruleIndex: 0 },
  })
  expect(prepareStrategySocket(catalog, pending.value, { kind: 'artificer' }).ok).toBe(false)
  expect(pending.value).toEqual(snapshot)
})
