import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { readBaseSkillVariants } from './baseSkillVariants'
import { required } from './beltTestFixture'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, quoteCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import {
  craftImplicitTargetCandidates,
  validateStoredCraftImplicitTargets,
} from './implicitTargets'
import {
  declareInitialSkillLevel,
  inspectPerfectFluxCraft,
  readCraftGrantedSkillLevel,
} from './perfectFlux'
import { type CraftResult, type CraftState, createCraftState } from './rehearsal'
import { declareInitialSkillSockets } from './skillSockets'
import { buildInitialSkillVariantLines } from './skillVariantAmulets'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { planCraftTargetRoutes } from './targetRoutes'

const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function setup(name: string, index = 1) {
  const base = required(catalog.bases.find((b) => b.id === `${name} Amulet`))
  const variants = required(readBaseSkillVariants(base))
  const state: CraftState = {
    baseId: base.id,
    itemLevel: 80,
    rarity: 'normal',
    sourceText: null,
    affixes: [],
    implicitLines: must(buildInitialSkillVariantLines(base, index, 10)).reverse(),
  }
  const goals = [
    {
      kind: 'granted-skill' as const,
      lineIndex: variants.commonLines.length,
      bounds: [{ index: 0, min: 20 }],
    },
    {
      kind: 'granted-skill-sockets' as const,
      lineIndex: variants.commonLines.length,
      bounds: [{ index: 0, min: 5 }],
    },
  ]
  return { state, goals, skillName: required(variants.variants[index - 1]).name }
}
const flux = { kind: 'perfect-flux', previousMaxLevel: 13 } as const

it.each(['Lament', 'Portent', 'Absent'])(
  '%s 等级与三档辅助孔独立，保留乱序观察行和共同负容量',
  (name) => {
    const { state, skillName } = setup(name)
    expect(must(readCraftGrantedSkillLevel(catalog, state))).toEqual({
      name: skillName,
      level: null,
    })
    const declared = must(
      declareInitialSkillLevel(catalog, must(declareInitialSkillSockets(catalog, state, 2)), 13),
    )
    for (const [tier, count] of [
      ['lesser', 3],
      ['greater', 4],
      ['perfect', 5],
    ] as const) {
      const sockets = { kind: 'skill-sockets', tier, previousSockets: 2 } as const
      const levelFirst = must(applyCraftStep(catalog, declared, flux))
      expect(levelFirst).toEqual({ ...declared, grantedSkillLevel: 20 })
      const socketsFirst = must(applyCraftStep(catalog, declared, sockets))
      expect(socketsFirst).toEqual({ ...declared, grantedSkillSockets: count })
      expect(must(applyCraftStep(catalog, levelFirst, sockets))).toEqual(
        must(applyCraftStep(catalog, socketsFirst, flux)),
      )
      expect(must(applyCraftStep(catalog, socketsFirst, flux))).toEqual({
        ...declared,
        grantedSkillLevel: 20,
        grantedSkillSockets: count,
      })
      expect(inspectPerfectFluxCraft(catalog, levelFirst).ok).toBe(false)
    }
  },
)

it('原文Max尾注优先、显示等级和目录下限限制声明，20与圣化不可施用', () => {
  const { state } = setup('Absent')
  for (const level of [0, 9, 21, 13.5])
    expect(declareInitialSkillLevel(catalog, state, level).ok).toBe(false)
  const max = {
    ...state,
    implicitLines: required(state.implicitLines).map((line) =>
      line.startsWith('Grants Skill:') ? `${line} (Max Level 13)` : line,
    ),
  }
  expect(must(readCraftGrantedSkillLevel(catalog, max)).level).toBe(13)
  expect(declareInitialSkillLevel(catalog, max, 12).ok).toBe(false)
  expect(declareInitialSkillLevel(catalog, max, 13).ok).toBe(true)
  expect(applyCraftStep(catalog, max, { ...flux, previousMaxLevel: 12 }).ok).toBe(false)
  expect(must(applyCraftStep(catalog, max, flux)).implicitLines).toEqual(max.implicitLines)
  const twenty = must(declareInitialSkillLevel(catalog, state, 20))
  expect(inspectPerfectFluxCraft(catalog, twenty).ok).toBe(false)
  for (const extra of [
    { corrupted: true },
    { destroyed: true },
    { pendingDesecration: {} },
    { sourceText: 'Sanctified' },
  ])
    expect(inspectPerfectFluxCraft(catalog, { ...state, ...extra } as CraftState).ok).toBe(false)
  expect(
    createCraftState(catalog, { ...state, implicitLines: [], declaredSkillLevel: 13 }).ok,
  ).toBe(false)
})

it.each(['Lament', 'Portent', 'Absent'])(
  '%s 双目标共享稳定槽位，名称来自当前技能且未知不规划',
  (name) => {
    for (const index of [1, 2]) {
      const { state, goals, skillName } = setup(name, index)
      expect(must(craftImplicitTargetCandidates(catalog, state))).toMatchObject([
        {
          kind: 'granted-skill',
          lineIndex: goals[0]?.lineIndex,
          skillName,
          actual: [null],
          ranges: [{ min: 1, max: 20 }],
        },
        {
          kind: 'granted-skill-sockets',
          lineIndex: goals[0]?.lineIndex,
          skillName,
          actual: [null],
        },
      ])
      expect(validateStoredCraftImplicitTargets(catalog, state.baseId, goals).ok).toBe(true)
      expect(
        validateStoredCraftImplicitTargets(catalog, state.baseId, [
          { lineIndex: 0, bounds: [{ index: 0, min: -1 }] },
        ]).ok,
      ).toBe(false)
      expect(
        must(
          planCraftTargetRoutes(catalog, state, [], [], [], { maxDepth: 2, maxStates: 12 }, goals),
        ).routes,
      ).toEqual([])
    }
  },
)

it('双目标路线各消费一颗材料、条件命中20与五孔且未知反向条件不命中', () => {
  const { state, goals } = setup('Absent', 2)
  for (const condition of [
    { kind: 'granted-skill-level' as const, min: 20 },
    { kind: 'not' as const, condition: { kind: 'granted-skill-level' as const, min: 20 } },
  ])
    expect(
      evaluateCraftStrategy(
        catalog,
        state,
        { maxSteps: 3, rules: [{ conditions: [condition], action: { kind: 'stop' } }] },
        0,
      ),
    ).toEqual({ ok: true, value: { kind: 'unmatched' } })
  const declared = must(
    declareInitialSkillLevel(catalog, must(declareInitialSkillSockets(catalog, state, 2)), 13),
  )
  const routes = must(
    planCraftTargetRoutes(catalog, declared, [], [], [], { maxDepth: 2, maxStates: 20 }, goals),
  ).routes
  const definitionRoutes = must(
    planTargetDefinitionRoutes(
      catalog,
      declared,
      { nextTargetId: 1, targets: [], alternatives: [], values: [] },
      { maxDepth: 2, maxStates: 20 },
      goals,
    ),
  ).routes
  for (const route of [required(routes[0]), required(definitionRoutes[0])]) {
    expect(route.steps.map((step) => step.operation)).toEqual(
      expect.arrayContaining([
        flux,
        { kind: 'skill-sockets', tier: 'perfect', previousSockets: 2 },
      ]),
    )
    expect(route.steps).toHaveLength(2)
    expect(route.finalState).toEqual({ ...declared, grantedSkillLevel: 20, grantedSkillSockets: 5 })
    expect(
      evaluateCraftStrategy(
        catalog,
        route.finalState,
        {
          maxSteps: 3,
          rules: [
            {
              conditions: [
                { kind: 'granted-skill-level', min: 20 },
                { kind: 'granted-skill-sockets', min: 5 },
              ],
              action: { kind: 'stop' },
            },
          ],
        },
        2,
      ),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
    const costs = must(
      collectCraftCosts(
        catalog,
        route.steps.map((s) => s.operation),
      ),
    )
    expect(
      must(
        quoteCraftCosts(costs, {
          unit: 'divine',
          prices: { 'currency:perfect-flux': 2, 'currency:perfect-jewellers': 3 },
        }),
      ).total,
    ).toBe(5)
  }
})
