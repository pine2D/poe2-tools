import { expect, it } from 'vitest'
import { catalog, imported } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import {
  type CraftStrategyCondition,
  evaluateCraftStrategy,
  readCraftStrategy,
} from './craftStrategy'
import type { CraftState } from './rehearsal'

const start = () => {
  const result = imported()
  if (!result.ok) throw Error(result.error)
  return result.value
}
const quality = {
  kind: 'quality',
  source: 'catalyst',
  catalystId: 'Flesh',
  min: 20,
  max: 20,
} as const
const strategy = (condition: CraftStrategyCondition) => ({
  maxSteps: 10,
  rules: [{ conditions: [condition], action: { kind: 'stop' as const } }],
})
const decide = (state: CraftState, condition: CraftStrategyCondition) =>
  evaluateCraftStrategy(catalog, state, strategy(condition), 0)

it('品质闭区间与指定催化类型随真实消费变化，不修改输入', () => {
  const initial = start()
  expect(decide(initial, quality)).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(decide(initial, { ...quality, catalystId: 'Neural' })).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  const result = applyCraftStep(catalog, initial, {
    currency: 'exalted',
    omen: 'catalysing_exaltation',
    modIds: ['FireResist1'],
  })
  if (!result.ok) throw Error(result.error)
  expect(initial.catalyst?.quality).toBe(20)
  expect(decide(result.value, quality)).toMatchObject({ ok: true, value: { kind: 'unmatched' } })
  expect(decide(result.value, { ...quality, min: 0, max: 0 })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
})

it('未知品质与已知零品质不同，取反不把未知当作匹配', () => {
  const state: CraftState = {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  }
  const zero = { kind: 'quality', source: 'catalyst', min: 0, max: 0 } as const
  for (const condition of [zero, { kind: 'not' as const, condition: zero }])
    expect(decide(state, condition)).toMatchObject({ ok: true, value: { kind: 'unmatched' } })
  expect(
    decide({ ...state, catalyst: { id: 'Flesh', quality: 0, declared: true } }, zero),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(decide(start(), { kind: 'quality', source: 'ordinary', min: 0 })).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})

it('普通品质按已声明值判断，包含两端', () => {
  const state: CraftState = {
    baseId: 'Rusted Greathelm',
    itemLevel: 86,
    rarity: 'rare',
    affixes: [],
    sourceText: null,
    quality: 20,
  }
  expect(decide(state, { kind: 'quality', source: 'ordinary', min: 20, max: 20 })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(decide(state, { kind: 'quality', source: 'ordinary', min: 21 })).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})

it('品质条件参与全部、任一、取反，类型不符是已知不匹配', () => {
  const wrong = { ...quality, catalystId: 'Neural' }
  expect(decide(start(), { kind: 'not', condition: wrong })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  expect(
    decide(start(), { kind: 'all', conditions: [quality, { kind: 'rarity', value: 'rare' }] }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(decide(start(), { kind: 'any', conditions: [wrong, quality] })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
})

it('拒绝未知类型、非法范围、额外字段及普通品质携带催化类型', () => {
  for (const bad of [
    { ...quality, source: 'other' },
    { ...quality, catalystId: 'unknown' },
    { ...quality, catalystId: '' },
    { ...quality, source: 'ordinary' },
    { ...quality, min: -1 },
    { ...quality, min: 0.1 },
    { ...quality, min: 21 },
    { ...quality, max: 101 },
    { ...quality, max: undefined },
    { ...quality, surprise: true },
  ])
    expect(readCraftStrategy(strategy(bad as CraftStrategyCondition)).ok).toBe(false)
  expect(readCraftStrategy(strategy({ kind: 'quality', source: 'catalyst', min: 0 })).ok).toBe(true)
})
