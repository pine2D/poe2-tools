import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { catalog as catalystCatalog, imported } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import {
  type DefinitionCraftStrategy,
  definitionStrategyStageAt,
  evaluateDefinitionCraftStrategy,
  readDefinitionCraftStrategy,
} from './definitionStrategy'
import { catalog, state } from './partialTargetFixture'
import { strategyStageAt } from './strategyStages'
import { type CraftTargetDefinitions, createTargetDefinitions } from './targetDefinitions'

const definitions = (): CraftTargetDefinitions => ({
  nextTargetId: 10,
  targets: [{ targetId: 't7', modId: 'p1' }],
  alternatives: [],
  values: [],
})
const strategy = (targetId = 't7', value = true): DefinitionCraftStrategy => ({
  maxSteps: 20,
  rules: [
    {
      conditions: [{ kind: 'selected-targets', targetIds: [targetId], min: 1, value }],
      action: { kind: 'stop' },
    },
    { conditions: [{ kind: 'always' }], action: { kind: 'currency', currency: 'transmutation' } },
  ],
})

describe('独立目标条件指引', () => {
  it('严格区分新旧引用并深拷贝所有条件和阶段', () => {
    const input = strategy()
    const result = readDefinitionCraftStrategy(input)
    expect(result).toEqual({ ok: true, value: input })
    if (!result.ok) throw Error(result.error)
    result.value.rules[0]?.conditions.push({ kind: 'always' })
    expect(input.rules[0]?.conditions).toHaveLength(1)
    expect(readCraftStrategy(input).ok).toBe(false)
    for (const condition of [
      { kind: 'selected-targets', modIds: ['p1'], min: 1, value: true },
      { kind: 'selected-targets', targetIds: ['t7'], modIds: ['p1'], min: 1, value: true },
      { kind: 'selected-targets', targetIds: ['t07'], min: 1, value: true },
      { kind: 'selected-targets', targetIds: ['t7', 't7'], min: 1, value: true },
      { kind: 'selected-targets', targetIds: ['t7'], min: 1, value: true, extra: undefined },
      { kind: 'selected-targets', targetIds: undefined, min: 1, value: true },
    ])
      expect(
        readDefinitionCraftStrategy({
          ...input,
          rules: [{ conditions: [condition], action: { kind: 'stop' } }],
        }).ok,
      ).toBe(false)
  })

  it.each([true, false])('删除再添加相同类型不恢复孤儿引用（正向=%s）', (value) => {
    const config = definitions()
    const input = strategy('t1', value)
    const result = evaluateDefinitionCraftStrategy(catalog(), state('normal'), input, 0, {
      definitions: config,
    })
    expect(result).toMatchObject({
      ok: true,
      value: { kind: 'blocked', ruleIndex: 0, message: expect.stringContaining('t1') },
    })
    expect(
      evaluateDefinitionCraftStrategy(catalog(), state('magic', ['p1']), strategy('t7'), 1, {
        definitions: config,
      }),
    ).toEqual({ ok: true, value: { kind: 'stop', reason: 'rule', ruleIndex: 0 } })
    expect(config).toEqual(definitions())
  })

  it('未进入阶段和反向嵌套中的孤儿也阻塞', () => {
    const input: DefinitionCraftStrategy = {
      maxSteps: 20,
      flow: {
        entryStageId: 'a',
        stages: [
          { id: 'a', name: '阶段一' },
          { id: 'b', name: '阶段二' },
        ],
      },
      rules: [
        { stageId: 'a', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
        {
          stageId: 'b',
          conditions: [
            {
              kind: 'any',
              conditions: [
                { kind: 'always' },
                {
                  kind: 'not',
                  condition: {
                    kind: 'all',
                    conditions: [
                      { kind: 'selected-targets', targetIds: ['t1'], min: 1, value: false },
                    ],
                  },
                },
              ],
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    }
    expect(
      evaluateDefinitionCraftStrategy(catalog(), state('normal'), input, 0, {
        definitions: definitions(),
      }),
    ).toMatchObject({ ok: true, value: { kind: 'blocked', ruleIndex: 1 } })
  })

  it('真实分配保留替代数值、部分达成及必选破裂，隐式条件独立必选', () => {
    const source = catalog(undefined, { implicit: 'Implicit (1-10)' })
    const config: CraftTargetDefinitions = {
      ...definitions(),
      targets: [...definitions().targets, { targetId: 't9', modId: 's1' }],
      alternatives: [{ targetId: 't7', modIds: ['high'] }],
      values: [{ targetId: 't7', modId: 'high', bounds: [{ index: 0, min: 7 }] }],
      minimumTargetCount: 1,
      fracturedTargetId: 't7',
    }
    const initial = {
      ...state('rare'),
      implicitLines: ['Implicit 8'],
      affixes: [{ modId: 'high', lines: ['high 7'], fractured: true as const }],
    }
    const input: DefinitionCraftStrategy = {
      maxSteps: 20,
      rules: [{ conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } }],
    }
    expect(
      evaluateDefinitionCraftStrategy(source, initial, input, 0, {
        definitions: config,
        targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 8 }] }],
      }),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
    expect(
      evaluateDefinitionCraftStrategy(source, initial, input, 0, {
        definitions: config,
        targetImplicitValues: [{ lineIndex: 0, bounds: [{ index: 0, min: 9 }] }],
      }),
    ).toEqual({ ok: true, value: { kind: 'unmatched' } })
    expect(
      evaluateDefinitionCraftStrategy(
        source,
        { ...initial, affixes: initial.affixes.map(({ fractured: _, ...affix }) => affix) },
        input,
        0,
        { definitions: config },
      ),
    ).toEqual({ ok: true, value: { kind: 'unmatched' } })
  })

  it('阶段只跟随真实历史，游标回退与孤儿条件不伪造转向', () => {
    const source = catalog()
    const initial = state('normal')
    const operation = { currency: 'transmutation' as const, modIds: ['p1'] }
    const applied = applyCraftStep(source, initial, operation)
    if (!applied.ok) throw Error(applied.error)
    const input: DefinitionCraftStrategy = {
      maxSteps: 20,
      flow: {
        entryStageId: 'a',
        stages: [
          { id: 'a', name: '阶段一' },
          { id: 'b', name: '阶段二' },
        ],
      },
      rules: [
        {
          stageId: 'a',
          nextStageId: 'b',
          conditions: [{ kind: 'selected-targets', targetIds: ['t7'], min: 1, value: false }],
          action: { kind: 'currency', currency: 'transmutation' },
        },
        { stageId: 'b', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
      ],
    }
    const states = [initial, applied.value]
    expect(
      definitionStrategyStageAt(source, states, [operation], input, 0, 1, {
        definitions: definitions(),
      }),
    ).toEqual({ ok: true, value: 'b' })
    expect(
      definitionStrategyStageAt(source, states, [operation], input, 0, 0, {
        definitions: definitions(),
      }),
    ).toEqual({ ok: true, value: 'a' })
    expect(
      definitionStrategyStageAt(source, states, [operation], input, 0, 2, {
        definitions: definitions(),
      }).ok,
    ).toBe(false)
    expect(
      definitionStrategyStageAt(source, states, [operation], input, 0, 1, {
        definitions: { ...definitions(), targets: [{ targetId: 't8', modId: 'p1' }] },
      }),
    ).toEqual({ ok: true, value: 'a' })
  })

  it('旧入口保留按类型重加恢复，新入口拒绝非法定义和混合goals', () => {
    const legacy = {
      maxSteps: 20,
      rules: [
        {
          conditions: [{ kind: 'selected-targets' as const, modIds: ['p1'], min: 1, value: false }],
          action: { kind: 'stop' as const },
        },
      ],
    }
    expect(
      evaluateCraftStrategy(catalog(), state('normal'), legacy, 0, { targetModIds: ['p1'] }),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
    expect(
      evaluateDefinitionCraftStrategy(catalog(), state(), strategy(), 0, {
        definitions: { ...definitions(), nextTargetId: 7 },
      }).ok,
    ).toBe(false)
    for (const targetImplicitValues of [null, undefined]) {
      expect(
        evaluateDefinitionCraftStrategy(catalog(), state(), strategy(), 0, {
          definitions: definitions(),
          targetImplicitValues,
        } as never).ok,
      ).toBe(false)
    }
    expect(
      evaluateDefinitionCraftStrategy(catalog(), state(), strategy(), 0, {
        definitions: definitions(),
        targetModIds: ['p1'],
      } as never).ok,
    ).toBe(false)
  })

  it('有效值随真实催化品质判断，目标顺序变化不改变稳定引用', () => {
    const initial = imported()
    if (!initial.ok) throw Error(initial.error)
    const config: CraftTargetDefinitions = {
      nextTargetId: 20,
      targets: [
        { targetId: 't7', modId: 'IncreasedLife1' },
        { targetId: 't15', modId: 'FireResist1' },
      ],
      alternatives: [],
      values: [
        {
          targetId: 't7',
          modId: 'IncreasedLife1',
          basis: 'effective',
          bounds: [{ index: 0, min: 22 }],
        },
      ],
    }
    expect(
      evaluateDefinitionCraftStrategy(catalystCatalog, initial.value, strategy(), 0, {
        definitions: config,
      }),
    ).toMatchObject({ ok: true, value: { kind: 'stop', ruleIndex: 0 } })
    const reordered = { ...config, targets: [...config.targets].reverse() }
    expect(
      evaluateDefinitionCraftStrategy(catalystCatalog, initial.value, strategy(), 0, {
        definitions: reordered,
      }),
    ).toEqual(
      evaluateDefinitionCraftStrategy(catalystCatalog, initial.value, strategy(), 0, {
        definitions: config,
      }),
    )
    expect(
      evaluateDefinitionCraftStrategy(
        catalystCatalog,
        { ...initial.value, catalyst: { id: 'Flesh', quality: 10 } },
        strategy('t7', false),
        0,
        { definitions: config },
      ),
    ).toMatchObject({ ok: true, value: { kind: 'stop', ruleIndex: 0 } })
  })

  it('读取允许尚未关联的安全整数引用，拒绝超限与循环树且不更改输入', () => {
    const input = strategy(`t${Number.MAX_SAFE_INTEGER}`)
    const original = structuredClone(input)
    expect(readDefinitionCraftStrategy(input)).toEqual({ ok: true, value: input })
    expect(input).toEqual(original)
    expect(readDefinitionCraftStrategy(strategy('t9007199254740992')).ok).toBe(false)
    const cyclic: { kind: string; condition?: unknown } = { kind: 'not' }
    cyclic.condition = cyclic
    expect(
      readDefinitionCraftStrategy({
        maxSteps: 20,
        rules: [{ conditions: [cyclic], action: { kind: 'stop' } }],
      }).ok,
    ).toBe(false)
  })

  it('合法建筑师摧毁历史的三个游标均可回放阶段，不把终止状态当制作起点', () => {
    const source = catalog()
    const initial = state('rare', ['p1'])
    const vaal = { kind: 'vaal' as const, outcome: 'unchanged' as const }
    const destroy = { kind: 'architect' as const, outcome: 'destroy' as const }
    const corrupted = applyCraftStep(source, initial, vaal)
    if (!corrupted.ok) throw Error(corrupted.error)
    const terminal = applyCraftStep(source, corrupted.value, destroy)
    if (!terminal.ok) throw Error(terminal.error)
    const input: DefinitionCraftStrategy = {
      maxSteps: 20,
      flow: { entryStageId: 'a', stages: [{ id: 'a', name: '制作' }] },
      rules: [
        {
          stageId: 'a',
          conditions: [{ kind: 'selected-targets', targetIds: ['t7'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
      ],
    }
    const legacy = {
      ...input,
      rules: [
        {
          ...input.rules[0],
          stageId: 'a',
          conditions: [{ kind: 'selected-targets' as const, modIds: ['p1'], min: 1, value: true }],
          action: { kind: 'stop' as const },
        },
      ],
    }
    const states = [initial, corrupted.value, terminal.value]
    for (const cursor of [0, 1, 2]) {
      const expected = strategyStageAt(source, states, [vaal, destroy], legacy, 0, cursor, {
        targetModIds: ['p1'],
      })
      expect(expected).toEqual({ ok: true, value: 'a' })
      expect(
        definitionStrategyStageAt(source, states, [vaal, destroy], input, 0, cursor, {
          definitions: definitions(),
        }),
      ).toEqual(expected)
    }
    expect(
      definitionStrategyStageAt(source, [terminal.value], [], input, 0, 0, {
        definitions: definitions(),
      }).ok,
    ).toBe(false)
    expect(
      definitionStrategyStageAt(source, [initial, terminal.value], [vaal], input, 1, 1, {
        definitions: definitions(),
      }).ok,
    ).toBe(false)
  })

  it('新阶段按当前实际数值验证有效值目标，不退回有行身份歧义的历史起点', () => {
    const source = boneCatalog()
    const mod = source.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw Error('缺少测试词缀')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const initial = {
      ...boneState(),
      affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }],
    }
    const operation = {
      currency: 'chaos' as const,
      removeModId: 'prefix1',
      modIds: ['prefix1'],
      rolls: [{ modId: 'prefix1', values: [8, 4] }],
    }
    const after = applyCraftStep(source, initial, operation)
    if (!after.ok) throw Error(after.error)
    const legacyGoals = {
      targetModIds: ['prefix1'],
      targetValues: [
        { modId: 'prefix1', basis: 'effective' as const, bounds: [{ index: 0, min: 7 }] },
      ],
    }
    expect(createTargetDefinitions(source, initial, legacyGoals).ok).toBe(false)
    const config = createTargetDefinitions(source, after.value, legacyGoals)
    if (!config.ok) throw Error(config.error)
    const input: DefinitionCraftStrategy = {
      ...strategy('t1'),
      flow: { entryStageId: 'a', stages: [{ id: 'a', name: '制作' }] },
      rules: [
        {
          stageId: 'a',
          conditions: [{ kind: 'selected-targets', targetIds: ['t1'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
      ],
    }
    const goals = { definitions: config.value }
    expect(evaluateDefinitionCraftStrategy(source, after.value, input, 1, goals)).toEqual({
      ok: true,
      value: { kind: 'stop', reason: 'rule', ruleIndex: 0 },
    })
    expect(
      definitionStrategyStageAt(source, [initial, after.value], [operation], input, 1, 1, goals),
    ).toEqual({ ok: true, value: 'a' })
    const vaal = { kind: 'vaal' as const, outcome: 'unchanged' as const }
    const corrupted = applyCraftStep(source, after.value, vaal)
    if (!corrupted.ok) throw Error(corrupted.error)
    const destroy = { kind: 'architect' as const, outcome: 'destroy' as const }
    const terminal = applyCraftStep(source, corrupted.value, destroy)
    if (!terminal.ok) throw Error(terminal.error)
    expect(
      definitionStrategyStageAt(
        source,
        [initial, after.value, corrupted.value, terminal.value],
        [operation, vaal, destroy],
        input,
        3,
        3,
        goals,
      ),
    ).toEqual({ ok: true, value: 'a' })
  })
})
