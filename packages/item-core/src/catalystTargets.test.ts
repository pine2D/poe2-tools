import { expect, it } from 'vitest'
import { catalog, imported } from './catalystTestFixture'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, type CraftTargetValues, validateCraftTargetValues } from './targets'

const goal = [
  { modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] },
] as CraftTargetValues[]
function current() {
  const result = imported()
  if (!result.ok) throw new Error(result.error)
  return result.value
}
it('有效生命22按品质后判断，基础19没有被目标判定误报不足', () => {
  const state = current()
  expect(
    validateCraftTargetValues(catalog, state.baseId, ['IncreasedLife1'], goal, [], state),
  ).toMatchObject({ ok: true, value: goal })
  expect(analyzeCraftTargets(catalog, state, ['IncreasedLife1'], goal)).toMatchObject({
    ok: true,
    value: { targets: [{ matched: true, numeric: [{ actual: 22, matched: true }] }] },
  })
  expect(
    analyzeCraftTargets(
      catalog,
      { ...state, affixes: [{ modId: 'IncreasedLife1', lines: ['+18(10-19) to maximum Life'] }] },
      ['IncreasedLife1'],
      goal,
    ),
  ).toMatchObject({
    ok: true,
    value: { targets: [{ matched: false, numeric: [{ actual: 21, matched: false }] }] },
  })
})
it('神圣路线将有效生命22反解为基础19，并保留当前品质', () => {
  const state = current()
  const start = {
    ...state,
    affixes: [{ modId: 'IncreasedLife1', lines: ['+10(10-19) to maximum Life'] }],
  }
  const result = planCraftTargetRoutes(catalog, start, ['IncreasedLife1'], goal, [], {
    maxDepth: 1,
    maxStates: 12,
  })
  if (!result.ok) throw new Error(result.error)
  const route = result.value.routes[0]
  expect(route).toBeDefined()
  expect(route?.steps[0]?.operation).toMatchObject({
    currency: 'divine',
    rolls: [{ modId: 'IncreasedLife1', values: [19] }],
  })
  expect(route?.finalState.catalyst).toEqual(state.catalyst)
})
it('有效阈值保留原意，品质降低后不得仍按旧品质计算', () => {
  const state = current()
  const reduced = { ...state, catalyst: { id: 'Flesh', quality: 10 } }
  const analysis = analyzeCraftTargets(catalog, reduced, ['IncreasedLife1'], goal)
  expect(analysis).toMatchObject({
    ok: true,
    value: { targets: [{ matched: false, numeric: [{ actual: 20, matched: false }] }] },
  })
  if (!analysis.ok) throw new Error(analysis.error)
  expect(analysis.value.steps.some((step) => step.currency === 'divine')).toBe(false)
})

it('神圣保留不可缩放尾注，反解基础19与实际有效19一致', async () => {
  const { applyCraftStep } = await import('./craftSteps')
  const { minimumCraftTargetRolls } = await import('./effectiveTargetValues')
  const state = current()
  const mod = catalog.modifiers.find((mod) => mod.id === 'IncreasedLife1')
  if (!mod) throw new Error('缺少测试词缀')
  const start = {
    ...state,
    affixes: [{ modId: mod.id, lines: ['+10(10-19) to maximum Life (unscalable)'] }],
  }
  const target: CraftTargetValues = {
    modId: mod.id,
    basis: 'effective',
    bounds: [{ index: 0, min: 19, max: 19 }],
  }
  const values = minimumCraftTargetRolls(catalog, start, mod, target, start.affixes[0]?.lines)
  expect(values).toEqual([19])
  if (!values) throw new Error('缺少结果')
  const applied = applyCraftStep(catalog, start, {
    currency: 'divine',
    modIds: [],
    rolls: [{ modId: mod.id, values }],
    implicitValues: [10],
  })
  if (!applied.ok) throw new Error(applied.error)
  expect(applied.value.affixes[0]?.lines[0]).toContain('(unscalable)')
  expect(analyzeCraftTargets(catalog, applied.value, [mod.id], [target])).toMatchObject({
    ok: true,
    value: { targets: [{ matched: true, numeric: [{ actual: 19 }] }] },
  })
})

it('普通新增通货不推荐当前品质和基础上限无法达到的有效目标', () => {
  const state = {
    ...current(),
    rarity: 'normal' as const,
    affixes: [],
    sourceText: null,
    catalyst: { id: 'Flesh', quality: 10, declared: true as const },
  }
  const analysis = analyzeCraftTargets(catalog, state, ['IncreasedLife1'], goal)
  if (!analysis.ok) throw new Error(analysis.error)
  expect(analysis.value.steps).toEqual([])
})
