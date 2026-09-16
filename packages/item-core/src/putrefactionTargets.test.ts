import { describe, expect, it } from 'vitest'
import { analyzeBoneTargets } from './boneAdvice'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import type { CraftResult } from './rehearsal'
import { analyzeTargetDefinitions, definitionTargetsSatisfied } from './targetDefinitionAdvice'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import { analyzeBoneTargetDefinitions } from './targetDefinitionSpecialAdvice'
import { planCraftTargetRoutes } from './targetRoutes'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function fixture() {
  const catalog = boneCatalog()
  for (const kind of ['prefix', 'suffix'] as const) {
    const source = catalog.modifiers.find((mod) => mod.id === `${kind}1`)
    if (!source) throw new Error('缺少夹具')
    for (const n of [5, 6])
      catalog.modifiers.push({ ...source, id: `${kind}${n}`, group: `${kind}${n}` })
  }
  const state = value(
    applyCraftStep(catalog, boneState(), { kind: 'putrefy', boneId: 'preserved_rib' }),
  )
  return { catalog, state }
}

const definitions = {
  nextTargetId: 2,
  targets: [{ targetId: 't1', modId: 'prefix1' }],
  alternatives: [],
  values: [{ targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
}

describe('腐烂预兆目标与完整路线', () => {
  it('普通前缀目标命中后继续全部隐藏槽，每步真实回放并保留数值', () => {
    const { catalog, state } = fixture()
    const before = structuredClone(state)
    const planned = value(
      planTargetDefinitionRoutes(catalog, state, definitions, { maxStates: 24 }),
    )
    expect(planned.alreadyMatched).toBe(false)
    expect(planned.routes.length).toBeGreaterThan(0)
    for (const route of planned.routes) {
      expect(route.steps).toHaveLength(12)
      let current = state
      for (const [index, step] of route.steps.entries()) {
        current = value(applyCraftStep(catalog, current, step.operation))
        expect(current).toEqual(step.state)
        if (index >= 1)
          expect(current.affixes.find((a) => a.modId === 'prefix1')?.lines).toEqual([
            'prefix1 8(1-10)',
          ])
        expect(Boolean(current.pendingDesecration)).toBe(index < 11)
      }
      expect(current).toEqual(route.finalState)
      expect(current.affixes).toHaveLength(6)
      expect(current.affixes.every((a) => !a.desecrated)).toBe(true)
      expect(
        definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, current, definitions))),
      ).toBe(true)
    }
    expect(state).toEqual(before)
  })

  it('目标已命中仍给出后续普通揭示建议，条件指引不能提前停止', () => {
    const { catalog, state } = fixture()
    const offered = value(
      applyCraftStep(catalog, state, {
        kind: 'desecration-offer',
        modIds: ['prefix1', 'prefix2', 'prefix3'],
      }),
    )
    const current = value(
      applyCraftStep(catalog, offered, {
        kind: 'desecration-reveal',
        modId: 'prefix1',
        values: [8],
      }),
    )
    expect(
      definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, current, definitions))),
    ).toBe(false)
    const advice = value(analyzeBoneTargetDefinitions(catalog, current, definitions))
    expect(advice.length).toBeGreaterThan(0)
    for (const step of advice) {
      expect(step.operation.kind).toBe('desecration-offer')
      expect(applyCraftStep(catalog, current, step.operation).ok).toBe(true)
      expect(step.lostTargetIds).toEqual([])
    }
    const strategy: CraftStrategy = {
      maxSteps: 20,
      rules: [
        { conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } },
        { conditions: [{ kind: 'affix-count', min: 6 }], action: { kind: 'reveal' } },
      ],
    }
    expect(
      evaluateCraftStrategy(catalog, current, strategy, 2, { targetModIds: ['prefix1'] }),
    ).toMatchObject({
      ok: true,
      value: { kind: 'action', ruleIndex: 1, action: { kind: 'reveal' } },
    })
    const completed = value(
      planCraftTargetRoutes(catalog, current, ['prefix1'], [], [], { maxStates: 20 }),
    )
    expect(completed.alreadyMatched).toBe(false)
    expect(completed.routes[0]?.steps).toHaveLength(10)
  })

  it('不足完整剩余深度时不展开半路线，固定当前组选项只省去一次offer', () => {
    const { catalog, state } = fixture()
    const insufficient = value(
      planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], { maxDepth: 11 }),
    )
    expect(insufficient.routes).toEqual([])
    expect(insufficient.truncated).toBe(true)
    expect(insufficient.candidateApplications).toBe(0)
    const offered = value(
      applyCraftStep(catalog, state, {
        kind: 'desecration-offer',
        modIds: ['prefix1', 'prefix2', 'prefix3'],
      }),
    )
    const sufficient = value(
      planCraftTargetRoutes(catalog, offered, ['prefix1'], [], [], { maxDepth: 11, maxStates: 24 }),
    )
    expect(sufficient.routes[0]?.steps).toHaveLength(11)
    expect(sufficient.routes[0]?.finalState.pendingDesecration).toBeUndefined()
    expect(offered.pendingDesecration?.options).toEqual(['prefix1', 'prefix2', 'prefix3'])
  })

  it('候选预算耗尽停止建议，不自动施加破坏性腐烂起点', () => {
    const { catalog, state } = fixture()
    let calls = 0
    expect(
      value(
        analyzeBoneTargets(catalog, state, ['prefix1'], [], [], {
          consumeCandidate: () => {
            calls++
            return false
          },
        }),
      ),
    ).toEqual([])
    expect(calls).toBe(1)
    const start = boneState(['prefix1'])
    const advice = value(analyzeBoneTargets(catalog, start, ['prefix1', 'suffix1']))
    expect(advice.some((step) => step.operation.kind === 'putrefy')).toBe(false)
  })

  it('空目标也完成六槽，状态预算不足或普通池不足三项不返回半成品', () => {
    const { catalog, state } = fixture()
    const complete = value(planCraftTargetRoutes(catalog, state, [], [], [], { maxStates: 24 }))
    expect(complete.routes[0]?.steps).toHaveLength(12)
    const bounded = value(
      planCraftTargetRoutes(catalog, state, ['prefix1'], [], [], { maxStates: 2 }),
    )
    expect(bounded.routes).toEqual([])
    expect(bounded.truncated).toBe(true)
    const fewer = {
      ...catalog,
      modifiers: catalog.modifiers.filter((mod) => !['suffix5', 'suffix6'].includes(mod.id)),
    }
    const impossible = value(
      planCraftTargetRoutes(fewer, state, ['prefix1'], [], [], { maxStates: 24 }),
    )
    expect(impossible.routes).toEqual([])
    expect(impossible.candidateApplications).toBeLessThanOrEqual(4096)
  })

  it('破裂命中目标保留身份与数值，五槽路线无需重造已锁定目标', () => {
    const { catalog } = fixture()
    const initial = boneState(['prefix1'])
    const affix = initial.affixes[0]
    if (!affix) throw new Error('缺少夹具')
    affix.fractured = true
    const state = value(
      applyCraftStep(catalog, initial, { kind: 'putrefy', boneId: 'preserved_rib' }),
    )
    const routes = value(
      planCraftTargetRoutes(
        catalog,
        state,
        ['prefix1'],
        [{ modId: 'prefix1', bounds: [{ index: 0, min: 5 }] }],
        [],
        { maxDepth: 10, maxStates: 24 },
      ),
    )
    expect(routes.alreadyMatched).toBe(false)
    expect(routes.routes[0]?.steps).toHaveLength(10)
    for (const route of routes.routes) {
      let current = state
      for (const step of route.steps) {
        current = value(applyCraftStep(catalog, current, step.operation))
        expect(current.affixes.find((entry) => entry.modId === 'prefix1')).toEqual(affix)
        expect(step.lostTargetIds).toEqual([])
      }
      expect(current.pendingDesecration).toBeUndefined()
    }
  })
})
