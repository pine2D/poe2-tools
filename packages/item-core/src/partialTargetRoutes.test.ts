import { expect, it } from 'vitest'
import { catalog, state } from './partialTargetFixture'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, craftTargetsSatisfied } from './targets'

it('普通装备只需任一组时，一步蜕变即为完整路线', () => {
  const result = planCraftTargetRoutes(
    catalog(catalog().modifiers.filter((mod) => ['p1', 's1'].includes(mod.id))),
    state('normal'),
    ['p1', 's1'],
    [],
    [],
    { minimumTargetCount: 1, maxDepth: 1, maxStates: 16 },
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) {
    expect(route.steps).toHaveLength(1)
    expect(route.steps[0]?.operation).toMatchObject({ currency: 'transmutation' })
    const final = analyzeCraftTargets(
      catalog(),
      route.finalState,
      ['p1', 's1'],
      [],
      [],
      undefined,
      [],
      undefined,
      1,
    )
    if (!final.ok) throw new Error(final.error)
    expect(craftTargetsSatisfied(final.value, 1)).toBe(true)
  }
})
it('已有数量满足时不继续搜索，但指定破裂组不能被其他组代替', () => {
  const done = planCraftTargetRoutes(catalog(), state('rare', ['p1']), ['p1', 's1'], [], [], {
    minimumTargetCount: 1,
  })
  expect(done).toMatchObject({
    ok: true,
    value: { alreadyMatched: true, routes: [], examinedStates: 0 },
  })
  const fracture = planCraftTargetRoutes(
    catalog(),
    state('rare', ['p1']),
    ['p1', 's1'],
    [],
    [],
    { minimumTargetCount: 1, maxDepth: 1, maxStates: 8 },
    [],
    's1',
  )
  expect(fracture).toMatchObject({ ok: true, value: { alreadyMatched: false, routes: [] } })
})
it('四前缀备选两组可经蜕变富豪达成，不强求四组全部共存', () => {
  const result = planCraftTargetRoutes(
    catalog(catalog().modifiers.filter((mod) => ['p1', 'p2', 'p3', 'p4'].includes(mod.id))),
    state('normal'),
    ['p1', 'p2', 'p3', 'p4'],
    [],
    [],
    { minimumTargetCount: 2, maxDepth: 2, maxStates: 64 },
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) expect(route.finalState.affixes).toHaveLength(2)
})
