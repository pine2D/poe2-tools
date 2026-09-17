import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftPanelGoals } from './panelGoals'
import { catalog, mod, state } from './partialTargetFixture'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import type { CraftTargetDefinitions } from './targetDefinitions'

const goals = (): CraftTargetDefinitions => ({
  nextTargetId: 1,
  targets: [],
  alternatives: [],
  values: [],
  panelGoals: [{ kind: 'item-property', property: 'Armour', min: 40 }],
})
const data = () =>
  catalog(
    [
      mod('armour', 'prefix', {
        group: 'LocalPhysicalDamageReductionRating',
        lines: ['+(10-40) to Armour'],
      }),
    ],
    { type: 'Helmet', properties: { Armour: 18 }, sourceQuality: 0 },
  )
const item = () => ({ ...state('normal'), quality: 0, sockets: [] })

describe('面板目标路线', () => {
  it('纯护甲目标生成真实可回放步骤，不要求显式词缀目标', () => {
    const result = planTargetDefinitionRoutes(data(), item(), goals())
    expect(result.ok).toBe(true)
    if (!result.ok) throw Error(result.error)
    expect(result.value.routes.length).toBeGreaterThan(0)
    for (const route of result.value.routes) {
      let current = item()
      for (const step of route.steps) {
        const applied = applyCraftStep(data(), current, step.operation)
        if (!applied.ok) throw Error(applied.error)
        current = applied.value as typeof current
      }
      expect(evaluateCraftPanelGoals(data(), current, goals().panelGoals ?? []).satisfied).toBe(
        true,
      )
    }
  })
  it('未知品质返回具体原因', () => {
    const { quality: _, ...unknown } = item()
    const result = planTargetDefinitionRoutes(data(), unknown, goals())
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('品质') })
  })
})

it('范围上下界与两个词缀合取，逐步重新规划仍可完成', () => {
  const c = catalog(
    [
      mod('flat', 'prefix', {
        group: 'LocalPhysicalDamageReductionRating',
        lines: ['+(10-20) to Armour'],
      }),
      mod('percent', 'prefix', {
        group: 'LocalPhysicalDamageReductionRatingPercent',
        lines: ['(10-50)% increased Armour'],
      }),
    ],
    { type: 'Helmet', properties: { Armour: 18 }, sourceQuality: 0 },
  )
  const config = goals()
  config.panelGoals = [{ kind: 'item-property', property: 'Armour', min: 50, max: 51 }]
  let current = item()
  for (let i = 0; i < 5 && !evaluateCraftPanelGoals(c, current, config.panelGoals).satisfied; i++) {
    const result = planTargetDefinitionRoutes(c, current, config)
    if (!result.ok) throw Error(result.error)
    const first = result.value.routes[0]?.steps[0]
    expect(first).toBeDefined()
    if (!first) return
    current = first.state as typeof current
  }
  expect(evaluateCraftPanelGoals(c, current, config.panelGoals).satisfied).toBe(true)
})

it('纯物理 DPS 与抗性面板可由不同词缀推进', () => {
  const c = catalog(
    [
      mod('physical', 'prefix', {
        group: 'LocalPhysicalDamagePercent',
        lines: ['(10-100)% increased Physical Damage'],
      }),
      mod('fire', 'suffix', { lines: ['+(10-30)% to Fire Resistance'] }),
      mod('cold', 'suffix', { lines: ['+(10-30)% to Cold Resistance'] }),
    ],
    {
      type: 'Bow',
      tags: ['focus', 'default', 'weapon', 'twohand'],
      properties: { PhysicalMin: 10, PhysicalMax: 20, AttackRateBase: 1.5, CritChanceBase: 5 },
      sourceQuality: 0,
    },
  )
  const config = goals()
  config.panelGoals = [
    { kind: 'item-property', property: 'physicalDps', min: 40 },
    { kind: 'item-property', property: 'elementalResistance', min: 50 },
  ]
  const result = planTargetDefinitionRoutes(c, item(), config)
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(result.value.candidateApplications).toBeLessThanOrEqual(4096)
  expect(result.value.truncated).toBe(true)
  for (const route of result.value.routes)
    expect(evaluateCraftPanelGoals(c, route.finalState, config.panelGoals).satisfied).toBe(true)
})

it('起点已达成面板受 preserveMatched 保护且预算截断可见', () => {
  const c = catalog(
    [
      mod('old', 'prefix', {
        group: 'LocalPhysicalDamageReductionRating',
        lines: ['+(30-30) to Armour'],
      }),
      mod('new', 'prefix', {
        group: 'LocalPhysicalDamageReductionRating',
        lines: ['+(50-50) to Armour'],
      }),
    ],
    { type: 'Helmet', properties: { Armour: 18 }, sourceQuality: 0 },
  )
  const initial = {
    ...item(),
    rarity: 'rare' as const,
    affixes: [{ modId: 'old', lines: ['+30 to Armour'] }],
  }
  const config: CraftTargetDefinitions = {
    ...goals(),
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'new' }],
  }
  const protectedResult = planTargetDefinitionRoutes(c, initial, config, { maxStates: 8 })
  if (!protectedResult.ok) throw Error(protectedResult.error)
  expect(protectedResult.value.routes.length).toBeGreaterThan(0)
  for (const route of protectedResult.value.routes)
    for (const step of route.steps)
      expect(evaluateCraftPanelGoals(c, step.state, config.panelGoals ?? []).satisfied).toBe(true)
  const budget = planTargetDefinitionRoutes(data(), item(), goals(), { maxStates: 1, maxDepth: 1 })
  if (!budget.ok) throw Error(budget.error)
  expect(budget.value.examinedStates).toBeLessThanOrEqual(1)
  expect(budget.value.candidateApplications).toBeLessThanOrEqual(4096)
})

it('没有即时面板收益的魔法准备仍可接精华达成', () => {
  const c = data()
  c._meta.sources.push({ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' })
  const armour = c.modifiers[0]
  if (!armour) throw Error('缺少护甲词缀')
  armour.eligibility = [{ tag: 'default', value: 0 }]
  c.modifiers.push(mod('filler', 'suffix', { lines: ['+(1-2) to maximum Mana'] }))
  c.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyLesserEssenceDefence',
      name: 'Lesser Essence of Defence',
      type: 'Defence',
      tierLevel: 1,
      mods: { Helmet: 'armour' },
    },
  ]
  const result = planTargetDefinitionRoutes(c, item(), goals())
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(
    result.value.routes.some((route) =>
      route.steps.some(({ operation }) => 'kind' in operation && operation.kind === 'essence'),
    ),
  ).toBe(true)
})

it('纯面板沿同一报价排序且完整未知价不会当成零', () => {
  const c = data()
  const armour = c.modifiers[0]
  if (!armour) throw Error('缺少护甲词缀')
  armour.level = 70
  armour.lines = ['+(30-30) to Armour']
  const result = planTargetDefinitionRoutes(c, item(), goals(), {
    maxStates: 1,
    maxDepth: 1,
    pricing: {
      unit: 'divine',
      baseCost: 0,
      prices: { 'currency:transmutation': 10, 'currency:greater_transmutation': 1 },
    },
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes[0]?.steps[0]?.operation).toMatchObject({
    currency: 'greater_transmutation',
  })
  expect(result.value.truncated).toBe(true)
})

it('仅待揭示导致的未知面板允许真实揭示推进', () => {
  const c = boneCatalog()
  const pending = {
    ...boneState(['prefix1']),
    pendingDesecration: { boneId: 'gnawed_rib' as const, kind: 'suffix' as const },
  }
  const config = goals()
  config.panelGoals = [{ kind: 'item-property', property: 'fireResistance', min: 0 }]
  const result = planTargetDefinitionRoutes(c, pending, config)
  if (!result.ok) throw Error(result.error)
  expect(result.value.alreadyMatched).toBe(false)
  expect(result.value.routes.length).toBeGreaterThan(0)
  for (const route of result.value.routes) {
    expect(route.finalState.pendingDesecration).toBeUndefined()
    expect(evaluateCraftPanelGoals(c, route.finalState, config.panelGoals).satisfied).toBe(true)
  }
})

it('加权合计在完整状态判断，神圣代表值落入双向闭区间', () => {
  const c = data()
  const initial = {
    ...item(),
    rarity: 'rare' as const,
    affixes: [{ modId: 'armour', lines: ['+10 to Armour'] }],
  }
  const config = goals()
  config.panelGoals = [
    { kind: 'weighted-properties', terms: [{ property: 'Armour', weight: 2 }], min: 80, max: 80 },
  ]
  const result = planTargetDefinitionRoutes(c, initial, config, {
    maxDepth: 1,
    maxStates: 1,
    pricing: { unit: 'divine', baseCost: 0, prices: { 'currency:divine': 1 } },
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(
    result.value.routes.some((route) =>
      route.steps.some(
        ({ operation }) => 'currency' in operation && operation.currency === 'divine',
      ),
    ),
  ).toBe(true)
  for (const route of result.value.routes)
    expect(evaluateCraftPanelGoals(c, route.finalState, config.panelGoals).satisfied).toBe(true)
})
