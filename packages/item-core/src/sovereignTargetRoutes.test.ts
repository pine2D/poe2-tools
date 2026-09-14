import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { analyzeAlloyTargets } from './alloyAdvice'
import { alloyTestFixture } from './alloyTestFixture'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import type { CraftState } from './rehearsal'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets, type CraftTargetValues } from './targets'

const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const material = 'Metadata/Items/Currency/CurrencyVerisiumAlloy9'
const effectId = 'AlloyEffectOfResistanceMods1'
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19 to maximum Life'] },
    { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
  ],
}
const effective = (modId: string, min: number, max?: number): CraftTargetValues => ({
  modId,
  basis: 'effective',
  bounds: [{ index: 0, min, ...(max === undefined ? {} : { max }) }],
})

it('只选普通火抗有效值时主动推荐君王合金，取整后完整结果达到11', () => {
  const goal = [effective('FireResist1', 11, 11)]
  const advice = analyzeAlloyTargets(catalog, state, ['FireResist1'], goal)
  if (!advice.ok) throw Error(advice.error)
  expect(advice.value.length).toBeGreaterThan(0)
  for (const step of advice.value) {
    expect(step.operation).toMatchObject({ alloyId: material, removeModId: 'IncreasedLife1' })
    expect(step.operation.values[0]).toBeGreaterThanOrEqual(23)
    expect(step.atRiskTargetIds).toEqual(['FireResist1'])
    const applied = applyCraftStep(catalog, state, step.operation)
    if (!applied.ok) throw Error(applied.error)
    expect(analyzeCraftTargets(catalog, applied.value, ['FireResist1'], goal)).toMatchObject({
      ok: true,
      value: { targets: [{ matched: true }] },
    })
  }
})

it('催化品质与君王增效相加，非抗性、基础口径、缺来源及已达成不生成辅助合金', () => {
  const catalyst = { ...state, catalyst: { id: "Xoph's" as const, quality: 20 } }
  const advice = analyzeAlloyTargets(
    catalog,
    catalyst,
    ['FireResist1'],
    [effective('FireResist1', 13)],
  )
  if (!advice.ok) throw Error(advice.error)
  expect(advice.value[0]?.operation.values).toEqual([25])
  for (const [data, current, id, goal] of [
    [
      catalog,
      state,
      'FireResist1',
      { modId: 'FireResist1', bounds: [{ index: 0, min: 10 }] } as CraftTargetValues,
    ],
    [catalog, state, 'IncreasedLife1', effective('IncreasedLife1', 20)],
    [primary, state, 'FireResist1', effective('FireResist1', 11)],
    [{ ...catalog, scalability: undefined }, state, 'FireResist1', effective('FireResist1', 11)],
    [catalog, state, 'FireResist1', effective('FireResist1', 9)],
  ] as const) {
    expect(analyzeAlloyTargets(data as CraftCatalog, current, [id], [goal])).toMatchObject({
      ok: true,
      value: [],
    })
  }
})

it('OR实际档位受到增效；数值上限损失列入风险，预算耗尽不回放', () => {
  const current = {
    ...state,
    affixes: [...state.affixes, { modId: 'ColdResist1', lines: ['+10% to Cold Resistance'] }],
  }
  const ids = ['FireResist2', 'ColdResist1']
  const goals = [effective('FireResist1', 11), effective('ColdResist1', 10, 10)]
  const alternatives = [{ targetModId: 'FireResist2', modIds: ['FireResist1'] }]
  const advice = analyzeAlloyTargets(catalog, current, ids, goals, alternatives)
  if (!advice.ok) throw Error(advice.error)
  expect(advice.value.length).toBeGreaterThan(0)
  const kept = advice.value.find((step) => step.operation.removeModId === 'IncreasedLife1')
  expect(kept?.lostTargetIds).toContain('ColdResist1')
  expect(kept?.atRiskTargetIds).toEqual(['FireResist1', 'ColdResist1'])
  expect(
    analyzeAlloyTargets(catalog, state, ['FireResist1'], [effective('FireResist1', 11)], [], {
      consumeCandidate: () => false,
    }),
  ).toEqual({ ok: true, value: [] })
  const routes = planCraftTargetRoutes(catalog, current, ids, goals, alternatives, {
    maxDepth: 1,
    maxStates: 4,
  })
  expect(routes).toMatchObject({ ok: true, value: { routes: [] } })
})

it('破裂火抗基础9不可重掷，可通过合金的真实牺牲组达成有效11', () => {
  const current = {
    ...state,
    affixes: state.affixes.map((affix) =>
      affix.modId === 'FireResist1' ? { ...affix, fractured: true as const } : affix,
    ),
  }
  const routes = planCraftTargetRoutes(
    catalog,
    current,
    ['FireResist1'],
    [effective('FireResist1', 11)],
    [],
    { maxDepth: 1, maxStates: 8 },
  )
  if (!routes.ok) throw Error(routes.error)
  expect(routes.value.routes.length).toBeGreaterThan(0)
  expect(routes.value.routes[0]?.steps[0]?.operation).toMatchObject({
    kind: 'alloy',
    alloyId: material,
  })
  expect(routes.value.routes[0]?.steps[0]?.atRiskTargetIds).toEqual([])
})

it('部分达成可以跳过不可达君王自身目标，仍增效破裂火抗', () => {
  const current: CraftState = {
    ...state,
    affixes: state.affixes.map((affix) =>
      affix.modId === 'FireResist1' ? { ...affix, fractured: true } : affix,
    ),
  }
  const ids = ['FireResist1', effectId]
  const goals = [effective('FireResist1', 11), effective(effectId, 31)]
  const advice = analyzeAlloyTargets(catalog, current, ids, goals, [], { minimumTargetCount: 1 })
  if (!advice.ok) throw Error(advice.error)
  expect(advice.value.some((step) => step.matchedTargetIds.includes('FireResist1'))).toBe(true)
  const routes = planCraftTargetRoutes(catalog, current, ids, goals, [], {
    minimumTargetCount: 1,
    maxDepth: 1,
    maxStates: 4,
  })
  if (!routes.ok) throw Error(routes.error)
  expect(routes.value.routes.length).toBeGreaterThan(0)
})

it('从空白普通戒指生成真实升级、牺牲和君王增效路线，所有步骤可重新规划', () => {
  const initial: CraftState = { ...state, rarity: 'normal', affixes: [] }
  const goals = [effective('FireResist1', 13, 13)]
  const result = planCraftTargetRoutes(catalog, initial, ['FireResist1'], goals, [], {
    maxDepth: 6,
    maxStates: 64,
  })
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  const route = result.value.routes[0]
  if (!route) throw Error('缺少路线')
  expect(
    route.steps.some((step) => 'kind' in step.operation && step.operation.kind === 'alloy'),
  ).toBe(true)
  let current = initial
  for (const step of route.steps) {
    const applied = applyCraftStep(catalog, current, step.operation)
    if (!applied.ok) throw Error(applied.error)
    current = applied.value
  }
  expect(analyzeCraftTargets(catalog, current, ['FireResist1'], goals)).toMatchObject({
    ok: true,
    value: { targets: [{ matched: true }] },
  })
  for (const step of route.steps.slice(0, -1)) {
    const next = planCraftTargetRoutes(catalog, step.state, ['FireResist1'], goals, [], {
      maxDepth: 6,
      maxStates: 64,
    })
    expect(next).toMatchObject({ ok: true })
    if (next.ok) expect(next.value.routes.length).toBeGreaterThan(0)
  }
})

it('已有君王20时神圣联合重掷至30和基础火抗10，保留破裂和上限', () => {
  const current: CraftState = {
    ...state,
    affixes: [
      {
        modId: effectId,
        crafted: true,
        lines: ['20(20-30)% increased Explicit Resistance Modifier magnitudes'],
      },
      { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
      { modId: 'ColdResist1', fractured: true, lines: ['+8% to Cold Resistance'] },
    ],
  }
  const ids = ['FireResist1', 'ColdResist1']
  const goals = [effective('FireResist1', 13, 13), effective('ColdResist1', 9, 10)]
  const routes = planCraftTargetRoutes(catalog, current, ids, goals, [], {
    maxDepth: 1,
    maxStates: 4,
  })
  if (!routes.ok) throw Error(routes.error)
  const route = routes.value.routes[0]
  expect(route).toBeDefined()
  expect(route?.steps[0]?.operation).toMatchObject({
    currency: 'divine',
    rolls: expect.arrayContaining([
      { modId: effectId, values: [30] },
      { modId: 'FireResist1', values: [10] },
    ]),
  })
  expect(route?.finalState.affixes.find((affix) => affix.modId === 'ColdResist1')).toEqual(
    current.affixes[2],
  )
})

it('多个有效值上下限共用同一最终增效，准备数值不能各自选择不同倍率', () => {
  const initial: CraftState = { ...state, rarity: 'normal', affixes: [] }
  const ids = ['FireResist1', 'ColdResist1']
  const goals = [effective('FireResist1', 13, 13), effective('ColdResist1', 9, 9)]
  const result = planCraftTargetRoutes(catalog, initial, ids, goals, [], {
    maxDepth: 6,
    maxStates: 64,
  })
  if (!result.ok) throw Error(result.error)
  const route = result.value.routes[0]
  expect(route).toBeDefined()
  if (!route) return
  expect(route.finalState.affixes.find((affix) => affix.modId === effectId)?.lines[0]).toContain(
    '30',
  )
  expect(analyzeCraftTargets(catalog, route.finalState, ids, goals)).toMatchObject({
    ok: true,
    value: { targets: [{ matched: true }, { matched: true }] },
  })
  for (const step of route.steps.slice(0, -1)) {
    const next = planCraftTargetRoutes(catalog, step.state, ids, goals, [], {
      maxDepth: 6,
      maxStates: 64,
    })
    if (!next.ok) throw Error(next.error)
    expect(next.value.routes.length).toBeGreaterThan(0)
  }
}, 20000)
