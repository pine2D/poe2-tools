import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { applyCraftStep } from './craftSteps'
import { implicitTargetFixture } from './implicitTargetFixture'
import type { CraftResult, CraftState } from './rehearsal'
import { analyzeTargetDefinitions, definitionTargetsSatisfied } from './targetDefinitionAdvice'
import { planTargetDefinitionRoutes } from './targetDefinitionRoutes'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { planCraftTargetRoutes } from './targetRoutes'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function definitions(extra: Partial<CraftTargetDefinitions> = {}): CraftTargetDefinitions {
  return {
    nextTargetId: 40,
    targets: [{ targetId: 't27', modId: 'prefix1' }],
    alternatives: [],
    values: [],
    ...extra,
  }
}

describe('独立目标路线', () => {
  it.each(['normal', 'rare'] as const)(
    '实际操作及新增/神圣实例ID可回放，目标身份不重编号：%s',
    (rarity) => {
      const catalog = boneCatalog()
      const state = value(
        enableCraftAffixIdentity(catalog, {
          ...boneState(rarity === 'rare' ? ['prefix1'] : []),
          rarity,
        }),
      )
      const config = definitions({
        values: [{ targetId: 't27', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
      })
      const before = structuredClone({ state, config })
      const result = value(planTargetDefinitionRoutes(catalog, state, config))
      expect(result.routes.length).toBeGreaterThan(0)
      for (const route of result.routes) {
        let current: CraftState = state
        for (const step of route.steps) {
          current = value(applyCraftStep(catalog, current, step.operation))
          expect(current).toEqual(step.state)
          expect(step.matchedTargetIds).toEqual(['t27'])
          expect(step.gainedTargetIds).toEqual(['t27'])
          expect(step.lostTargetIds).toEqual([])
          if ('currency' in step.operation)
            for (const roll of step.operation.rolls ?? []) {
              expect(roll.modId.startsWith('t')).toBe(false)
              expect(roll.affixId).toBe(
                current.affixes.find((affix) => affix.modId === roll.modId)?.affixId,
              )
            }
        }
        expect(
          definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, current, config))),
        ).toBe(true)
      }
      expect({ state, config }).toEqual(before)
    },
  )

  it.each([1, 12])('候选预算无额外应用，旧路线操作和终点不变：%s', (maxStates) => {
    const catalog = boneCatalog()
    const state = value(enableCraftAffixIdentity(catalog, { ...boneState(), rarity: 'normal' }))
    const config = definitions({
      targets: [
        { targetId: 't27', modId: 'prefix1' },
        { targetId: 't9', modId: 'suffix1' },
      ],
      minimumTargetCount: 1,
    })
    const options = { maxStates, maxDepth: 3 }
    const legacy = value(
      planCraftTargetRoutes(catalog, state, ['prefix1', 'suffix1'], [], [], {
        ...options,
        minimumTargetCount: 1,
      }),
    )
    const result = value(planTargetDefinitionRoutes(catalog, state, config, options))
    expect({ ...result, routes: [] }).toEqual({ ...legacy, routes: [] })
    expect(
      result.routes.map((route) => ({
        finalState: route.finalState,
        operations: route.steps.map((step) => step.operation),
      })),
    ).toEqual(
      legacy.routes.map((route) => ({
        finalState: route.finalState,
        operations: route.steps.map((step) => step.operation),
      })),
    )
    expect(result.routes.length).toBeGreaterThan(0)
    expect(
      result.routes.every((route) =>
        definitionTargetsSatisfied(
          value(analyzeTargetDefinitions(catalog, route.finalState, config)),
        ),
      ),
    ).toBe(true)
  })

  it('实际接受档位风险与tN目标分别报告', () => {
    const catalog = boneCatalog()
    const alternative = catalog.modifiers.find((entry) => entry.id === 'prefix2')
    if (!alternative) throw new Error('缺少夹具')
    alternative.group = 'prefix1'
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix2'])))
    const config = definitions({
      alternatives: [{ targetId: 't27', modIds: ['prefix2'] }],
      values: [{ targetId: 't27', modId: 'prefix2', bounds: [{ index: 0, min: 8 }] }],
    })
    const result = value(planTargetDefinitionRoutes(catalog, state, config))
    const divine = result.routes
      .flatMap((route) => route.steps)
      .find((step) => 'currency' in step.operation && step.operation.currency === 'divine')
    expect(divine).toMatchObject({
      matchedTargetIds: ['t27'],
      gainedTargetIds: ['t27'],
      lostTargetIds: [],
      rerolledTargetIds: ['t27'],
      rerolledModIds: ['prefix2'],
      affectedModIds: [],
      atRiskModIds: [],
    })
  })

  it('验证完整目标且不接受第二份minimum或坏预算；当前同组门禁保持', () => {
    const catalog = boneCatalog()
    expect(
      planTargetDefinitionRoutes(catalog, boneState(), definitions(), {
        minimumTargetCount: 0,
      } as never).ok,
    ).toBe(false)
    expect(
      planTargetDefinitionRoutes(catalog, boneState(), definitions(), { maxStates: 0 }).ok,
    ).toBe(false)
    expect(
      planTargetDefinitionRoutes(catalog, boneState(), definitions({ nextTargetId: 27 })).ok,
    ).toBe(false)
    expect(
      planTargetDefinitionRoutes(
        catalog,
        boneState(),
        definitions({
          targets: [
            { targetId: 't27', modId: 'prefix1' },
            { targetId: 't9', modId: 'prefix1' },
          ],
        }),
      ).ok,
    ).toBe(false)
  })

  it('必选破裂必须由实际实例完成，部分目标计数不能提前返回', () => {
    const catalog = boneCatalog()
    const state = value(
      enableCraftAffixIdentity(catalog, boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2'])),
    )
    const config = definitions({
      targets: [
        { targetId: 't27', modId: 'prefix1' },
        { targetId: 't9', modId: 'suffix1' },
      ],
      minimumTargetCount: 1,
      fracturedTargetId: 't27',
    })
    const result = value(planTargetDefinitionRoutes(catalog, state, config))
    expect(result.alreadyMatched).toBe(false)
    expect(result.routes.length).toBeGreaterThan(0)
    for (const route of result.routes) {
      const last = route.steps.at(-1)
      expect(last?.operation).toEqual({ kind: 'fracture', modId: 'prefix1', affixId: 'a1' })
      expect(last?.gainedTargetIds).toEqual(['t27'])
      expect(
        definitionTargetsSatisfied(
          value(analyzeTargetDefinitions(catalog, route.finalState, config)),
        ),
      ).toBe(true)
      expect(
        value(planTargetDefinitionRoutes(catalog, route.finalState, config)).alreadyMatched,
      ).toBe(true)
    }
  })

  it('固有目标独立完成和报告行变化，空显式集合不提前满足', () => {
    const { catalog, state } = implicitTargetFixture()
    const config = definitions({ targets: [] })
    const implicit = [{ lineIndex: 1, bounds: [{ index: 0, min: 2 }] }]
    const result = value(
      planTargetDefinitionRoutes(catalog, state, config, { maxDepth: 1 }, implicit),
    )
    expect(result.alreadyMatched).toBe(false)
    expect(result.routes.length).toBeGreaterThan(0)
    expect(result.routes[0]?.steps[0]).toMatchObject({
      gainedTargetIds: [],
      matchedTargetIds: [],
      gainedImplicitLineIndexes: [1],
    })
    for (const route of result.routes)
      expect(
        definitionTargetsSatisfied(
          value(analyzeTargetDefinitions(catalog, route.finalState, config, undefined, implicit)),
        ),
      ).toBe(true)
  })

  it('骨骼待揭示必须走真实步骤结束；候选消耗与旧入口完全一致', () => {
    const catalog = boneCatalog()
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix1'])))
    const pending: CraftState = {
      ...state,
      pendingDesecration: { boneId: 'gnawed_rib', kind: 'suffix' },
    }
    const config = definitions()
    const legacy = value(planCraftTargetRoutes(catalog, pending, ['prefix1']))
    const result = value(planTargetDefinitionRoutes(catalog, pending, config))
    expect(result.alreadyMatched).toBe(false)
    expect(result.candidateApplications).toBe(legacy.candidateApplications)
    expect(result.examinedStates).toBe(legacy.examinedStates)
    expect(result.routes.length).toBeGreaterThan(0)
    for (const route of result.routes) {
      let current = pending
      for (const step of route.steps) {
        current = value(applyCraftStep(catalog, current, step.operation))
        expect(current).toEqual(step.state)
        expect(step.gainedTargetIds).toEqual([])
        expect(step.lostTargetIds).toEqual([])
      }
      expect(
        definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, current, config))),
      ).toBe(true)
    }
  })
})
