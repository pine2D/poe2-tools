import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { applyCraftStep } from './craftSteps'
import { implicitTargetFixture } from './implicitTargetFixture'
import { analyzeCraftImplicitTargets } from './implicitTargets'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

it('仅固有槽目标有神圣建议及真实一步路线，不造显式目标', () => {
  const { catalog, state } = implicitTargetFixture()
  const goal = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  const advice = analyzeCraftTargets(catalog, state, [], [], [], undefined, goal)
  expect(advice.ok && advice.value.steps.some((step) => step.currency === 'divine')).toBe(true)
  const route = planCraftTargetRoutes(catalog, state, [], [], [], { maxDepth: 1 }, goal)
  expect(route.ok && route.value.routes.length > 0).toBe(true)
  if (!route.ok) return
  const step = route.value.routes[0]?.steps[0]
  expect(step?.operation).toMatchObject({ currency: 'divine', modIds: [], implicitValues: [15, 2] })
  if (step)
    expect(applyCraftStep(catalog, state, step.operation)).toMatchObject({
      ok: true,
      value: {
        implicitLines: ['15(10-20)% increased Flask Charges gained', 'Has 2(1-2) Charm Slot'],
      },
    })
})

it('已达成显式与固有条件仍受保护，示例保住数值也报告神圣连带重掷', () => {
  const { catalog, state } = implicitTargetFixture()
  const start = {
    ...state,
    rarity: 'rare' as const,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 8'] }],
  }
  const implicit = [
    { lineIndex: 0, bounds: [{ index: 0, min: 15 }] },
    { lineIndex: 1, bounds: [{ index: 0, min: 2 }] },
  ]
  const explicit = [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }]
  const advice = analyzeCraftTargets(catalog, start, ['prefix1'], explicit, [], undefined, implicit)
  expect(advice).toMatchObject({
    ok: true,
    value: {
      implicitTargets: [{ matched: true }, { matched: false }],
      steps: [
        {
          currency: 'divine',
          targetImplicitLineIndexes: [1],
          rerolledImplicitLineIndexes: [0, 1],
          rerolledTargetIds: ['prefix1'],
        },
      ],
    },
  })
  const result = planCraftTargetRoutes(
    catalog,
    start,
    ['prefix1'],
    explicit,
    [],
    { maxDepth: 1 },
    implicit,
  )
  expect(result.ok && result.value.alreadyMatched).toBe(false)
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) return
  const steps = required(result.value.routes[0]).steps
  let current: CraftState = start
  for (const step of steps) {
    const applied = applyCraftStep(catalog, current, step.operation)
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    current = { ...applied.value, implicitLines: required(applied.value.implicitLines) }
    expect(analyzeCraftImplicitTargets(catalog, current, [required(implicit[0])])).toMatchObject({
      ok: true,
      value: [{ matched: true }],
    })
    expect(step).toMatchObject({
      matchedImplicitLineIndexes: [0, 1],
      gainedImplicitLineIndexes: [1],
      lostImplicitLineIndexes: [],
      rerolledImplicitLineIndexes: [0, 1],
    })
  }
})

it('祝福保留显式网格外原值，固有仍选择合法网格值完成联合路线', () => {
  const { catalog, state, base } = implicitTargetFixture()
  base.implicit = '(1.5-2.5)% increased Flask Charges gained\nHas (1-3) Charm Slot'
  required(catalog.modifiers[0]).lines = ['prefix1 (1.5-2.5)']
  const start = {
    ...state,
    rarity: 'rare' as const,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 1.75'] }],
    implicitLines: ['1.75(1.5-2.5)% increased Flask Charges gained', 'Has 1(1-2) Charm Slot'],
  }
  const goal = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  const result = planCraftTargetRoutes(catalog, start, ['prefix1'], [], [], { maxDepth: 1 }, goal)
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) return
  const step = required(required(result.value.routes[0]).steps[0])
  expect(step.operation).toMatchObject({
    currency: 'divine',
    omen: 'blessed',
    rolls: [],
    implicitValues: [1.5, 2],
  })
  expect(applyCraftStep(catalog, start, step.operation).ok).toBe(true)
  expect(start.affixes[0]?.lines).toEqual(['prefix1 1.75'])
})

it('普通新增与固有条件联合达成，不能把部分结果当完整路线', () => {
  const { catalog, state } = implicitTargetFixture()
  const goals = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  const result = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix1'],
    [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
    [],
    { maxDepth: 3 },
    goals,
  )
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) return
  for (const route of result.value.routes)
    expect(
      analyzeCraftTargets(
        catalog,
        route.finalState,
        ['prefix1'],
        [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
        [],
        undefined,
        goals,
      ),
    ).toMatchObject({
      ok: true,
      value: { targets: [{ matched: true }], implicitTargets: [{ matched: true }] },
    })
  const impossible = [{ lineIndex: 1, bounds: [{ index: 0, min: 3 }] }]
  const advice = analyzeCraftTargets(catalog, state, ['prefix1'], [], [], undefined, impossible)
  expect(advice.ok && advice.value.steps.some((step) => step.currency !== 'divine')).toBe(true)
  expect(
    planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], { maxDepth: 2 }, impossible),
  ).toMatchObject({ ok: true, value: { routes: [], alreadyMatched: false } })
})

it('plain未知范围不造神圣；固定1核对即可，空目标不声称达成', () => {
  const { catalog, state, base } = implicitTargetFixture()
  const plain = {
    ...state,
    sourceText: 'source',
    implicitLines: ['15(10-20)% increased Flask Charges gained', 'Has 1 Charm Slot'],
  }
  expect(
    planCraftTargetRoutes(catalog, plain, [], [], [], { maxDepth: 1 }, [
      { lineIndex: 1, bounds: [{ index: 0, min: 2 }] },
    ]),
  ).toMatchObject({ ok: true, value: { routes: [], alreadyMatched: false } })
  base.implicit = '(10-20)% increased Flask Charges gained\nHas 1 Charm Slot'
  expect(
    planCraftTargetRoutes(catalog, plain, [], [], [], {}, [
      { lineIndex: 1, bounds: [{ index: 0, min: 1 }] },
    ]),
  ).toMatchObject({ ok: true, value: { routes: [], alreadyMatched: true } })
  expect(planCraftTargetRoutes(catalog, plain, [])).toMatchObject({
    ok: true,
    value: { routes: [], alreadyMatched: false },
  })
})

it('固有条件无交集不阻止推进显式数值建议，但不能声称完整路线', () => {
  const { catalog, state } = implicitTargetFixture()
  const start = {
    ...state,
    rarity: 'rare' as const,
    affixes: [{ modId: 'prefix1', lines: ['prefix1 5'] }],
  }
  const explicit = [{ modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }]
  const impossible = [{ lineIndex: 1, bounds: [{ index: 0, min: 3 }] }]
  const advice = analyzeCraftTargets(
    catalog,
    start,
    ['prefix1'],
    explicit,
    [],
    undefined,
    impossible,
  )
  expect(
    advice.ok &&
      advice.value.steps.some(
        (step) => step.currency === 'divine' && step.targetModIds.includes('prefix1'),
      ),
  ).toBe(true)
  expect(
    planCraftTargetRoutes(catalog, start, ['prefix1'], explicit, [], { maxDepth: 1 }, impossible),
  ).toMatchObject({ ok: true, value: { routes: [], alreadyMatched: false } })
})

it('精华准备和固有联合条件通过真实多步回放，不用伪造词缀启动', () => {
  const { catalog, state } = implicitTargetFixture()
  const essenceId = 'Metadata/Items/Currency/CurrencyLesserEssenceLife'
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', url: '', sha256: 'a'.repeat(64) })
  catalog.essences = [
    {
      id: essenceId,
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Belt: 'prefix1' },
    },
  ]
  required(catalog.modifiers[0]).eligibility = [{ tag: 'default', value: 0 }]
  const goals = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
  const result = planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], { maxDepth: 4 }, goals)
  expect(result.ok && result.value.routes.length > 0).toBe(true)
  if (!result.ok) return
  for (const route of result.value.routes) {
    expect(
      route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'essence'),
    ).toBe(true)
    expect(
      analyzeCraftTargets(catalog, route.finalState, ['prefix1'], [], [], undefined, goals),
    ).toMatchObject({
      ok: true,
      value: { targets: [{ matched: true }], implicitTargets: [{ matched: true }] },
    })
  }
})
