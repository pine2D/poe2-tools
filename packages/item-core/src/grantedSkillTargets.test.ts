import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { type DefinitionCraftStrategy, evaluateDefinitionCraftStrategy } from './definitionStrategy'
import {
  analyzeCraftImplicitTargets,
  craftImplicitTargetCandidates,
  validateCraftImplicitTargets,
} from './implicitTargets'
import { analyzeTargetDefinitions } from './targetDefinitionAdvice'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const catalog = boneCatalog('Sceptre')
required(catalog.bases[0]).implicit = 'Grants Skill: Level (1-20) Test Minion'
const state = {
  ...boneState([]),
  implicitLines: ['Grants Skill: Level 12 Test Minion (Max Level 13)'],
}
const goal = [{ kind: 'granted-skill' as const, lineIndex: 0, bounds: [{ index: 0, min: 20 }] }]
it('技能目标读取装备最高13，提供20唯一结果和真实原最高等级路线', () => {
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: [
      { kind: 'granted-skill', actual: [13] },
      { kind: 'granted-skill-sockets', actual: [null] },
    ],
  })
  expect(analyzeCraftImplicitTargets(catalog, state, goal)).toMatchObject({
    ok: true,
    value: [{ matched: false, numeric: [{ actual: 13 }] }],
  })
  const advice = analyzeCraftTargets(catalog, state, [], [], [], undefined, goal)
  expect(advice).toMatchObject({
    ok: true,
    value: { perfectFluxOperation: { kind: 'perfect-flux', previousMaxLevel: 13 } },
  })
  const route = planCraftTargetRoutes(
    catalog,
    state,
    [],
    [],
    [],
    { maxDepth: 1, maxStates: 8 },
    goal,
  )
  expect(route).toMatchObject({
    ok: true,
    value: {
      alreadyMatched: false,
      routes: [
        {
          steps: [{ operation: { kind: 'perfect-flux', previousMaxLevel: 13 } }],
          finalState: { grantedSkillLevel: 20 },
        },
      ],
    },
  })
})
it('未知最高等级不猜，不把显示等级当作实际值', () => {
  const unknown = { ...state, implicitLines: ['Grants Skill: Level 12 Test Minion'] }
  expect(analyzeCraftImplicitTargets(catalog, unknown, goal)).toMatchObject({
    ok: true,
    value: [{ matched: false, numeric: [{ actual: null }] }],
  })
  expect(
    planCraftTargetRoutes(catalog, unknown, [], [], [], { maxDepth: 1, maxStates: 8 }, goal),
  ).toMatchObject({ ok: true, value: { routes: [] } })
})
it('技能目标强制语义、整数、index0、目录范围且拒绝effective', () => {
  for (const invalid of [
    [{ lineIndex: 0, bounds: [{ index: 0, min: 20 }] }],
    [{ ...goal[0], basis: 'effective' }],
    [{ ...goal[0], bounds: [{ index: 0, min: 13.5 }] }],
    [{ ...goal[0], bounds: [{ index: 1, min: 20 }] }],
    [{ ...goal[0], bounds: [{ index: 0, min: 21 }] }],
  ])
    expect(validateCraftImplicitTargets(catalog, state.baseId, invalid, state).ok).toBe(false)
})
it('已20不重复消费，低于20的上界不建议升级，神圣保留技能原文', () => {
  const upgraded = applyCraftStep(catalog, state, { kind: 'perfect-flux', previousMaxLevel: 13 })
  if (!upgraded.ok) throw Error(upgraded.error)
  expect(
    planCraftTargetRoutes(catalog, upgraded.value, [], [], [], { maxDepth: 1 }, goal),
  ).toMatchObject({ ok: true, value: { alreadyMatched: true, routes: [] } })
  expect(
    planCraftTargetRoutes(catalog, state, [], [], [], { maxDepth: 1, maxStates: 8 }, [
      { ...required(goal[0]), bounds: [{ index: 0, min: 14, max: 19 }] },
    ]),
  ).toMatchObject({ ok: true, value: { routes: [] } })
})

it('技能和显式目标必须完整达成，完美溶剂只计一次费用', () => {
  const route = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix1'],
    [],
    [],
    { maxDepth: 2, maxStates: 12 },
    goal,
  )
  if (!route.ok) throw Error(route.error)
  expect(route.value.routes.length).toBeGreaterThan(0)
  const selected = required(route.value.routes[0])
  expect(selected.finalState.grantedSkillLevel).toBe(20)
  expect(selected.finalState.affixes.some((entry) => entry.modId === 'prefix1')).toBe(true)
  expect(
    selected.steps.filter(
      (step) => 'kind' in step.operation && step.operation.kind === 'perfect-flux',
    ),
  ).toHaveLength(1)
  expect(
    collectCraftCosts(
      catalog,
      selected.steps.map((step) => step.operation),
    ),
  ).toMatchObject({
    ok: true,
    value: expect.arrayContaining([
      { id: 'currency:perfect-flux', name: 'Perfect Flux', count: 1 },
    ]),
  })
})
it('待揭示状态先完成揭示再升级技能，不以隐藏占位当终点', () => {
  const pending = {
    ...state,
    pendingDesecration: {
      boneId: 'preserved_jawbone' as const,
      kind: 'suffix' as const,
      options: ['exclusive1', 'exclusive2', 'exclusive3'],
    },
  }
  expect(analyzeCraftTargets(catalog, pending, [], [], [], undefined, goal)).not.toHaveProperty(
    'value.perfectFluxOperation',
  )
  const route = planCraftTargetRoutes(
    catalog,
    pending,
    [],
    [],
    [],
    { maxDepth: 2, maxStates: 12 },
    goal,
  )
  if (!route.ok) throw Error(route.error)
  expect(route.value.routes.length).toBeGreaterThan(0)
  expect(route.value.routes[0]?.finalState).not.toHaveProperty('pendingDesecration')
  expect(route.value.routes[0]?.finalState.grantedSkillLevel).toBe(20)
})
it('腐化、破坏和额外技能继续沿完美溶剂门禁，不会发出操作', () => {
  for (const blocked of [
    { ...state, corrupted: true as const },
    { ...state, destroyed: true as const },
  ]) {
    const advice = analyzeCraftTargets(catalog, blocked, [], [], [], undefined, goal)
    expect(advice).not.toHaveProperty('value.perfectFluxOperation')
  }
  const extraCatalog = structuredClone(catalog)
  required(extraCatalog.modifiers[0]).lines = ['Grants Skill: Extra Minion']
  const extra = { ...state, affixes: [{ modId: 'prefix1', lines: ['Grants Skill: Extra Minion'] }] }
  expect(analyzeCraftTargets(extraCatalog, extra, [], [], [], undefined, goal)).not.toHaveProperty(
    'value.perfectFluxOperation',
  )
})
it('拒绝技能目标getter和普通数值行冒充技能，普通神圣不升级技能', () => {
  let calls = 0
  const hostile = {
    lineIndex: 0,
    bounds: [{ index: 0, min: 20 }],
    get kind() {
      calls++
      return 'granted-skill'
    },
  }
  expect(validateCraftImplicitTargets(catalog, state.baseId, [hostile], state).ok).toBe(false)
  expect(calls).toBe(0)
  const ordinary = boneCatalog()
  required(ordinary.bases[0]).implicit = '+(1-20) to maximum Mana'
  expect(validateCraftImplicitTargets(ordinary, state.baseId, goal).ok).toBe(false)
  expect(
    applyCraftStep(catalog, state, { currency: 'divine', modIds: [], implicitValues: [20] }).ok,
  ).toBe(false)
  expect(state.implicitLines).toEqual(['Grants Skill: Level 12 Test Minion (Max Level 13)'])
})

it('独立目标定义共用建议、完整路线和技能保护上界', () => {
  const definitions = {
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'prefix1' }],
    alternatives: [],
    values: [],
  }
  expect(analyzeTargetDefinitions(catalog, state, definitions, undefined, goal)).toMatchObject({
    ok: true,
    value: { perfectFluxOperation: { kind: 'perfect-flux', previousMaxLevel: 13 } },
  })
  const route = planTargetDefinitionRoutes(
    catalog,
    state,
    definitions,
    { maxDepth: 2, maxStates: 12 },
    goal,
  )
  if (!route.ok) throw Error(route.error)
  expect(route.value.routes.length).toBeGreaterThan(0)
  expect(route.value.routes[0]?.finalState.grantedSkillLevel).toBe(20)
  const protect = [{ ...required(goal[0]), bounds: [{ index: 0, max: 13 }] }]
  const protectedRoute = planTargetDefinitionRoutes(
    catalog,
    state,
    definitions,
    { maxDepth: 1, maxStates: 8 },
    protect,
  )
  if (!protectedRoute.ok) throw Error(protectedRoute.error)
  expect(protectedRoute.value.routes.length).toBeGreaterThan(0)
  for (const found of protectedRoute.value.routes)
    expect(found.finalState.grantedSkillLevel).toBeUndefined()
})
it('支持三种既有武器，拒绝多技能、额外目录技能、无等级和不支持基底', () => {
  for (const type of ['Wand', 'Staff', 'Sceptre', 'Helmet']) {
    const changed = structuredClone(catalog)
    required(changed.bases[0]).type = type
    expect(validateCraftImplicitTargets(changed, state.baseId, goal).ok).toBe(type !== 'Helmet')
  }
  for (const line of [
    'Grants Skill: Level (1-20) Other',
    'Grants Skill: Other',
    'Grants Extra Skill: Other',
  ]) {
    const changed = structuredClone(catalog)
    required(changed.bases[0]).implicit += `\n${line}`
    expect(validateCraftImplicitTargets(changed, state.baseId, goal).ok).toBe(false)
  }
})

it('纯技能目标的targets-met不会因显式目标为空提前止步，升级后才停止', () => {
  const strategy: DefinitionCraftStrategy & CraftStrategy = {
    maxSteps: 3,
    rules: [
      { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
      { conditions: [{ kind: 'always' }], action: { kind: 'perfect-flux', previousMaxLevel: 13 } },
    ],
  }
  const context = {
    definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    targetImplicitValues: goal,
  }
  expect(evaluateDefinitionCraftStrategy(catalog, state, strategy, 0, context)).toMatchObject({
    ok: true,
    value: { kind: 'action', action: { kind: 'perfect-flux', previousMaxLevel: 13 } },
  })
  const applied = applyCraftStep(catalog, state, { kind: 'perfect-flux', previousMaxLevel: 13 })
  if (!applied.ok) throw Error(applied.error)
  expect(
    evaluateDefinitionCraftStrategy(catalog, applied.value, strategy, 1, context),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  const legacy = { targetModIds: [], targetImplicitValues: goal }
  expect(evaluateCraftStrategy(catalog, state, strategy, 0, legacy)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
  expect(evaluateCraftStrategy(catalog, applied.value, strategy, 1, legacy)).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
})
