import { expect, it } from 'vitest'
import { PENDING_DESECRATION_MESSAGE } from './boneRules'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import type { CraftResult, CraftState } from './rehearsal'
import { checkCraftStrategyAction } from './strategyActions'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function fixture() {
  const catalog = boneCatalog()
  const template = catalog.modifiers[0]
  if (!template) throw Error('缺少合成词缀')
  catalog.modifiers.push({
    ...template,
    id: 'prefix5',
    group: 'prefix5',
    name: 'prefix5',
    lines: ['prefix5 (1-10)'],
  })
  const state: CraftState = {
    ...boneState(['prefix1', 'prefix2', 'suffix1']),
    pendingDesecration: { boneId: 'preserved_rib', kind: 'prefix' },
  }
  return { catalog, state }
}

it('普通后缀目标可在占位期间建议崇高，指引和真实应用一致', () => {
  const { catalog, state } = fixture()
  const advice = must(analyzeCraftTargets(catalog, state, ['suffix2']))
  expect(advice.targets[0]?.reasons).not.toContain(PENDING_DESECRATION_MESSAGE)
  expect(advice.steps.map((step) => step.currency)).toContain('exalted')
  expect(advice.steps.every((step) => step.currency.endsWith('exalted'))).toBe(true)
  expect(
    checkCraftStrategyAction(catalog, state, { kind: 'currency', currency: 'exalted' }).ok,
  ).toBe(true)
  const next = must(applyCraftStep(catalog, state, { currency: 'exalted', modIds: ['suffix2'] }))
  expect(next.pendingDesecration).toEqual(state.pendingDesecration)
  expect(must(analyzeCraftTargets(catalog, next, ['suffix2'])).targets[0]?.matched).toBe(true)
})

it('占位期间的双后缀目标路线可先追加再揭示，每一步可回放并保留已有目标', () => {
  const { catalog, state } = fixture()
  const routes = must(planCraftTargetRoutes(catalog, state, ['prefix1', 'suffix2', 'suffix3']))
  const route = routes.routes.find((entry) => 'currency' in (entry.steps[0]?.operation ?? {}))
  expect(route).toBeDefined()
  let current = state
  for (const step of route?.steps ?? []) {
    current = must(applyCraftStep(catalog, current, step.operation))
    expect(current).toEqual(step.state)
    expect(current.affixes.some((affix) => affix.modId === 'prefix1')).toBe(true)
  }
  expect(current.pendingDesecration).toBeUndefined()
  expect(
    must(analyzeCraftTargets(catalog, current, ['suffix2', 'suffix3'])).targets.every(
      (target) => target.matched,
    ),
  ).toBe(true)
})

it('固定首组三项后恢复阶段限制，不能借助辅助操作改写候选', () => {
  const { catalog, state } = fixture()
  state.pendingDesecration = {
    boneId: 'preserved_rib',
    kind: 'prefix',
    options: ['prefix3', 'prefix4', 'prefix5'],
  }
  const advice = must(analyzeCraftTargets(catalog, state, ['suffix2']))
  expect(advice.targets[0]?.reasons).toContain(PENDING_DESECRATION_MESSAGE)
  expect(advice.steps).toEqual([])
  expect(
    checkCraftStrategyAction(catalog, state, { kind: 'currency', currency: 'exalted' }).ok,
  ).toBe(false)
})
