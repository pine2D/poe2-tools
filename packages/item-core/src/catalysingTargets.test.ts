import { expect, it } from 'vitest'
import { catalog, imported } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

it('品质消费使已有有效数值目标失配，即使词缀破裂锁定也必须提示', () => {
  const source = imported()
  if (!source.ok) throw new Error(source.error)
  const state = {
    ...source.value,
    affixes: source.value.affixes.map((affix) => ({ ...affix, fractured: true as const })),
  }
  const ids = ['IncreasedLife1', 'FireResist1']
  const values = [
    { modId: 'IncreasedLife1', basis: 'effective' as const, bounds: [{ index: 0, min: 22 }] },
  ]
  const advice = analyzeCraftTargets(catalog, state, ids, values, [], 'catalysing_exaltation')
  if (!advice.ok) throw new Error(advice.error)
  const step = advice.value.steps.find((s) => s.currency === 'exalted')
  expect(step?.lostTargetIds).toEqual(['IncreasedLife1'])
  const result = applyCraftStep(catalog, state, {
    currency: 'exalted',
    omen: 'catalysing_exaltation',
    modIds: ['FireResist1'],
  })
  if (!result.ok) throw new Error(result.error)
  const after = analyzeCraftTargets(catalog, result.value, ids, values)
  expect(after.ok && after.value.targets[0]).toMatchObject({
    present: true,
    matched: false,
    numeric: [{ actual: 19 }],
  })
})

it('品质消费后的新目标按无品质范围计算，不承诺原品质下才能达到的数值', () => {
  const source = imported()
  if (!source.ok) throw new Error(source.error)
  const state: CraftState = { ...source.value, catalyst: { id: "Xoph's", quality: 20 } }
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['FireResist1'],
    [{ modId: 'FireResist1', basis: 'effective', bounds: [{ index: 0, min: 12 }] }],
    [],
    'catalysing_exaltation',
  )
  expect(advice).toMatchObject({ ok: true, value: { steps: [] } })
})

it('消费属性品质同时报告固有目标下降', () => {
  const state: CraftState = {
    baseId: 'Jade Amulet',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    implicitLines: ['+10(10-15) to Dexterity'],
    catalyst: { id: 'Adaptive', quality: 20 },
    affixes: [],
  }
  const advice = analyzeCraftTargets(
    catalog,
    state,
    ['IncreasedLife1'],
    [],
    [],
    'catalysing_exaltation',
    [{ lineIndex: 0, basis: 'effective', bounds: [{ index: 0, min: 12 }] }],
  )
  if (!advice.ok) throw new Error(advice.error)
  expect(advice.value.steps.find((step) => step.currency === 'exalted')).toMatchObject({
    lostImplicitLineIndexes: [0],
  })
})

it('多步路线使用消费后的品质选择基础值，能命中精确有效值上限', () => {
  const state: CraftState = {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    catalyst: { id: "Xoph's", quality: 20 },
    affixes: [],
  }
  const values = [
    { modId: 'FireResist1', basis: 'effective' as const, bounds: [{ index: 0, min: 6, max: 6 }] },
  ]
  const result = planCraftTargetRoutes(catalog, state, ['FireResist1'], values, [], { maxDepth: 1 })
  if (!result.ok) throw new Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.routes[0]?.steps[0]?.operation).toMatchObject({
    omen: 'catalysing_exaltation',
    rolls: [{ modId: 'FireResist1', values: [6] }],
  })
  expect(result.value.routes[0]?.finalState.catalyst?.quality).toBe(0)
})
