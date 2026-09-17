import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readBaseSkillVariants } from './baseSkillVariants'
import { required } from './beltTestFixture'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import {
  craftImplicitTargetCandidates,
  validateStoredCraftImplicitTargets,
} from './implicitTargets'
import { inspectPerfectFluxCraft } from './perfectFlux'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import {
  declareInitialSkillSockets,
  inspectSkillSocketsCraft,
  readCraftGrantedSkillSockets,
  readSingleGrantedSkillForSockets,
} from './skillSockets'
import { buildInitialSkillVariantLines } from './skillVariantAmulets'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
) as CraftCatalog
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function setup(name: string, index = 1) {
  const base = required(catalog.bases.find((b) => b.id === `${name} Amulet`))
  const parsed = required(readBaseSkillVariants(base))
  const state: CraftState = {
    baseId: base.id,
    itemLevel: 80,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
    implicitLines: must(buildInitialSkillVariantLines(base, index, 10)).reverse(),
  }
  const goal = {
    kind: 'granted-skill-sockets' as const,
    lineIndex: parsed.commonLines.length,
    bounds: [{ index: 0, min: 4, max: 4 }],
  }
  return { base, state, goal, skillName: required(parsed.variants[index - 1]).name }
}
it.each(['Lament', 'Portent', 'Absent'])(
  '%s 声明和三档设孔保持技能及等级，等级资格独立',
  (name) => {
    const { state, skillName } = setup(name)
    expect(must(readCraftGrantedSkillSockets(catalog, state))).toEqual({
      name: skillName,
      sockets: null,
    })
    const declared = must(declareInitialSkillSockets(catalog, state, 2))
    for (const [tier, count] of [
      ['lesser', 3],
      ['greater', 4],
      ['perfect', 5],
    ] as const) {
      const next = must(
        applyCraftStep(catalog, declared, { kind: 'skill-sockets', tier, previousSockets: 2 }),
      )
      expect(next).toEqual({ ...declared, grantedSkillSockets: count })
    }
    expect(inspectPerfectFluxCraft(catalog, declared).ok).toBe(false)
    expect(createCraftState(catalog, { ...declared, declaredSkillLevel: 13 }).ok).toBe(false)
    expect(createCraftState(catalog, { ...declared, grantedSkillLevel: 20 }).ok).toBe(false)
  },
)
it.each(['Lament', 'Portent', 'Absent'])(
  '%s 乱序观察行保留稳定目标槽位且名称跟随所选技能',
  (name) => {
    for (const index of [1, 2]) {
      const { state, goal, skillName } = setup(name, index)
      expect(must(craftImplicitTargetCandidates(catalog, state))).toMatchObject([
        { kind: 'granted-skill-sockets', lineIndex: goal.lineIndex, skillName, actual: [null] },
      ])
      expect(must(craftImplicitTargetCandidates(catalog, state))).toHaveLength(1)
      expect(validateStoredCraftImplicitTargets(catalog, state.baseId, [goal]).ok).toBe(true)
      for (const invalid of [
        { ...goal, lineIndex: 0 },
        { ...goal, kind: 'granted-skill' },
        { lineIndex: 0, bounds: [{ index: 0, min: -1 }] },
        { ...goal, basis: 'effective' },
      ])
        expect(validateStoredCraftImplicitTargets(catalog, state.baseId, [invalid]).ok).toBe(false)
    }
  },
)
it('路线直达四孔并保留乱序技能，条件随后命中；未知起点不自动规划', () => {
  const { state, goal } = setup('Absent')
  expect(
    must(planCraftTargetRoutes(catalog, state, [], [], [], { maxDepth: 1, maxStates: 8 }, [goal]))
      .routes,
  ).toEqual([])
  const declared = must(declareInitialSkillSockets(catalog, state, 2))
  const routes = must(
    planCraftTargetRoutes(catalog, declared, [], [], [], { maxDepth: 1, maxStates: 8 }, [goal]),
  ).routes
  expect(routes).toHaveLength(1)
  const route = required(routes[0])
  expect(route.steps.map((s) => s.operation)).toEqual([
    { kind: 'skill-sockets', tier: 'greater', previousSockets: 2 },
  ])
  expect(route.finalState).toEqual({ ...declared, grantedSkillSockets: 4 })
  expect(
    evaluateCraftStrategy(
      catalog,
      route.finalState,
      {
        maxSteps: 2,
        rules: [
          {
            conditions: [{ kind: 'granted-skill-sockets', min: 4, max: 4 }],
            action: { kind: 'stop' },
          },
        ],
      },
      1,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('不完整技能、伪造身份、额外授予和特殊状态仍不能制作', () => {
  const { state, base } = setup('Lament')
  for (const override of [{ id: 'Other', name: 'Other' }, { hidden: true }, { runeforged: true }]) {
    const modified = { ...base, ...override }
    expect(
      inspectSkillSocketsCraft({ ...catalog, bases: [modified] }, { ...state, baseId: modified.id })
        .ok,
    ).toBe(false)
  }
  for (const extra of [
    { implicitLines: [] },
    {
      implicitLines: [...required(state.implicitLines), required(required(state.implicitLines)[0])],
    },
    { corrupted: true },
    { destroyed: true },
    { sourceText: 'Sanctified' },
  ])
    expect(inspectSkillSocketsCraft(catalog, { ...state, ...extra } as CraftState).ok).toBe(false)
})

it('独立目标路线、条件指引与费用复用同一孔数操作', () => {
  const { state, goal } = setup('Portent', 2)
  const declared = must(declareInitialSkillSockets(catalog, state, 3))
  const definitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }
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
  const context = { definitions, targetImplicitValues: [goal] }
  expect(evaluateDefinitionCraftStrategy(catalog, declared, strategy, 0, context)).toMatchObject({
    ok: true,
    value: { kind: 'action' },
  })
  const routes = must(
    planTargetDefinitionRoutes(catalog, declared, definitions, { maxDepth: 1, maxStates: 8 }, [
      goal,
    ]),
  ).routes
  expect(routes).toHaveLength(1)
  const route = required(routes[0])
  expect(route.steps[0]?.gainedImplicitTargetKeys).toEqual(['1:granted-skill-sockets'])
  expect(route.finalState.implicitLines).toEqual(state.implicitLines)
  expect(
    evaluateDefinitionCraftStrategy(catalog, route.finalState, strategy, 1, context),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(
    must(
      collectCraftCosts(
        catalog,
        route.steps.map((s) => s.operation),
      ),
    ),
  ).toEqual([{ id: 'currency:greater-jewellers', name: "Greater Jeweller's Orb", count: 1 }])
})
it('只读辅助孔资格拒绝显式额外技能，不改动选中技能状态', () => {
  const { state, skillName, goal } = setup('Lament', 2)
  const before = structuredClone(state)
  expect(readSingleGrantedSkillForSockets(catalog, state)).toMatchObject({
    ok: true,
    value: { skillName, lineIndex: goal.lineIndex },
  })
  expect(state).toEqual(before)
  expect(
    readSingleGrantedSkillForSockets(catalog, {
      ...state,
      affixes: [{ modId: 'synthetic', lines: ['Grants Skill: Level 1 Other'] }],
    }).ok,
  ).toBe(false)
})
