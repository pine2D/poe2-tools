import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { type CraftResult, createCraftState, prepareCraftOperation } from './rehearsal'
import { inspectCraftTargetInstances } from './targetProgress'
import { analyzeCraftTargets, validateCraftTargets, validateCraftTargetValues } from './targets'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('目标分析实例消费者', () => {
  it('有效值资格逐实例尝试可读投影，不受歧义实例排列顺序影响', () => {
    const catalog = boneCatalog()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw new Error('夹具缺失')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const state = {
      ...boneState(),
      nextAffixId: 3,
      affixes: [
        { modId: 'prefix1', affixId: 'a1', lines: ['Value 3', 'Value 4'] },
        { modId: 'prefix1', affixId: 'a2', lines: ['Value 8', 'Value 4'] },
      ],
    }
    const goals = [
      { modId: 'prefix1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] },
    ]
    expect(
      inspectCraftTargetInstances(catalog, state, 'prefix1', goals[0]).map(
        (entry) => entry.matched,
      ),
    ).toEqual([false, true])
    for (const affixes of [state.affixes, [...state.affixes].reverse()]) {
      expect(
        validateCraftTargetValues(catalog, state.baseId, ['prefix1'], goals, [], {
          ...state,
          affixes,
        }),
      ).toEqual({ ok: true, value: goals })
      expect(createCraftState(catalog, { ...state, affixes }).ok).toBe(false)
    }
    expect(
      validateCraftTargetValues(catalog, state.baseId, ['prefix1'], goals, [], {
        ...state,
        affixes: state.affixes.slice(0, 1),
      }).ok,
    ).toBe(false)
    expect(
      validateCraftTargetValues(catalog, state.baseId, ['prefix1'], goals, [], {
        ...state,
        affixes: [],
      }),
    ).toEqual({ ok: true, value: goals })
  })

  it('identified 标明实际匹配实例，legacy 完整结果保持原状', () => {
    const catalog = boneCatalog()
    const state = boneState(['prefix1'])
    const goals = [{ modId: 'prefix1', bounds: [{ index: 0, min: 4 }] }]
    const legacy = value(analyzeCraftTargets(catalog, state, ['prefix1'], goals))
    expect(legacy).toEqual({
      targets: [
        {
          modId: 'prefix1',
          present: true,
          matched: true,
          numeric: [{ index: 0, min: 4, actual: 5, matched: true }],
          reasons: [],
        },
      ],
      steps: [],
    })
    const identified = value(enableCraftAffixIdentity(catalog, state))
    expect(value(analyzeCraftTargets(catalog, identified, ['prefix1'], goals))).toEqual({
      ...legacy,
      targets: [{ ...legacy.targets[0], matchedAffixId: 'a1' }],
    })
  })

  it('替代档位达成在主目标上报告真正匹配的实例', () => {
    const catalog = boneCatalog()
    const alt = catalog.modifiers.find((mod) => mod.id === 'prefix2')
    if (!alt) throw new Error('夹具缺失')
    alt.group = 'prefix1'
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix2'])))
    const result = value(
      analyzeCraftTargets(
        catalog,
        state,
        ['prefix1'],
        [],
        [{ targetModId: 'prefix1', modIds: ['prefix2'] }],
      ),
    )
    expect(result.targets[0]).toMatchObject({ matched: true, matchedAffixId: 'a1' })
    expect(result.targets[0]?.alternatives?.[1]).toMatchObject({
      modId: 'prefix2',
      matchedAffixId: 'a1',
    })
  })

  it('普通移除建议保留实例 selector 并可交给真实 prepare 执行', () => {
    const catalog = boneCatalog()
    const state = value(
      enableCraftAffixIdentity(catalog, boneState(['prefix1', 'prefix2', 'prefix3'])),
    )
    const before = structuredClone(state)
    const result = value(analyzeCraftTargets(catalog, state, ['prefix1', 'prefix4']))
    const removal = result.steps.find(
      (step) => step.currency === 'annulment' && step.removeModId === 'prefix1',
    )
    expect(removal).toMatchObject({
      removeModId: 'prefix1',
      removeAffixId: 'a1',
      lostTargetIds: ['prefix1'],
    })
    if (!removal?.removeModId || !removal.removeAffixId) throw new Error('缺少实例移除建议')
    const prepared = value(
      prepareCraftOperation(catalog, state, removal.currency, {
        modId: removal.removeModId,
        affixId: removal.removeAffixId,
      }),
    )
    expect(prepared.state.affixes.map((affix) => affix.affixId)).toEqual(['a2', 'a3'])
    expect(prepared.state.nextAffixId).toBe(4)
    expect(state).toEqual(before)
  })

  it('公共状态和目标仍拒绝重复；未达标状态不虚构 matchedAffixId', () => {
    const catalog = boneCatalog()
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix1'])))
    const result = value(
      analyzeCraftTargets(
        catalog,
        state,
        ['prefix1'],
        [{ modId: 'prefix1', bounds: [{ index: 0, min: 7 }] }],
      ),
    )
    expect(result.targets[0]).not.toHaveProperty('matchedAffixId')
    expect(
      createCraftState(catalog, {
        ...state,
        nextAffixId: 3,
        affixes: [...state.affixes, { modId: 'prefix1', lines: ['prefix1 8'], affixId: 'a2' }],
      }).ok,
    ).toBe(false)
    expect(validateCraftTargets(catalog, state.baseId, ['prefix1', 'prefix1']).ok).toBe(false)
  })
})
