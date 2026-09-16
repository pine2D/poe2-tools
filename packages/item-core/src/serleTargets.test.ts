import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { addCraftAffix, type CraftResult, type CraftState, craftCandidates } from './rehearsal'
import { editTargetDefinitionContext, readTargetDefinitionContext } from './targetDefinitionContext'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import {
  analyzeAlloyTargetDefinitions,
  analyzeBoneTargetDefinitions,
  analyzeEssencePreparationDefinitions,
  analyzeEssenceTargetDefinitions,
} from './targetDefinitionSpecialAdvice'
import { validateTargetDefinitions } from './targetDefinitions'
import { extractTargetDefinitions } from './targetExtraction'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
function must<T>(r: CraftResult<T>): T {
  if (!r.ok) throw Error(r.error)
  return r.value
}
function full(): CraftState {
  let state: CraftState = {
    baseId: 'Twig Focus',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    sockets: [null],
    affixes: [],
  }
  state = must(
    applyCraftStep(catalog, state, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'pob2:augment:["Serle\u0027s Triumph","armour"]',
    }),
  )
  for (const kind of [
    'prefix',
    'prefix',
    'prefix',
    'suffix',
    'suffix',
    'suffix',
    'suffix',
  ] as const) {
    const mod = craftCandidates(catalog, state).find((m) => m.kind === kind)
    if (!mod) throw Error('候选缺失')
    state = must(addCraftAffix(catalog, state, mod.id))
  }
  return state
}
it('七组装备提取目标、编辑、持久化上下文和匹配保留Serle来源', () => {
  const state = full()
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      state,
      state.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  expect(definitions.targets).toHaveLength(7)
  expect(validateTargetDefinitions(catalog, state, definitions).ok).toBe(true)
  const context = { definitions, orphanedTargets: [] }
  expect(readTargetDefinitionContext(catalog, state.baseId, context, state).ok).toBe(true)
  expect(
    editTargetDefinitionContext(catalog, state, context, { kind: 'minimum', count: 7 }).ok,
  ).toBe(true)
  expect(readTargetDefinitionContext(catalog, state.baseId, context).ok).toBe(false)
})
it('已有腐化Serle第三孔的容量上下文不丢失腐化孔资格', () => {
  const state = {
    ...full(),
    corrupted: true as const,
    sockets: ['pob2:augment:["Serle\u0027s Triumph","armour"]', null, null],
  }
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      state,
      state.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  expect(
    readTargetDefinitionContext(catalog, state.baseId, { definitions, orphanedTargets: [] }, state)
      .ok,
  ).toBe(true)
})

it.each([false, true])('七目标路线从真实当前态准备容量并逐步可回放（需打孔=%s）', (needsSocket) => {
  const capacity = full()
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      capacity,
      capacity.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  const state: CraftState = {
    ...capacity,
    affixes: capacity.affixes.slice(0, 6),
    sockets: needsSocket ? [] : [null],
  }
  const before = structuredClone(state)
  const result = must(
    planTargetDefinitionRoutes(
      catalog,
      state,
      definitions,
      { maxStates: 32, maxDepth: 4 },
      [],
      capacity,
    ),
  )
  expect(result.routes.length).toBeGreaterThan(0)
  for (const route of result.routes) {
    let current = state
    for (const step of route.steps) {
      current = must(applyCraftStep(catalog, current, step.operation))
      expect(current).toEqual(step.state)
    }
    expect(current.affixes).toHaveLength(7)
    const costs = must(
      collectCraftCosts(
        catalog,
        route.steps.map((step) => step.operation),
      ),
    )
    expect(costs.find((entry) => entry.name === "Serle's Triumph")?.count).toBe(1)
    expect(costs.find((entry) => entry.id === 'currency:artificer')?.count ?? 0).toBe(
      needsSocket ? 1 : 0,
    )
    expect(route.steps[needsSocket ? 1 : 0]?.operation).toMatchObject({ kind: 'socket' })
    if (needsSocket) expect(route.steps[0]?.operation).toEqual({ kind: 'artificer' })
    expect(route.steps.every((step) => step.lostTargetIds.length === 0)).toBe(true)
  }
  expect(state).toEqual(before)
  expect(planTargetDefinitionRoutes(catalog, state, definitions).ok).toBe(false)
})

it('未来容量只授权目标组合，特殊建议仍按当前容量执行', () => {
  const capacity = full()
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      capacity,
      capacity.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  const state: CraftState = { ...capacity, affixes: capacity.affixes.slice(0, 6), sockets: [null] }
  for (const analyze of [
    analyzeBoneTargetDefinitions,
    analyzeAlloyTargetDefinitions,
    analyzeEssenceTargetDefinitions,
  ]) {
    const result = analyze(catalog, state, definitions, capacity)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('特殊建议未通过目标校验')
    for (const step of result.value)
      expect(applyCraftStep(catalog, state, step.operation).ok).toBe(true)
  }
  expect(analyzeEssencePreparationDefinitions(catalog, state, definitions, capacity).ok).toBe(true)
})

it.each(['unknown', 'occupied', 'corrupted'] as const)(
  '路线容量准备不绕过当前孔位限制：%s',
  (mode) => {
    const capacity = full()
    const definitions = must(
      extractTargetDefinitions(
        catalog,
        capacity,
        capacity.affixes.map((a) => a.modId),
        false,
        false,
      ),
    )
    const state: CraftState = {
      ...capacity,
      affixes: capacity.affixes.slice(0, 6),
      sockets: [null],
    }
    if (mode === 'unknown') delete state.sockets
    if (mode === 'occupied') state.sockets = ['pob2:augment:["Iron Rune","armour"]']
    if (mode === 'corrupted') state.corrupted = true
    const result = must(
      planTargetDefinitionRoutes(
        catalog,
        state,
        definitions,
        { maxStates: 4, maxDepth: 3 },
        [],
        capacity,
      ),
    )
    expect(result.routes).toEqual([])
  },
)
it('无有效容量来源不能授权七目标路线', () => {
  const capacity = full()
  const definitions = must(
    extractTargetDefinitions(
      catalog,
      capacity,
      capacity.affixes.map((a) => a.modId),
      false,
      false,
    ),
  )
  const state = { ...capacity, affixes: capacity.affixes.slice(0, 6), sockets: [null] }
  expect(
    planTargetDefinitionRoutes(catalog, state, definitions, {}, [], {
      ...capacity,
      sockets: [null],
    }).ok,
  ).toBe(false)
})
