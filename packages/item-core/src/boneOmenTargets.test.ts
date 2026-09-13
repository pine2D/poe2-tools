import { expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { planCraftTargetRoutes } from './targetRoutes'

it('目标建议保留无预兆和有价值组合，满六方向缩小目标风险', () => {
  const catalog = boneCatalog('Ring')
  const sample = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!sample) throw new Error('fixture')
  for (const n of [1, 2, 3])
    catalog.modifiers.push({
      ...sample,
      id: `exclusivePrefix${n}`,
      group: `exclusivePrefix${n}`,
      kind: 'prefix',
    })
  const start = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const result = analyzeBoneTargets(catalog, start, ['prefix1', 'exclusive1'])
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const base = result.value.find(
    (step) =>
      step.operation.kind === 'desecrate' &&
      !step.operation.directionOmen &&
      !step.operation.lichOmen,
  )
  const combined = result.value.find(
    (step) =>
      step.operation.kind === 'desecrate' &&
      step.operation.directionOmen === 'dextral_necromancy' &&
      step.operation.lichOmen === 'liege',
  )
  expect(base).toBeDefined()
  expect(combined).toBeDefined()
  expect(base?.atRiskTargetIds).toContain('prefix1')
  expect(combined?.atRiskTargetIds).toEqual([])
  if (combined) expect(applyCraftStep(catalog, start, combined.operation).ok).toBe(true)
  const route = planCraftTargetRoutes(catalog, start, ['prefix1', 'exclusive1'])
  expect(route.ok && route.value.routes.length > 0).toBe(true)
  if (route.ok) {
    expect(route.value.candidateApplications).toBeLessThanOrEqual(4096)
    expect(route.value.routes[0]?.finalState.pendingDesecration).toBeUndefined()
  }
})

it('相同巫妖条件下方向不进一步缩小合法结果时建议去冗余，手工组合不禁用', () => {
  const catalog = boneCatalog('Ring')
  const result = analyzeBoneTargets(catalog, boneState(), ['exclusive1'])
  if (!result.ok) throw new Error(result.error)
  expect(
    result.value.some(
      (step) =>
        step.operation.kind === 'desecrate' &&
        step.operation.lichOmen === 'liege' &&
        !step.operation.directionOmen,
    ),
  ).toBe(true)
  expect(
    result.value.some(
      (step) =>
        step.operation.kind === 'desecrate' &&
        step.operation.lichOmen &&
        step.operation.directionOmen,
    ),
  ).toBe(false)
  expect(
    applyCraftStep(catalog, boneState(), {
      kind: 'desecrate',
      boneId: 'preserved_collarbone',
      affixKind: 'suffix',
      lichOmen: 'liege',
      directionOmen: 'dextral_necromancy',
    }).ok,
  ).toBe(true)
  const route = planCraftTargetRoutes(catalog, boneState(), ['exclusive1'])
  if (!route.ok) throw new Error(route.error)
  const operation = route.value.routes[0]?.steps[0]?.operation
  expect(operation).toMatchObject({ kind: 'desecrate' })
  expect(operation).not.toHaveProperty('directionOmen')
  expect(operation).not.toHaveProperty('lichOmen')
})
it('巫妖pending仅构造同族三项，普通目标不冒称推进，配置保持', () => {
  const catalog = boneCatalog('Ring')
  const state = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_collarbone' as const,
      kind: 'suffix' as const,
      lichOmen: 'liege' as const,
      directionOmen: 'dextral_necromancy' as const,
    },
  }
  const result = analyzeBoneTargets(catalog, state, ['suffix1'])
  if (!result.ok) throw new Error(result.error)
  expect(result.value.length).toBeGreaterThan(0)
  for (const step of result.value) {
    expect(step.operation.kind).toBe('desecration-offer')
    expect(step.targetModIds).toEqual([])
    const next = applyCraftStep(catalog, state, step.operation)
    if (!next.ok) throw new Error(next.error)
    expect(next.value.pendingDesecration).toMatchObject({
      lichOmen: 'liege',
      directionOmen: 'dextral_necromancy',
    })
    expect(next.value.pendingDesecration?.options?.every((id) => id.startsWith('exclusive'))).toBe(
      true,
    )
  }
  const planned = planCraftTargetRoutes(catalog, state, ['exclusive1'])
  expect(planned.ok && planned.value.routes.length > 0).toBe(true)
  if (planned.ok) expect(planned.value.routes[0]?.steps).toHaveLength(2)
})
