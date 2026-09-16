import { expect, it } from 'vitest'
import { requiresCorruptionStrategyProjectVersion } from './corruptionStrategyProjectVersion'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { type CraftState, createCraftState } from './rehearsal'
import { socketStrategyCatalog, socketStrategyState } from './socketStrategyFixture'
import { readCraftStrategyAction } from './strategyActions'
import { prepareStrategySocket } from './strategySockets'

const catalog = socketStrategyCatalog()
const state: CraftState = {
  ...socketStrategyState(),
  corrupted: true,
  sockets: [null, null, null, null],
}
it('合法四孔状态可以按孔数和空孔数匹配，并指定第四孔镶嵌', () => {
  expect(createCraftState(catalog, state).ok).toBe(true)
  const action = { kind: 'socket' as const, augmentId: 'fire', socketIndex: 3 }
  const strategy: CraftStrategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [
          { kind: 'socket-count', min: 4, max: 4 },
          { kind: 'open-sockets', min: 4, max: 4 },
        ],
        action,
      },
    ],
  }
  expect(readCraftStrategy(strategy).ok).toBe(true)
  expect(evaluateCraftStrategy(catalog, state, strategy, 0)).toMatchObject({
    ok: true,
    value: { kind: 'action', action },
  })
  expect(prepareStrategySocket(catalog, state, action)).toEqual({ ok: true, value: action })
  const applied = applyCraftStep(catalog, state, action)
  if (!applied.ok) throw Error(applied.error)
  expect(applied.value.sockets).toEqual([null, null, null, 'fire'])
  expect(evaluateCraftStrategy(catalog, applied.value, strategy, 1)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(readCraftStrategyAction({ ...action, socketIndex: 4 })).toBeNull()
  expect(prepareStrategySocket(catalog, { ...state, sockets: [null, null, null] }, action).ok).toBe(
    false,
  )
})

it('四孔条件及指引属于v78能力，但既有第四孔实际历史不被重新归类', () => {
  const condition = { kind: 'open-sockets', min: 0, max: 4 }
  const action = { kind: 'socket', augmentId: 'fire', socketIndex: 3 }
  expect(requiresCorruptionStrategyProjectVersion({ kind: 'not', condition })).toBe(true)
  expect(requiresCorruptionStrategyProjectVersion({ rules: [{ conditions: [], action }] })).toBe(
    true,
  )
  expect(requiresCorruptionStrategyProjectVersion({ operations: [action] })).toBe(false)
  expect(requiresCorruptionStrategyProjectVersion({ ...condition, max: 3 })).toBe(false)
  expect(requiresCorruptionStrategyProjectVersion({ ...condition, max: '4' })).toBe(false)
  expect(
    requiresCorruptionStrategyProjectVersion({ action: { ...action, socketIndex: '3' } }),
  ).toBe(false)
  const cycle: { conditions: unknown[]; action?: unknown } = { conditions: [] }
  cycle.action = cycle
  expect(requiresCorruptionStrategyProjectVersion(cycle)).toBe(false)
  expect(
    requiresCorruptionStrategyProjectVersion(
      Object.defineProperty({ conditions: [] }, 'action', {
        get() {
          throw Error('不能执行动作访问器')
        },
      }),
    ),
  ).toBe(false)
})
