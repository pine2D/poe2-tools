import { expect, it } from 'vitest'
import { catalog } from './catalystTestFixture'
import {
  analyzeCraftImplicitTargets,
  type CraftImplicitTargetValues,
  implicitTargetRolls,
} from './implicitTargets'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'

const state: CraftState = {
  baseId: 'Ruby Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [],
  implicitLines: ['+20(20-30)% to Fire Resistance'],
  catalyst: { id: "Xoph's", quality: 20, declared: true },
}
const goal = [
  { lineIndex: 0, basis: 'effective', bounds: [{ index: 0, min: 36 }] },
] as CraftImplicitTargetValues[]
it('固有火抗36要求基础30，神圣与路线使用品质后的目标口径', () => {
  expect(analyzeCraftImplicitTargets(catalog, state, goal)).toMatchObject({
    ok: true,
    value: [{ matched: false, numeric: [{ actual: 24 }] }],
  })
  expect(implicitTargetRolls(catalog, state, goal)).toEqual({ ok: true, value: [30] })
  const routes = planCraftTargetRoutes(
    catalog,
    state,
    [],
    [],
    [],
    { maxDepth: 1, maxStates: 12 },
    goal,
  )
  if (!routes.ok) throw new Error(routes.error)
  expect(routes.value.routes[0]?.steps[0]?.operation).toMatchObject({
    currency: 'divine',
    implicitValues: [30],
  })
  const last = routes.value.routes[0]?.finalState
  if (!last) throw new Error('没有路线')
  expect(analyzeCraftImplicitTargets(catalog, last, goal)).toMatchObject({
    ok: true,
    value: [{ matched: true, numeric: [{ actual: 36 }] }],
  })
})
it('品质降低保留原阈值，无法达到时不给错误的神圣结果', () => {
  const lower = { ...state, catalyst: { id: "Xoph's", quality: 10 } }
  expect(analyzeCraftImplicitTargets(catalog, lower, goal)).toMatchObject({
    ok: true,
    value: [{ matched: false }],
  })
  expect(implicitTargetRolls(catalog, lower, goal).ok).toBe(false)
})
