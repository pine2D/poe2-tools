import { expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { type CraftPricing, collectCraftCosts, quoteCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog = boneCatalog('Focus')
const input = { ...boneState(), rarity: 'normal' as const }
function run(pricing: CraftPricing) {
  const result = planCraftTargetRoutes(catalog, input, ['prefix1'], [], [], { pricing })
  if (!result.ok) throw Error(result.error)
  for (const route of result.value.routes) {
    let current = input as ReturnType<typeof boneState>
    for (const step of route.steps) {
      const applied = applyCraftStep(catalog, current, step.operation)
      if (!applied.ok) throw Error(applied.error)
      current = applied.value
      expect(current).toEqual(step.state)
    }
    expect(current).toEqual(route.finalState)
    expect(current.affixes.some((a) => a.modId === 'prefix1')).toBe(true)
  }
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  return result.value
}
it('报价参与搜索，已知便宜的蜕变排在早期点金结果之前，起点成本不影响新增路线', () => {
  const pricing: CraftPricing = {
    unit: 'divine',
    baseCost: 1000000,
    prices: { 'currency:alchemy': 5, 'currency:transmutation': 0.1 },
  }
  const result = run(pricing)
  expect(result.routes[0]?.steps.map((s) => s.operation)).toMatchObject([
    { currency: 'transmutation' },
  ])
  const first = result.routes[0]
  if (!first) throw Error('没有路线')
  const costs = collectCraftCosts(
    catalog,
    first.steps.map((s) => s.operation),
  )
  expect(costs.ok && quoteCraftCosts(costs.value, pricing)).toMatchObject({
    ok: true,
    value: { total: 0.1 },
  })
  expect(run({ ...pricing, baseCost: 0 }).routes).toEqual(result.routes)
})
it('明确零成本有效，缺价不视为零且保留可见的未知报价路线', () => {
  const result = run({ unit: 'divine', prices: { 'currency:transmutation': 0 } })
  expect(result.routes[0]?.steps[0]?.operation).toMatchObject({ currency: 'transmutation' })
  expect(
    result.routes.some((r) =>
      r.steps.some((s) => 'currency' in s.operation && s.operation.currency === 'alchemy'),
    ),
  ).toBe(true)
})
it('拒绝未知材料与非法报价，未传报价的既有搜索保持可用', () => {
  expect(
    planCraftTargetRoutes(catalog, input, ['prefix1'], [], [], {
      pricing: { unit: 'divine', prices: { 'currency:nope': 0 } },
    }).ok,
  ).toBe(false)
  expect(
    planCraftTargetRoutes(
      catalog,
      input,
      ['prefix1'],
      [],
      [],
      // @ts-expect-error 显式 undefined 是待拒绝的非法运行时输入。
      { pricing: undefined },
    ).ok,
  ).toBe(false)
  expect(planCraftTargetRoutes(catalog, input, ['prefix1']).ok).toBe(true)
})

it('同一终点保留两次便宜崇高，不被较短的双预兆昂贵路径覆盖', () => {
  const pricing: CraftPricing = {
    unit: 'divine',
    prices: {
      'currency:exalted': 0.1,
      'omen:Omen of Greater Exaltation': 100,
      'omen:Omen of Sinistral Exaltation': 100,
      'omen:Omen of Dextral Exaltation': 100,
    },
  }
  const result = planCraftTargetRoutes(
    catalog,
    boneState(['suffix1', 'suffix2']),
    ['prefix1', 'prefix2'],
    [],
    [],
    { pricing },
  )
  if (!result.ok) throw Error(result.error)
  const first = result.value.routes[0]
  if (!first) throw Error('没有路线')
  expect(first.steps.map((s) => s.operation)).toMatchObject([
    { currency: 'exalted' },
    { currency: 'exalted' },
  ])
  expect(first.steps.every((s) => !('omen' in s.operation))).toBe(true)
  const costs = collectCraftCosts(
    catalog,
    first.steps.map((s) => s.operation),
  )
  expect(costs.ok && quoteCraftCosts(costs.value, pricing)).toMatchObject({
    ok: true,
    value: { total: 0.2 },
  })
})

it('先推进破裂准备，费用模式不会只探索低价但未完成的路径', () => {
  const pricing: CraftPricing = {
    unit: 'divine',
    prices: {
      'currency:transmutation': 1,
      'currency:augmentation': 1,
      'currency:regal': 1,
      'currency:alchemy': 5,
      'currency:exalted': 0.1,
      'currency:fracture': 1,
    },
  }
  const result = planCraftTargetRoutes(
    catalog,
    input,
    ['prefix1', 'suffix1'],
    [],
    [],
    { pricing, maxStates: 16 },
    [],
    'prefix1',
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes)
    expect(route.finalState.affixes.some((a) => a.modId === 'prefix1' && a.fractured)).toBe(true)
})

it('相同中间状态保留较长便宜路径，继续破裂后仍选较低总费用', () => {
  const pricing: CraftPricing = {
    unit: 'divine',
    prices: {
      'currency:exalted': 0.1,
      'currency:fracture': 1,
      'omen:Omen of Greater Exaltation': 100,
      'omen:Omen of Sinistral Exaltation': 100,
      'omen:Omen of Dextral Exaltation': 100,
    },
  }
  const initial = boneState(['suffix1', 'suffix2'])
  const result = planCraftTargetRoutes(
    catalog,
    initial,
    ['prefix1', 'prefix2'],
    [],
    [],
    { pricing },
    [],
    'prefix1',
  )
  if (!result.ok) throw Error(result.error)
  const first = result.value.routes[0]
  if (!first) throw Error('没有路线')
  expect(first.steps.map((s) => s.operation)).toMatchObject([
    { currency: 'exalted' },
    { currency: 'exalted' },
    { kind: 'fracture', modId: 'prefix1' },
  ])
  const costs = collectCraftCosts(
    catalog,
    first.steps.map((s) => s.operation),
  )
  expect(costs.ok && quoteCraftCosts(costs.value, pricing)).toMatchObject({
    ok: true,
    value: { total: 1.2 },
  })
  expect(first.finalState.affixes.find((a) => a.modId === 'prefix1')?.fractured).toBe(true)
})
