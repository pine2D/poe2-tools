import { expect, it } from 'vitest'
import { required } from './beltTestFixture'
import { boneCatalog, boneState } from './boneTestFixture'
import { craftStateSemanticKey } from './craftStateSemanticKey'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import {
  analyzeCraftImplicitTargets,
  craftImplicitTargetCandidates,
  readCraftImplicitTargets,
  validateCraftImplicitTargets,
} from './implicitTargets'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const catalog = boneCatalog('Sceptre')
required(catalog.bases[0]).implicit = 'Grants Skill: Level (1-20) Test Minion'
const state = {
  ...boneState([]),
  implicitLines: ['Grants Skill: Level 12 Test Minion (Max Level 13)'],
  declaredSkillSockets: 3 as const,
}
const sockets = {
  kind: 'granted-skill-sockets' as const,
  lineIndex: 0,
  bounds: [{ index: 0, min: 4 }],
}
const level = { kind: 'granted-skill' as const, lineIndex: 0, bounds: [{ index: 0, min: 20 }] }

it('同一技能等级与辅助孔目标独立校验、候选和判定', () => {
  expect(validateCraftImplicitTargets(catalog, state.baseId, [level, sockets], state).ok).toBe(true)
  expect(craftImplicitTargetCandidates(catalog, state)).toMatchObject({
    ok: true,
    value: [
      { kind: 'granted-skill', actual: [13] },
      { kind: 'granted-skill-sockets', actual: [3] },
    ],
  })
  expect(analyzeCraftImplicitTargets(catalog, state, [level, sockets])).toMatchObject({
    ok: true,
    value: [
      { kind: 'granted-skill', numeric: [{ actual: 13 }], matched: false },
      { kind: 'granted-skill-sockets', numeric: [{ actual: 3 }], matched: false },
    ],
  })
  for (const invalid of [
    { ...sockets, basis: 'effective' },
    { ...sockets, bounds: [{ index: 1, min: 4 }] },
    ...[1, 6, 3.5].map((min) => ({ ...sockets, bounds: [{ index: 0, min }] })),
  ])
    expect(readCraftImplicitTargets([invalid]).ok).toBe(false)
  expect(readCraftImplicitTargets([sockets, sockets]).ok).toBe(false)
})
it('建议提供所有合法直达材料，未知、达成和降低不提供操作', () => {
  expect(analyzeCraftTargets(catalog, state, [], [], [], undefined, [sockets])).toMatchObject({
    ok: true,
    value: {
      skillSocketsOperations: [
        { kind: 'skill-sockets', tier: 'greater', previousSockets: 3 },
        { kind: 'skill-sockets', tier: 'perfect', previousSockets: 3 },
      ],
    },
  })
  for (const current of [
    { ...state, declaredSkillSockets: undefined },
    { ...state, declaredSkillSockets: 5 },
  ]) {
    const { declaredSkillSockets, ...rest } = current
    const checked = declaredSkillSockets === undefined ? rest : current
    expect(
      analyzeCraftTargets(catalog, checked, [], [], [], undefined, [sockets]),
    ).not.toHaveProperty('value.skillSocketsOperations')
  }
})
it('路线同时满足显式、等级与辅助孔，保留四孔与五孔不同结果', () => {
  const result = planCraftTargetRoutes(
    catalog,
    state,
    ['prefix1'],
    [],
    [],
    { maxDepth: 3, maxStates: 100 },
    [level, sockets],
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.routes.length).toBeGreaterThan(0)
  expect(new Set(result.value.routes.map((route) => route.finalState.grantedSkillSockets))).toEqual(
    new Set([4, 5]),
  )
  for (const route of result.value.routes) {
    expect(route.finalState.grantedSkillLevel).toBe(20)
    expect(route.finalState.affixes.some((a) => a.modId === 'prefix1')).toBe(true)
    expect(
      route.steps.filter((s) => 'kind' in s.operation && s.operation.kind === 'skill-sockets'),
    ).toHaveLength(1)
  }
})

it('辅助孔路线费用排序保留直接跨级材料并遵守区间上限', () => {
  const run = (max?: number) =>
    planCraftTargetRoutes(
      catalog,
      state,
      [],
      [],
      [],
      {
        maxDepth: 1,
        maxStates: 8,
        pricing: {
          unit: 'divine',
          prices: { 'currency:greater-jewellers': 10, 'currency:perfect-jewellers': 1 },
        },
      },
      [{ ...sockets, bounds: [{ index: 0, min: 4, ...(max === undefined ? {} : { max }) }] }],
    )
  const all = run()
  if (!all.ok) throw Error(all.error)
  expect(all.value.routes.map((route) => route.finalState.grantedSkillSockets)).toEqual([5, 4])
  const bounded = run(4)
  if (!bounded.ok) throw Error(bounded.error)
  expect(bounded.value.routes.map((route) => route.finalState.grantedSkillSockets)).toEqual([4])
})

it('独立定义和条件策略等待同一技能两个目标完整收尾', () => {
  const definitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
  const upgraded = applyCraftStep(catalog, state, { kind: 'perfect-flux', previousMaxLevel: 13 })
  if (!upgraded.ok) throw Error(upgraded.error)
  const strategy = {
    maxSteps: 3,
    rules: [
      {
        conditions: [{ kind: 'targets-met' as const, value: true }],
        action: { kind: 'stop' as const },
      },
      {
        conditions: [{ kind: 'always' as const }],
        action: {
          kind: 'skill-sockets' as const,
          tier: 'greater' as const,
          previousSockets: 3 as const,
        },
      },
    ],
  }
  const implicit = [level, sockets]
  expect(
    evaluateCraftStrategy(catalog, upgraded.value, strategy, 1, {
      targetModIds: [],
      targetImplicitValues: implicit,
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
  expect(
    evaluateDefinitionCraftStrategy(catalog, upgraded.value, strategy, 1, {
      definitions,
      targetImplicitValues: implicit,
    }),
  ).toMatchObject({ ok: true, value: { kind: 'action' } })
  const result = planTargetDefinitionRoutes(
    catalog,
    upgraded.value,
    definitions,
    { maxDepth: 1, maxStates: 8 },
    implicit,
  )
  if (!result.ok) throw Error(result.error)
  expect(result.value.alreadyMatched).toBe(false)
  expect(result.value.routes.length).toBe(2)
  for (const route of result.value.routes) {
    expect(route.steps[0]?.gainedImplicitTargetKeys).toEqual(['0:granted-skill-sockets'])
    expect(
      evaluateDefinitionCraftStrategy(catalog, route.finalState, strategy, 2, {
        definitions,
        targetImplicitValues: implicit,
      }),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  }
})
it('去重保留声明来源与结果，不把同值声明当作材料结果', () => {
  expect(craftStateSemanticKey(state)).not.toBe(
    craftStateSemanticKey({ ...state, declaredSkillSockets: 4 }),
  )
  expect(craftStateSemanticKey({ ...state, declaredSkillSockets: 4 })).not.toBe(
    craftStateSemanticKey({ ...state, grantedSkillSockets: 4 }),
  )
})
