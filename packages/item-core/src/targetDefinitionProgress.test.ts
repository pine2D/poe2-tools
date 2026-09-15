import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftState } from './rehearsal'
import type { CraftTargetDefinitions } from './targetDefinitions'
import { evaluateTargetDefinitions, matchedCraftTargetIds } from './targetProgress'

const catalog = boneCatalog()
function definitions(extra: Partial<CraftTargetDefinitions> = {}): CraftTargetDefinitions {
  return {
    nextTargetId: 3,
    targets: [
      { targetId: 't1', modId: 'prefix1' },
      { targetId: 't2', modId: 'prefix1' },
    ],
    alternatives: [],
    values: [
      { targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 3 }] },
      { targetId: 't2', modId: 'prefix1', bounds: [{ index: 0, min: 7 }] },
    ],
    ...extra,
  }
}
function state(): CraftState {
  return {
    ...boneState(),
    nextAffixId: 3,
    affixes: [
      { modId: 'prefix1', affixId: 'a1', lines: ['prefix1 8'] },
      { modId: 'prefix1', affixId: 'a2', lines: ['prefix1 3'] },
    ],
  }
}

describe('独立目标纯评估（不放宽公共目标准入）', () => {
  it('同类型两个目标独立使用自身数值条件，增广分配不被宽目标抢占', () => {
    const input = state()
    const config = definitions()
    const original = structuredClone({ input, config })
    expect(evaluateTargetDefinitions(catalog, input, config)).toEqual({
      matches: [
        { targetId: 't1', modId: 'prefix1', affixIndex: 1, affixId: 'a2' },
        { targetId: 't2', modId: 'prefix1', affixIndex: 0, affixId: 'a1' },
      ],
      unmatchedTargetIds: [],
      requiredMatched: true,
      satisfied: true,
    })
    expect({ input, config }).toEqual(original)
  })

  it('移除后重新分配可用实例，一条不能重复计数', () => {
    const input = state()
    input.affixes = input.affixes.slice(0, 1)
    const result = evaluateTargetDefinitions(catalog, input, definitions())
    expect(result.matches).toHaveLength(1)
    expect(result.unmatchedTargetIds).toHaveLength(1)
    expect(result.satisfied).toBe(false)
    const partial = evaluateTargetDefinitions(
      catalog,
      input,
      definitions({ minimumTargetCount: 1 }),
    )
    expect(partial.satisfied).toBe(true)
  })

  it('部分达成优先保留必选破裂目标；同一实例同时满足数值和破裂', () => {
    const input = state()
    input.affixes = input.affixes.slice(0, 1).map((affix) => ({ ...affix, fractured: true }))
    const config = definitions({ minimumTargetCount: 1, fracturedTargetId: 't2' })
    expect(evaluateTargetDefinitions(catalog, input, config)).toEqual({
      matches: [{ targetId: 't2', modId: 'prefix1', affixIndex: 0, affixId: 'a1' }],
      unmatchedTargetIds: ['t1'],
      requiredMatched: true,
      satisfied: true,
    })
    input.affixes = [
      ...input.affixes.map((affix) => ({ ...affix, lines: ['prefix1 3'] })),
      { modId: 'prefix1', affixId: 'a2', lines: ['prefix1 8'] },
    ]
    const unmatched = evaluateTargetDefinitions(catalog, input, config)
    expect(unmatched.requiredMatched).toBe(false)
    expect(unmatched.satisfied).toBe(false)
    expect(unmatched.matches.map((entry) => entry.targetId)).toEqual(['t1'])
  })

  it('接受档位按目标关联自身条件，并返回实际类型和实例', () => {
    const input = boneState(['prefix2'])
    const config = definitions({
      nextTargetId: 2,
      targets: [{ targetId: 't1', modId: 'prefix1' }],
      alternatives: [{ targetId: 't1', modIds: ['prefix2'] }],
      values: [
        { targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 8 }] },
        { targetId: 't1', modId: 'prefix2', bounds: [{ index: 0, max: 5 }] },
      ],
    })
    expect(evaluateTargetDefinitions(catalog, input, config)).toEqual({
      matches: [{ targetId: 't1', modId: 'prefix2', affixIndex: 0 }],
      unmatchedTargetIds: [],
      requiredMatched: true,
      satisfied: true,
    })
  })

  it('无显式目标保持达成，显式数量与无匹配破裂要求分别判断', () => {
    expect(
      evaluateTargetDefinitions(
        catalog,
        boneState(),
        definitions({
          nextTargetId: 1,
          targets: [],
          alternatives: [],
          values: [],
        }),
      ),
    ).toEqual({ matches: [], unmatchedTargetIds: [], requiredMatched: true, satisfied: true })
    const result = evaluateTargetDefinitions(catalog, boneState(), definitions())
    expect(result).toEqual({
      matches: [],
      unmatchedTargetIds: ['t1', 't2'],
      requiredMatched: true,
      satisfied: false,
    })
  })

  it('旧匹配入口实际使用一对一分配，而不是独立计数', () => {
    // 已验证旧调用方不会传交叠组；纯入口仍必须遵守分配不重复计数。
    const input = boneState(['prefix1'])
    expect(
      matchedCraftTargetIds(
        catalog,
        input,
        ['prefix1', 'prefix2'],
        [['prefix1'], ['prefix2', 'prefix1']],
        [],
      ),
    ).toEqual(['prefix1'])
    input.affixes = input.affixes.map((affix) => ({ ...affix, fractured: true }))
    expect(
      matchedCraftTargetIds(
        catalog,
        input,
        ['prefix1', 'prefix2'],
        [['prefix1'], ['prefix2', 'prefix1']],
        [],
        'prefix2',
      ),
    ).toEqual(['prefix2'])
  })
})
