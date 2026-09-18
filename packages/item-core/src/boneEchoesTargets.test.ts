import { expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { applyBoneCraft } from './boneCraft'
import { boneCatalog, boneState } from './boneTestFixture'
import { planCraftTargetRoutes } from './targetRoutes'

it.each(['preserved_rib', 'ancient_rib'] as const)(
  '%s 已购买机会首组无目标时给第二组并真实完成，原组仍能直接揭示',
  (boneId) => {
    const catalog = boneCatalog()
    const state = {
      ...boneState(),
      pendingDesecration: {
        boneId,
        kind: 'suffix' as const,
        options: ['suffix1', 'suffix2', 'suffix3'],
        revealOmen: 'abyssal_echoes' as const,
      },
    }
    let applications = 0
    const advice = analyzeBoneTargets(
      catalog,
      state,
      ['exclusive1'],
      [{ modId: 'exclusive1', bounds: [{ index: 0, min: 7 }] }],
      [],
      {
        consumeCandidate: () => {
          applications++
          return true
        },
      },
    )
    if (!advice.ok) throw new Error(advice.error)
    const reroll = advice.value.find((entry) => entry.operation.kind === 'desecration-reroll')
    expect(reroll).toBeDefined()
    expect(reroll?.targetModIds).toEqual(['exclusive1'])
    expect(
      advice.value.some(
        (entry) =>
          entry.operation.kind === 'desecration-reveal' && entry.operation.modId === 'suffix1',
      ),
    ).toBe(true)
    if (reroll) expect(applyBoneCraft(catalog, state, reroll.operation).ok).toBe(true)
    expect(applications).toBeGreaterThan(0)
    const planned = planCraftTargetRoutes(
      catalog,
      state,
      ['exclusive1'],
      [{ modId: 'exclusive1', bounds: [{ index: 0, min: 7 }] }],
    )
    if (!planned.ok) throw new Error(planned.error)
    expect(
      planned.value.routes[0]?.steps.map((step) => 'kind' in step.operation && step.operation.kind),
    ).toEqual(['desecration-reroll', 'desecration-reveal'])
    expect(planned.value.routes[0]?.finalState.affixes[0]?.lines).toEqual(['exclusive1 7(1-10)'])
    expect(planned.value.candidateApplications).toBeLessThanOrEqual(4096)
  },
)

it('两组重复ID建议去重，首组替代档位已可推进时不额外重选，首offer不自动付费', () => {
  const catalog = boneCatalog()
  const pending = {
    boneId: 'preserved_rib' as const,
    kind: 'suffix' as const,
    options: ['suffix1', 'suffix2', 'suffix3'],
    revealOmen: 'abyssal_echoes' as const,
  }
  const alternative = catalog.modifiers.find((mod) => mod.id === 'suffix4')
  if (!alternative) throw new Error('fixture')
  alternative.group = 'suffix1'
  const ready = analyzeBoneTargets(
    catalog,
    { ...boneState(), pendingDesecration: pending },
    ['suffix4'],
    [],
    [{ targetModId: 'suffix4', modIds: ['suffix1'] }],
  )
  if (!ready.ok) throw new Error(ready.error)
  expect(ready.value.some((step) => step.operation.kind === 'desecration-reroll')).toBe(false)
  expect(
    ready.value.some(
      (step) =>
        step.operation.kind === 'desecration-reveal' &&
        step.operation.modId === 'suffix1' &&
        step.targetModIds.includes('suffix1'),
    ),
  ).toBe(true)
  const both = analyzeBoneTargets(
    catalog,
    {
      ...boneState(),
      pendingDesecration: { ...pending, rerollOptions: ['suffix1', 'exclusive1', 'exclusive2'] },
    },
    ['exclusive1'],
  )
  if (!both.ok) throw new Error(both.error)
  expect(both.value.filter((step) => step.operation.kind === 'desecration-reveal')).toHaveLength(5)
  expect(
    both.value.filter(
      (step) => step.operation.kind === 'desecration-reveal' && step.operation.modId === 'suffix1',
    ),
  ).toHaveLength(1)
  const first = analyzeBoneTargets(
    catalog,
    { ...boneState(), pendingDesecration: { boneId: 'preserved_rib', kind: 'suffix' } },
    ['exclusive1'],
  )
  if (!first.ok) throw new Error(first.error)
  expect(first.value.length).toBeGreaterThan(0)
  for (const step of first.value) expect(step.operation).not.toHaveProperty('revealOmen')
  const noEchoes = analyzeBoneTargets(
    catalog,
    {
      ...boneState(),
      pendingDesecration: {
        boneId: 'preserved_rib',
        kind: 'suffix',
        options: ['suffix1', 'suffix2', 'suffix3'],
      },
    },
    ['exclusive1'],
  )
  if (!noEchoes.ok) throw new Error(noEchoes.error)
  expect(noEchoes.value.some((step) => step.operation.kind === 'desecration-reroll')).toBe(false)
})
it('第二组建议仍核对生成网格，所有真实apply计共享预算并逐步保护已有目标', () => {
  const catalog = boneCatalog()
  const state = {
    ...boneState(['prefix1']),
    pendingDesecration: {
      boneId: 'preserved_rib' as const,
      kind: 'suffix' as const,
      options: ['suffix1', 'suffix2', 'suffix3'],
      revealOmen: 'abyssal_echoes' as const,
    },
  }
  let count = 0
  const bounded = analyzeBoneTargets(catalog, state, ['exclusive1'], [], [], {
    consumeCandidate: () => {
      if (count >= 2) return false
      count++
      return true
    },
  })
  expect(bounded.ok).toBe(true)
  expect(count).toBe(2)
  const routes = planCraftTargetRoutes(catalog, state, ['prefix1', 'exclusive1'], [], [], {
    preserveMatched: true,
  })
  if (!routes.ok) throw new Error(routes.error)
  expect(routes.value.routes.length).toBeGreaterThan(0)
  for (const route of routes.value.routes) {
    expect(route.finalState.pendingDesecration).toBeUndefined()
    for (const step of route.steps)
      expect(step.state.affixes.some((a) => a.modId === 'prefix1')).toBe(true)
  }
  const mod = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  if (!mod) throw new Error('fixture')
  mod.lines = ['exclusive (1.5-2.5)']
  const impossible = analyzeBoneTargets(
    catalog,
    state,
    ['exclusive1'],
    [{ modId: 'exclusive1', bounds: [{ index: 0, min: 1.61, max: 1.69 }] }],
  )
  if (!impossible.ok) throw new Error(impossible.error)
  expect(impossible.value.some((step) => step.operation.kind === 'desecration-reroll')).toBe(false)
})
