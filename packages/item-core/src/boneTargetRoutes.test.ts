import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { planCraftTargetRoutes } from './targetRoutes'
import { craftTargetCandidates } from './targets'

it('专属目标从稀有装备通过真实三阶段达到', () => {
  const catalog = boneCatalog()
  expect(
    craftTargetCandidates(catalog, 'Synthetic Base').some((mod) => mod.id === 'exclusive1'),
  ).toBe(true)
  const result = planCraftTargetRoutes(
    catalog,
    boneState(),
    ['exclusive1'],
    [{ modId: 'exclusive1', bounds: [{ index: 0, min: 8 }] }],
  )
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) return
  const route = result.value.routes[0]
  if (!route) throw new Error('缺少路线')
  expect(
    route.steps.map((step) =>
      'kind' in step.operation ? step.operation.kind : step.operation.currency,
    ),
  ).toEqual(['desecrate', 'desecration-offer', 'desecration-reveal'])
  let current = boneState()
  for (const step of route.steps) {
    const next = applyCraftStep(catalog, current, step.operation)
    if (!next.ok) throw new Error(next.error)
    current = next.value
  }
  expect(current.pendingDesecration).toBeUndefined()
  expect(current.affixes).toContainEqual({
    modId: 'exclusive1',
    lines: ['exclusive1 8(1-10)'],
    desecrated: true,
  })
})

it.each(['normal', 'magic'] as const)('%s起点默认预算准备到rare并揭示', (rarity) => {
  const start = { ...boneState(), rarity }
  const result = planCraftTargetRoutes(boneCatalog(), start, ['exclusive1'])
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (result.ok) {
    expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
    expect(result.value.examinedStates).toBeLessThanOrEqual(128)
    expect(result.value.routes[0]?.finalState.pendingDesecration).toBeUndefined()
  }
})
it('满六保留已达成普通目标，方向预兆真实缩小随机移除风险', () => {
  const start = boneState(['prefix1', 'prefix2', 'prefix3', 'suffix1', 'suffix2', 'suffix3'])
  const result = planCraftTargetRoutes(boneCatalog(), start, ['prefix1', 'exclusive1'])
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (result.ok) {
    const route = result.value.routes[0]
    expect(route?.steps[0]?.operation).toMatchObject({
      kind: 'desecrate',
      directionOmen: 'dextral_necromancy',
    })
    expect(route?.steps[0]?.atRiskTargetIds).toEqual([])
    for (const step of route?.steps ?? [])
      expect(step.state.affixes.some((affix) => affix.modId === 'prefix1')).toBe(true)
  }
})
it('唯一亵渎槽阻挡时真实移除重做，固定无目标options不能被改写', () => {
  const catalog = boneCatalog()
  const occupied = {
    ...boneState(),
    affixes: [{ modId: 'exclusive2', lines: ['exclusive2 5'], desecrated: true as const }],
  }
  const route = planCraftTargetRoutes(catalog, occupied, ['exclusive1'])
  expect(route.ok && route.value.routes.length > 0).toBe(true)
  if (route.ok)
    expect(
      route.value.routes[0]?.steps.some(
        (step) => 'currency' in step.operation && step.operation.currency === 'annulment',
      ),
    ).toBe(true)
  const fixed = {
    ...boneState(),
    pendingDesecration: {
      boneId: 'preserved_rib' as const,
      kind: 'suffix' as const,
      options: ['suffix1', 'suffix2', 'exclusive2'],
    },
  }
  const result = planCraftTargetRoutes(catalog, fixed, ['exclusive1'])
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (result.ok) {
    const first = result.value.routes[0]?.steps[0]?.operation
    expect(first && 'kind' in first && first.kind === 'desecration-reveal').toBe(true)
    expect(fixed.pendingDesecration.options).toEqual(['suffix1', 'suffix2', 'exclusive2'])
  }
})
it('pending已有目标达成也须完成揭示，空options与固定options均不提前完成', () => {
  for (const options of [undefined, ['suffix1', 'suffix2', 'exclusive2']]) {
    const state = {
      ...boneState(['prefix1']),
      pendingDesecration: {
        boneId: 'preserved_rib' as const,
        kind: 'suffix' as const,
        ...(options ? { options } : {}),
      },
    }
    const result = planCraftTargetRoutes(boneCatalog(), state, ['prefix1'])
    expect(result.ok && result.value.alreadyMatched).toBe(false)
    expect(result.ok && result.value.routes.length > 0).toBe(true)
    if (result.ok) expect(result.value.routes[0]?.finalState.pendingDesecration).toBeUndefined()
  }
})

it('保护已有普通ID的亵渎来源槽，放开后可真实移除并重新获得', () => {
  const state = {
    ...boneState(['prefix1']),
    affixes: [{ modId: 'prefix1', lines: ['prefix1 5'], desecrated: true as const }],
  }
  const safe = planCraftTargetRoutes(boneCatalog(), state, ['prefix1', 'exclusive1'])
  expect(safe.ok && safe.value.routes.length).toBe(0)
  const open = planCraftTargetRoutes(boneCatalog(), state, ['prefix1', 'exclusive1'], [], [], {
    preserveMatched: false,
  })
  expect(open.ok && open.value.routes.length > 0).toBe(true)
  if (open.ok)
    expect(open.value.routes[0]?.steps.some((step) => step.lostTargetIds.includes('prefix1'))).toBe(
      true,
    )
})
it('精华保证、专属替代档位与固有条件联合，默认预算真实回放', () => {
  const catalog = boneCatalog()
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyEssenceLife',
      name: 'Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'prefix1' },
    },
  ]
  const first = catalog.modifiers.find((mod) => mod.id === 'prefix1')
  const alternate = catalog.modifiers.find((mod) => mod.id === 'exclusive2')
  const primary = catalog.modifiers.find((mod) => mod.id === 'exclusive1')
  const base = catalog.bases[0]
  if (!first || !alternate || !primary || !base) throw new Error('fixture')
  first.eligibility = [{ tag: 'default', value: 0 }]
  primary.level = 100
  alternate.group = primary.group
  base.implicit = '+(1-3) to Strength'
  const start = {
    ...boneState(),
    rarity: 'normal' as const,
    implicitLines: ['+1(1-3) to Strength'],
  }
  const result = planCraftTargetRoutes(
    catalog,
    start,
    ['prefix1', 'exclusive1'],
    [{ modId: 'exclusive2', bounds: [{ index: 0, min: 8 }] }],
    [{ targetModId: 'exclusive1', modIds: ['exclusive2'] }],
    {},
    [{ lineIndex: 0, bounds: [{ index: 0, min: 3 }] }],
  )
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (result.ok) {
    const route = result.value.routes[0]
    expect(
      route?.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'essence'),
    ).toBe(true)
    expect(
      route?.finalState.affixes.some((affix) => affix.modId === 'exclusive2' && affix.desecrated),
    ).toBe(true)
    expect(route?.finalState.implicitLines).toEqual(['+3(1-3) to Strength'])
  }
})
