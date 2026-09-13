import { expect, it } from 'vitest'
import { beltCatalog, beltState } from './beltTestFixture'
import { collectCraftCosts } from './craftCosts'
import { catalog, state } from './partialTargetFixture'
import { applyCraftOperation, prepareCraftOperation } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const fixture = () => ({
  cat: catalog(undefined, { implicit: '(1-10)% rarity' }),
  item: { ...state('rare', ['p1', 's1']), implicitLines: ['2% rarity'] },
})
it('祝福只改变固有数值，显式及破裂数值保留，按实际材料计费', () => {
  const { cat, item } = fixture()
  const first = item.affixes[0]
  if (!first) throw new Error('缺少词缀')
  item.affixes[0] = { ...first, fractured: true }
  const operation = {
    currency: 'divine' as const,
    omen: 'blessed' as const,
    modIds: [],
    implicitValues: [9],
  }
  const result = applyCraftOperation(cat, item, operation)
  expect(result).toMatchObject({
    ok: true,
    value: { implicitLines: ['9(1-10)% rarity'], affixes: item.affixes },
  })
  expect(item.implicitLines).toEqual(['2% rarity'])
  expect(collectCraftCosts(cat, [operation])).toMatchObject({
    ok: true,
    value: expect.arrayContaining([
      { id: 'currency:divine', name: '神圣石', count: 1 },
      { id: 'omen:Omen of the Blessed', name: 'Omen of the Blessed', count: 1 },
    ]),
  })
  expect(
    applyCraftOperation(cat, item, { ...operation, rolls: [{ modId: 's1', values: [10] }] }).ok,
  ).toBe(false)
  expect(prepareCraftOperation(cat, item, 'exalted', undefined, 'blessed').ok).toBe(false)
})
it('仅有显式范围不能开始祝福，固有范围越界也拒绝', () => {
  const { cat, item } = fixture()
  expect(
    prepareCraftOperation(catalog(), state('rare', ['p1']), 'divine', undefined, 'blessed').ok,
  ).toBe(false)
  expect(
    applyCraftOperation(cat, item, {
      currency: 'divine',
      omen: 'blessed',
      modIds: [],
      implicitValues: [11],
    }).ok,
  ).toBe(false)
})
it('固有目标可推荐祝福，显式目标不标为重掷；只有显式缺口时不推荐', () => {
  const { cat, item } = fixture()
  const goals = [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }]
  const advice = analyzeCraftTargets(cat, item, ['p1'], [], [], 'blessed', goals)
  expect(advice).toMatchObject({
    ok: true,
    value: {
      steps: expect.arrayContaining([
        {
          currency: 'divine',
          omen: 'blessed',
          targetModIds: [],
          rerolledTargetIds: [],
          lostTargetIds: [],
          randomRemovalRisk: false,
          clearsAll: false,
          remainingChoices: 0,
          targetImplicitLineIndexes: [0],
          rerolledImplicitLineIndexes: [0],
        },
      ]),
    },
  })
  const explicit = analyzeCraftTargets(
    cat,
    item,
    ['p1'],
    [{ modId: 'p1', bounds: [{ index: 0, min: 9 }] }],
    [],
    'blessed',
  )
  expect(explicit.ok && explicit.value.steps).toEqual([])
  const routes = planCraftTargetRoutes(cat, item, ['p1'], [], [], {}, goals)
  expect(routes.ok).toBe(true)
  if (!routes.ok) throw new Error(routes.error)
  const blessed = routes.value.routes
    .flatMap((route) => route.steps)
    .find((step) => 'currency' in step.operation && step.operation.omen === 'blessed')
  expect(blessed?.rerolledTargetIds).toEqual([])
  expect(blessed?.state.affixes).toEqual(item.affixes)
})

it('祝福不会绕过授予技能范围或未知腰带咒符范围的门禁', () => {
  const cat = catalog(undefined, {
    implicit: 'Grants Skill: Level (1-20) Test Skill\n(1-10)% rarity',
  })
  const item = {
    ...state('rare', ['p1']),
    implicitLines: ['Grants Skill: Level 10 Test Skill', '2% rarity'],
  }
  expect(prepareCraftOperation(cat, item, 'divine', undefined, 'blessed')).toMatchObject({
    ok: false,
    error: expect.stringContaining('授予技能'),
  })
  const belt = beltCatalog()
  const unknown = {
    ...beltState(80),
    implicitLines: ['Has 2 Charm Slots', '15(10-20)% increased Flask Charges gained'],
  }
  expect(prepareCraftOperation(belt, unknown, 'divine', undefined, 'blessed').ok).toBe(false)
})

it('替代档位已达数值目标时，路线同终点比较优先保留显式数值', () => {
  const { cat } = fixture()
  const item = { ...state('rare', ['high']), itemLevel: 90, implicitLines: ['2% rarity'] }
  item.affixes[0] = { modId: 'high', lines: ['high 5(1-10)'] }
  const result = planCraftTargetRoutes(
    cat,
    item,
    ['p1'],
    [{ modId: 'high', bounds: [{ index: 0, min: 5 }] }],
    [{ targetModId: 'p1', modIds: ['high'] }],
    {
      pricing: {
        unit: 'divine',
        baseCost: 0,
        prices: { 'currency:divine': 1, 'omen:Omen of the Blessed': 0 },
      },
    },
    [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }],
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.value.routes[0]?.steps[0]?.operation).toMatchObject({
    currency: 'divine',
    omen: 'blessed',
  })
})

it('无整数解的固有目标不会借显式缺口给出空祝福建议', () => {
  const { cat, item } = fixture()
  const result = analyzeCraftTargets(
    cat,
    item,
    ['p1'],
    [{ modId: 'p1', bounds: [{ index: 0, min: 9 }] }],
    [],
    'blessed',
    [{ lineIndex: 0, bounds: [{ index: 0, min: 5.5, max: 5.5 }] }],
  )
  expect(result.ok && result.value.steps).toEqual([])
})
it('没有可保护的显式词缀时自动路线省下祝福预兆', () => {
  const { cat } = fixture()
  const result = planCraftTargetRoutes(
    cat,
    { ...state('normal'), implicitLines: ['2% rarity'] },
    [],
    [],
    [],
    {},
    [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }],
  )
  if (!result.ok) throw new Error(result.error)
  expect(result.value.routes[0]?.steps[0]?.operation).toMatchObject({ currency: 'divine' })
  expect(result.value.routes[0]?.steps[0]?.operation).not.toHaveProperty('omen')
})
