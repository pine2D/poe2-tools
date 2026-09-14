import { expect, it } from 'vitest'
import { catalog, dictionary, imported } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import type { CraftOmen } from './omens'
import { type CraftState, craftCandidates, prepareCraftOperation } from './rehearsal'
import { statScalabilitySourceHash } from './statScalability'
import { planCraftTargetRoutes } from './targetRoutes'
import { analyzeCraftTargets } from './targets'

const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw Error(r.error)
  return r.value
}
const configs = [
  ['catalysing_sinistral_exaltation', 'sinistral_exaltation', 1],
  ['catalysing_dextral_exaltation', 'dextral_exaltation', 1],
  ['catalysing_greater_exaltation', 'greater_exaltation', 2],
  ['catalysing_greater_sinistral_exaltation', 'greater_sinistral_exaltation', 2],
  ['catalysing_greater_dextral_exaltation', 'greater_dextral_exaltation', 2],
] as const
const triple = 'catalysing_greater_dextral_exaltation' as CraftOmen
const operation = {
  currency: 'perfect_exalted' as const,
  omen: triple,
  modIds: ['FireResist6', 'ColdResist6'],
  rolls: [
    { modId: 'FireResist6', values: [31] },
    { modId: 'ColdResist6', values: [33] },
  ],
}

it.each(configs)(
  '%s 三档崇高沿用方向、数量与等级，只消费一次品质且不保证标签',
  (id, plain, count) => {
    const omen = id as CraftOmen
    const state = must(imported())
    const before = structuredClone(state)
    for (const currency of ['exalted', 'greater_exalted', 'perfect_exalted'] as const) {
      const draft = must(prepareCraftOperation(catalog, state, currency, undefined, omen))
      expect(draft.count).toBe(count)
      expect(draft.state.catalyst).toEqual({ id: 'Flesh', quality: 0 })
      const pool = craftCandidates(catalog, draft.state, currency, omen)
      expect(pool.map((m) => m.id)).toEqual(
        craftCandidates(catalog, state, currency)
          .filter((m) =>
            plain.includes('sinistral')
              ? m.kind === 'prefix'
              : plain.includes('dextral')
                ? m.kind === 'suffix'
                : true,
          )
          .map((m) => m.id),
      )
      expect(pool.some((m) => !m.tags.includes('life'))).toBe(true)
    }
    expect(state).toEqual(before)
  },
)

it('三枚组合新增两后缀，费用各一次，第二组错误或空位不足不消费', () => {
  const state = must(imported())
  const result = must(applyCraftStep(catalog, state, operation))
  expect(result.affixes.map((a) => a.modId)).toEqual([
    'IncreasedLife1',
    'FireResist6',
    'ColdResist6',
  ])
  expect(result.affixes[0]).toEqual(state.affixes[0])
  expect(result.catalyst).toEqual({ id: 'Flesh', quality: 0 })
  expect(must(collectCraftCosts(catalog, [operation])).map((c) => [c.id, c.count])).toEqual([
    ['currency:perfect_exalted', 1],
    ['omen:Omen of Catalysing Exaltation', 1],
    ['omen:Omen of Greater Exaltation', 1],
    ['omen:Omen of Dextral Exaltation', 1],
  ])
  for (const modIds of [
    ['FireResist6'],
    ['FireResist6', 'IncreasedMana9'],
    ['FireResist6', 'FireResist1'],
  ])
    expect(applyCraftStep(catalog, state, { ...operation, modIds }).ok).toBe(false)
  if (!state.catalyst) throw Error('fixture 缺少品质')
  const crowded = { ...result, catalyst: state.catalyst }
  expect(prepareCraftOperation(catalog, crowded, 'exalted', undefined, triple).ok).toBe(false)
  expect(prepareCraftOperation(catalog, result, 'exalted', undefined, triple).ok).toBe(false)
  expect(state.catalyst?.quality).toBe(20)
})

it('品质消耗造成已有数值目标损失，指引在消费后停止重复触发', () => {
  const state = must(imported())
  const advice = must(
    analyzeCraftTargets(
      catalog,
      state,
      ['IncreasedLife1', 'FireResist6', 'ColdResist6'],
      [{ modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] }],
      [],
      triple,
    ),
  )
  expect(advice.steps.some((s) => s.lostTargetIds.includes('IncreasedLife1'))).toBe(true)
  const strategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'always' as const }],
        action: { kind: 'currency' as const, currency: 'perfect_exalted' as const, omen: triple },
      },
    ],
  }
  expect(must(evaluateCraftStrategy(catalog, state, strategy, 0)).kind).toBe('action')
  expect(
    must(
      evaluateCraftStrategy(catalog, must(applyCraftStep(catalog, state, operation)), strategy, 1),
    ).kind,
  ).toBe('blocked')
})

it('v65 完整回放未来步骤与未执行组合指引，旧规则不能注入', () => {
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    scalabilitySourceHash: statScalabilitySourceHash(catalog),
    initialState: must(imported()),
    operations: [operation],
    cursor: 0,
  }
  const read = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)
  for (const cursor of [0, 1])
    expect(must(read({ ...project, cursor })).project.cursor).toBe(cursor)
  for (let v = 2; v <= 64; v++)
    expect(read({ ...project, rulesVersion: `basic-2026-09-12-v${v}` }).ok).toBe(false)
  for (const [omen] of configs) {
    const dormant = {
      ...project,
      operations: [],
      strategy: {
        maxSteps: 10,
        rules: [
          { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'currency', currency: 'exalted', omen },
          },
        ],
      },
    }
    expect(read(dormant).ok).toBe(true)
    expect(read({ ...dormant, rulesVersion: 'basic-2026-09-12-v64' }).ok).toBe(false)
  }
})

it('完整路线保护已有催化有效值，不为新增双组牺牲已达成生命目标', () => {
  const state = must(imported())
  const routes = must(
    planCraftTargetRoutes(
      catalog,
      state,
      ['IncreasedLife1', 'FireResist6', 'ColdResist6'],
      [{ modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 22 }] }],
    ),
  )
  expect(routes.routes.length).toBeGreaterThan(0)
  for (const route of routes.routes) {
    let current = state
    for (const step of route.steps) {
      current = must(applyCraftStep(catalog, current, step.operation))
      expect(current).toEqual(step.state)
      expect(step.matchedTargetIds).toContain('IncreasedLife1')
      expect(current.catalyst?.quality).toBe(20)
    }
    expect(current).toEqual(route.finalState)
  }
})

it('只选词缀目标也优先保留品质，同一路径不推荐多消费催化的重复结果', () => {
  const routes = must(
    planCraftTargetRoutes(catalog, must(imported()), [
      'IncreasedLife1',
      'FireResist6',
      'ColdResist6',
    ]),
  )
  expect(routes.routes.length).toBeGreaterThan(0)
  expect(routes.routes.every((route) => route.finalState.catalyst?.quality === 20)).toBe(true)
})

it('有效值上界必须降品质时，仍能规划催化组合并完整回放', () => {
  const source = must(imported())
  const state: CraftState = {
    ...source,
    affixes: source.affixes.map((affix) => ({ ...affix, fractured: true as const })),
  }
  const routes = must(
    planCraftTargetRoutes(
      catalog,
      state,
      ['IncreasedLife1', 'FireResist6', 'ColdResist6'],
      [{ modId: 'IncreasedLife1', basis: 'effective', bounds: [{ index: 0, min: 19, max: 19 }] }],
    ),
  )
  const consumed = routes.routes.find((route) => route.finalState.catalyst?.quality === 0)
  expect(consumed).toBeDefined()
  if (!consumed) throw Error('缺少降品质路线')
  let current = state
  for (const step of consumed.steps)
    current = must(applyCraftStep(catalog, current, step.operation))
  expect(current).toEqual(consumed.finalState)
})
