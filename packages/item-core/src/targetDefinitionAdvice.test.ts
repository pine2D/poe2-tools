import { describe, expect, it } from 'vitest'
import { enableCraftAffixIdentity } from './affixIdentity'
import { boneCatalog, boneState } from './boneTestFixture'
import { imported, catalog as primary } from './catalystTestFixture'
import { implicitTargetFixture } from './implicitTargetFixture'
import type { CraftResult, CraftState } from './rehearsal'
import {
  analyzeTargetDefinitions,
  definitionTargetsSatisfied,
  targetDefinitionChanges,
} from './targetDefinitionAdvice'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { analyzeCraftTargets } from './targets'

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

describe('独立目标建议', () => {
  it('有空洞的目标身份与实际档位独立，保留旧建议且不修改输入', () => {
    const catalog = boneCatalog()
    const state = value(enableCraftAffixIdentity(catalog, boneState()))
    const config = definitions()
    const before = structuredClone({ state, config })
    const advice = value(analyzeTargetDefinitions(catalog, state, config))
    const legacy = value(analyzeCraftTargets(catalog, state, ['prefix1']))
    expect(advice.targets).toEqual(legacy.targets.map((target) => ({ ...target, targetId: 't27' })))
    expect(advice.steps.length).toBeGreaterThan(0)
    expect(
      advice.steps.map(({ targetIds, affectedModIds, ...step }) => {
        expect(targetIds).toEqual(['t27'])
        expect(affectedModIds).toEqual([])
        return step
      }),
    ).toEqual(legacy.steps)
    expect(advice.progress.unmatchedTargetIds).toEqual(['t27'])
    expect(definitionTargetsSatisfied(advice)).toBe(false)
    expect({ state, config }).toEqual(before)
  })

  it.each([5, 8])('移除实际接受档位只在原目标已达成时报告目标丢失：%s', (roll) => {
    const catalog = boneCatalog()
    const alternate = catalog.modifiers.find((mod) => mod.id === 'prefix2')
    if (!alternate) throw new Error('缺少夹具')
    alternate.group = 'prefix1'
    const state = value(
      enableCraftAffixIdentity(catalog, boneState(['prefix2', 'prefix3', 'prefix4'])),
    )
    const affix = state.affixes[0]
    if (!affix) throw new Error('缺少夹具')
    affix.lines = [`prefix2 ${roll}`]
    const config = definitions({
      targets: [
        { targetId: 't27', modId: 'prefix1' },
        { targetId: 't9', modId: 'suffix1' },
      ],
      alternatives: [{ targetId: 't27', modIds: ['prefix2'] }],
      values: [{ targetId: 't27', modId: 'prefix2', bounds: [{ index: 0, min: 8 }] }],
    })
    const advice = value(analyzeTargetDefinitions(catalog, state, config))
    const step = advice.steps.find(
      (entry) => entry.currency === 'chaos' && entry.removeAffixId === 'a1',
    )
    expect(step).toMatchObject({
      removeModId: 'prefix2',
      targetIds: ['t9'],
      affectedModIds: ['prefix2'],
      lostTargetIds: roll === 8 ? ['t27'] : [],
    })
    expect(step?.targetModIds).toEqual(['suffix1'])
  })

  it('神圣目标及重掷说明分离为目标ID和实际档位ID', () => {
    const catalog = boneCatalog()
    const state = value(enableCraftAffixIdentity(catalog, boneState(['prefix1'])))
    const config = definitions({
      values: [{ targetId: 't27', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
    })
    const advice = value(analyzeTargetDefinitions(catalog, state, config))
    expect(advice.steps.find((step) => step.currency === 'divine')).toMatchObject({
      targetIds: ['t27'],
      targetModIds: ['prefix1'],
      rerolledTargetIds: ['t27'],
      rerolledModIds: ['prefix1'],
      lostTargetIds: [],
    })
  })

  it('纯变化评估允许另一实例接替；公共建议仍拒绝重复状态和重复目标', () => {
    const catalog = boneCatalog()
    const before: CraftState = {
      ...boneState(),
      nextAffixId: 3,
      affixes: [
        { affixId: 'a1', modId: 'prefix1', lines: ['prefix1 8'] },
        { affixId: 'a2', modId: 'prefix1', lines: ['prefix1 9'] },
      ],
    }
    const after = { ...before, affixes: before.affixes.slice(1) }
    expect(targetDefinitionChanges(catalog, before, after, definitions())).toEqual({
      matchedTargetIds: ['t27'],
      gainedTargetIds: [],
      lostTargetIds: [],
    })
    expect(analyzeTargetDefinitions(catalog, before, definitions()).ok).toBe(false)
    expect(
      analyzeTargetDefinitions(
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

  it('部分数量不能绕过破裂要求；待揭示不标完成', () => {
    const catalog = boneCatalog()
    const state = boneState(['prefix1', 'suffix1'])
    const config = definitions({
      targets: [
        { targetId: 't27', modId: 'prefix1' },
        { targetId: 't9', modId: 'suffix1' },
      ],
      fracturedTargetId: 't27',
      minimumTargetCount: 1,
    })
    expect(
      definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, state, config))),
    ).toBe(false)
    const affix = state.affixes[0]
    if (!affix) throw new Error('缺少夹具')
    affix.fractured = true
    expect(
      definitionTargetsSatisfied(value(analyzeTargetDefinitions(catalog, state, config))),
    ).toBe(true)
    const pending: CraftState = {
      ...boneState(['prefix1']),
      pendingDesecration: { boneId: 'gnawed_rib', kind: 'suffix' },
    }
    const advice = value(analyzeTargetDefinitions(catalog, pending, definitions()))
    expect(advice.progress.satisfied).toBe(true)
    expect(advice.steps).toEqual([])
    expect(definitionTargetsSatisfied(advice)).toBe(false)
  })

  it('固有条件为必选项，不能因无显式目标而跳过', () => {
    const { catalog, state } = implicitTargetFixture()
    const config = definitions({ targets: [] })
    const goal = [{ lineIndex: 0, bounds: [{ index: 0, min: 18 }] }]
    expect(
      definitionTargetsSatisfied(
        value(analyzeTargetDefinitions(catalog, state, config, undefined, goal)),
      ),
    ).toBe(false)
    state.implicitLines[0] = '18(10-20)% increased Flask Charges gained'
    expect(
      definitionTargetsSatisfied(
        value(analyzeTargetDefinitions(catalog, state, config, undefined, goal)),
      ),
    ).toBe(true)
  })

  it('有效数值按真实品质计算，与合法旧配置数值说明等价', () => {
    const state = value(imported())
    const modId = state.affixes[0]?.modId
    if (!modId) throw new Error('缺少夹具')
    const config = definitions({
      targets: [{ targetId: 't27', modId }],
      values: [{ targetId: 't27', modId, basis: 'effective', bounds: [{ index: 0, min: 22 }] }],
    })
    const advice = value(analyzeTargetDefinitions(primary, state, config))
    const legacy = value(
      analyzeCraftTargets(
        primary,
        state,
        [modId],
        [{ modId, basis: 'effective', bounds: [{ index: 0, min: 22 }] }],
      ),
    )
    expect(advice.targets[0]?.numeric).toEqual(legacy.targets[0]?.numeric)
    expect(advice.targets[0]?.numeric).toMatchObject([{ actual: 22, matched: true }])
    expect(advice.progress.matches.map((match) => match.targetId)).toEqual(['t27'])
    expect(definitionTargetsSatisfied(advice)).toBe(true)
    const plain = { ...state, catalyst: { id: 'Flesh', quality: 0 } }
    expect(
      definitionTargetsSatisfied(value(analyzeTargetDefinitions(primary, plain, config))),
    ).toBe(false)
  })

  it('入口拒绝坏身份、未知字段和跨目标数值，不借旧引擎修复', () => {
    const catalog = boneCatalog()
    for (const config of [
      { ...definitions(), nextTargetId: 27 },
      {
        ...definitions(),
        values: [{ targetId: 't9', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] }],
      },
      { ...definitions(), extra: 1 },
      { ...definitions(), fracturedTargetId: undefined },
    ])
      expect(
        analyzeTargetDefinitions(catalog, boneState(), config as CraftTargetDefinitions).ok,
      ).toBe(false)
  })
})
