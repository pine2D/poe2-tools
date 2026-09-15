import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { type DefinitionCraftStrategy, evaluateDefinitionCraftStrategy } from './definitionStrategy'
import type { CraftResult } from './rehearsal'
import {
  editTargetDefinitionContext,
  readTargetDefinitionContext,
  setTargetDefinitionStrategy,
} from './targetDefinitionContext'
import type { CraftTargetDefinitionContext } from './targetDefinitionMigration'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function fixture() {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  const context: CraftTargetDefinitionContext = {
    definitions: {
      nextTargetId: 40,
      targets: [
        { targetId: 't7', modId: 'prefix1' },
        { targetId: 't21', modId: 'suffix1' },
      ],
      alternatives: [],
      values: [{ targetId: 't7', modId: 'prefix1', bounds: [{ index: 0, min: 3 }] }],
      fracturedTargetId: 't7',
      minimumTargetCount: 2,
    },
    orphanedTargets: [{ targetId: 't3', modId: 'prefix1' }],
    strategy: {
      maxSteps: 20,
      flow: {
        entryStageId: 'a',
        stages: [
          { id: 'a', name: '开始' },
          { id: 'b', name: '完成' },
        ],
      },
      rules: [
        {
          stageId: 'a',
          nextStageId: 'b',
          conditions: [
            {
              kind: 'any',
              conditions: [
                { kind: 'always' },
                {
                  kind: 'not',
                  condition: {
                    kind: 'selected-targets',
                    targetIds: ['t3', 't7'],
                    min: 1,
                    value: false,
                  },
                },
              ],
            },
          ],
          action: { kind: 'jump' },
        },
        {
          stageId: 'b',
          conditions: [{ kind: 'selected-targets', targetIds: ['t21'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  return { catalog, state, context }
}
function strategy(targetIds: string[]): DefinitionCraftStrategy {
  return {
    maxSteps: 20,
    rules: [
      {
        conditions: [{ kind: 'selected-targets', targetIds, min: 1, value: true }],
        action: { kind: 'stop' },
      },
    ],
  }
}

describe('目标与指引的持久上下文', () => {
  it('读取拒绝继承的嵌套定义与隐藏策略字段，不能先投影清洗', () => {
    const { catalog, state, context } = fixture()
    const hiddenStrategy = strategy(['t7'])
    const condition = hiddenStrategy.rules[0]?.conditions[0]
    if (!condition) throw Error('缺少条件')
    Object.defineProperty(condition, 'extra', { value: undefined, enumerable: false })
    for (const input of [
      { ...context, definitions: Object.create(context.definitions) },
      { ...context, orphanedTargets: [], strategy: hiddenStrategy },
    ]) {
      expect(readTargetDefinitionContext(catalog, state.baseId, input).ok).toBe(false)
      expect(setTargetDefinitionStrategy(catalog, state.baseId, input).ok).toBe(false)
      expect(
        editTargetDefinitionContext(catalog, state, input, { kind: 'minimum', count: 1 }).ok,
      ).toBe(false)
    }
  })

  it('设置策略与编辑入口拒绝隐藏或继承字段，不把输入修复为合法动作', () => {
    const { catalog, state, context } = fixture()
    const input = strategy(['t7'])
    const rule = input.rules[0]
    if (!rule) throw Error('缺少规则')
    Object.defineProperty(rule.action, 'extra', { value: undefined, enumerable: false })
    expect(setTargetDefinitionStrategy(catalog, state.baseId, context, input).ok).toBe(false)
    const edit = Object.create({ kind: 'remove', targetId: 't7' })
    expect(editTargetDefinitionContext(catalog, state, context, edit).ok).toBe(false)
    const hidden = Object.defineProperty({ kind: 'minimum', count: 1 }, 'extra', {
      value: undefined,
      enumerable: false,
    })
    expect(editTargetDefinitionContext(catalog, state, context, hidden).ok).toBe(false)
  })

  it('拒绝访问器和自定义转换时不读取getter或执行toJSON', () => {
    const { catalog, state, context } = fixture()
    let getterCalls = 0
    let conversionCalls = 0
    const input = strategy(['t7'])
    const condition = input.rules[0]?.conditions[0]
    if (!condition) throw Error('缺少条件')
    Object.defineProperty(condition, 'min', {
      enumerable: true,
      get: () => {
        getterCalls++
        return 1
      },
    })
    const read = readTargetDefinitionContext(catalog, state.baseId, {
      ...context,
      orphanedTargets: [],
      strategy: input,
    })
    const set = setTargetDefinitionStrategy(catalog, state.baseId, context, input)
    const edit = Object.defineProperty({ kind: 'minimum' }, 'count', {
      enumerable: true,
      get: () => {
        getterCalls++
        return 1
      },
    })
    const edited = editTargetDefinitionContext(catalog, state, context, edit)
    expect(getterCalls).toBe(0)
    expect([read.ok, set.ok, edited.ok]).toEqual([false, false, false])
    const conversion = strategy(['t7'])
    const action = conversion.rules[0]?.action
    if (!action) throw Error('缺少动作')
    Object.defineProperty(action, 'toJSON', {
      value: () => {
        conversionCalls++
        return { kind: 'stop' }
      },
      enumerable: false,
    })
    expect(
      readTargetDefinitionContext(catalog, state.baseId, {
        ...context,
        orphanedTargets: [],
        strategy: conversion,
      }).ok,
    ).toBe(false)
    expect(setTargetDefinitionStrategy(catalog, state.baseId, context, conversion).ok).toBe(false)
    expect(conversionCalls).toBe(0)
  })

  it('读取保留稳定身份、游标与孤儿原序，孤儿不参与目标完成', () => {
    const { catalog, state, context } = fixture()
    const input = {
      ...context,
      orphanedTargets: [{ targetId: 't5', modId: 'suffix2' }, ...context.orphanedTargets],
      strategy: strategy(['t3', 't5', 't7']),
    }
    const read = value(readTargetDefinitionContext(catalog, state.baseId, input))
    expect(read).toEqual(input)
    expect(read.definitions.targets).toEqual([
      { targetId: 't7', modId: 'prefix1' },
      { targetId: 't21', modId: 'suffix1' },
    ])
    if (!read.strategy) throw Error('缺少策略')
    expect(
      evaluateDefinitionCraftStrategy(catalog, state, read.strategy, 0, {
        definitions: read.definitions,
      }),
    ).toMatchObject({ ok: true, value: { kind: 'blocked' } })
  })

  it('根与孤儿严格校验；全阶段嵌套引用不能漏、多、重、交叠或越过游标', () => {
    const { catalog, state, context } = fixture()
    for (const input of [
      null,
      [],
      { ...context, unknown: true },
      { ...context, strategy: undefined },
      { ...context, orphanedTargets: undefined },
      { ...context, orphanedTargets: [] },
      { ...context, orphanedTargets: [...context.orphanedTargets, ...context.orphanedTargets] },
      {
        ...context,
        orphanedTargets: [...context.orphanedTargets, { targetId: 't9', modId: 'suffix2' }],
      },
      {
        ...context,
        orphanedTargets: [...context.orphanedTargets, { targetId: 't7', modId: 'prefix1' }],
      },
      ...['t03', 'a3', 't0', 't40', 't9007199254740992'].map((targetId) => ({
        ...context,
        orphanedTargets: [{ targetId, modId: 'prefix1' }],
      })),
      { ...context, orphanedTargets: [{ targetId: 't3', modId: 'missing' }] },
      { ...context, orphanedTargets: [{ targetId: 't3', modId: 'prefix1', extra: undefined }] },
      { ...context, orphanedTargets: [{ targetId: 't3', modId: undefined }] },
      { ...context, strategy: strategy(['t7', 't39']) },
      { definitions: context.definitions, orphanedTargets: context.orphanedTargets },
    ])
      expect(readTargetDefinitionContext(catalog, state.baseId, input).ok).toBe(false)
    expect(readTargetDefinitionContext(catalog, 'missing', context).ok).toBe(false)
    const invalidDefinition = {
      ...context,
      definitions: {
        ...context.definitions,
        targets: [{ targetId: 't7', modId: 'exclusive1' }],
        values: [],
        fracturedTargetId: 't7',
      },
    }
    expect(readTargetDefinitionContext(catalog, state.baseId, invalidDefinition).ok).toBe(false)
  })

  it('删除后记录旧实例身份，同类型重加不接替引用，允许两代同类型孤儿', () => {
    const { catalog, state, context } = fixture()
    const removed = value(
      editTargetDefinitionContext(catalog, state, context, { kind: 'remove', targetId: 't7' }),
    )
    expect(removed.orphanedTargets).toEqual([
      { targetId: 't3', modId: 'prefix1' },
      { targetId: 't7', modId: 'prefix1' },
    ])
    expect(removed.definitions).toEqual({
      nextTargetId: 40,
      targets: [{ targetId: 't21', modId: 'suffix1' }],
      alternatives: [],
      values: [],
      minimumTargetCount: 1,
    })
    const added = value(
      editTargetDefinitionContext(catalog, state, removed, { kind: 'add', modId: 'prefix1' }),
    )
    expect(added.definitions.targets).toEqual([
      { targetId: 't21', modId: 'suffix1' },
      { targetId: 't40', modId: 'prefix1' },
    ])
    expect(added.definitions.nextTargetId).toBe(41)
    expect(added.orphanedTargets).toEqual(removed.orphanedTargets)
    expect(added.strategy).toEqual(context.strategy)
    expect(readTargetDefinitionContext(catalog, state.baseId, added).ok).toBe(true)
  })

  it('完整替换为所有新目标分配身份，保留旧策略实际引用的原类型', () => {
    const { catalog, state, context } = fixture()
    const replaced = value(
      editTargetDefinitionContext(catalog, state, context, {
        kind: 'replace',
        config: { targetModIds: ['suffix2', 'prefix1'] },
      }),
    )
    expect(replaced.definitions.targets).toEqual([
      { targetId: 't40', modId: 'suffix2' },
      { targetId: 't41', modId: 'prefix1' },
    ])
    expect(replaced.definitions.nextTargetId).toBe(42)
    expect(replaced.orphanedTargets).toEqual([
      { targetId: 't3', modId: 'prefix1' },
      { targetId: 't7', modId: 'prefix1' },
      { targetId: 't21', modId: 'suffix1' },
    ])
    expect(replaced.strategy).toEqual(context.strategy)
    const reordered = value(
      editTargetDefinitionContext(catalog, state, replaced, {
        kind: 'reorder',
        targetIds: ['t41', 't40'],
      }),
    )
    expect(reordered.orphanedTargets).toEqual(replaced.orphanedTargets)
    expect(reordered.definitions.nextTargetId).toBe(42)
  })

  it('策略显式修复只清理不再引用的孤儿，关闭后保留游标且旧元数据不能凭空找回', () => {
    const { catalog, state, context } = fixture()
    const removed = value(
      editTargetDefinitionContext(catalog, state, context, { kind: 'remove', targetId: 't7' }),
    )
    const added = value(
      editTargetDefinitionContext(catalog, state, removed, { kind: 'add', modId: 'prefix1' }),
    )
    const repaired = value(
      setTargetDefinitionStrategy(catalog, state.baseId, added, strategy(['t40', 't7'])),
    )
    expect(repaired.orphanedTargets).toEqual([{ targetId: 't7', modId: 'prefix1' }])
    expect(repaired.definitions).toEqual(added.definitions)
    expect(setTargetDefinitionStrategy(catalog, state.baseId, repaired, strategy(['t3'])).ok).toBe(
      false,
    )
    const cleared = value(setTargetDefinitionStrategy(catalog, state.baseId, repaired))
    expect(cleared.orphanedTargets).toEqual([])
    expect(Object.hasOwn(cleared, 'strategy')).toBe(false)
    expect(cleared.definitions.nextTargetId).toBe(41)
    expect(setTargetDefinitionStrategy(catalog, state.baseId, cleared, strategy(['t7'])).ok).toBe(
      false,
    )
    expect(
      value(setTargetDefinitionStrategy(catalog, state.baseId, cleared, strategy(['t40'])))
        .orphanedTargets,
    ).toEqual([])
  })

  it('所有读取和成功编辑结果深拷贝，失败不修改输入或顺便修复伪造上下文', () => {
    const { catalog, state, context } = fixture()
    const before = structuredClone({ state, context })
    const read = value(readTargetDefinitionContext(catalog, state.baseId, context))
    const orphan = read.orphanedTargets[0]
    const bound = read.definitions.values[0]?.bounds[0]
    const stage = read.strategy?.flow?.stages[0]
    if (!orphan || !bound || !stage) throw Error('缺少读取结果')
    orphan.modId = 'changed'
    bound.min = 9
    stage.name = 'changed'
    const updatedStrategy = strategy(['t7'])
    const updatedBefore = structuredClone(updatedStrategy)
    const changed = value(
      setTargetDefinitionStrategy(catalog, state.baseId, context, updatedStrategy),
    )
    changed.strategy?.rules[0]?.conditions.push({ kind: 'always' })
    const reordered = value(
      editTargetDefinitionContext(catalog, state, context, {
        kind: 'reorder',
        targetIds: ['t21', 't7'],
      }),
    )
    const reorderedOrphan = reordered.orphanedTargets[0]
    if (!reorderedOrphan) throw Error('缺少失联目标')
    reorderedOrphan.modId = 'changed'
    expect({ state, context }).toEqual(before)
    expect(updatedStrategy).toEqual(updatedBefore)
    for (const broken of [
      { ...context, orphanedTargets: [] },
      { ...context, definitions: { ...context.definitions, nextTargetId: 1 } },
    ]) {
      expect(
        editTargetDefinitionContext(catalog, state, broken, {
          kind: 'replace',
          config: { targetModIds: [] },
        }).ok,
      ).toBe(false)
      expect(setTargetDefinitionStrategy(catalog, state.baseId, broken).ok).toBe(false)
    }
    expect(
      editTargetDefinitionContext(catalog, state, context, { kind: 'add', modId: 'prefix1' }).ok,
    ).toBe(false)
    expect({ state, context }).toEqual(before)
  })

  it('无策略的未引用删除不会产生孤儿，开启规则只允许已知 ID 元数据', () => {
    const { catalog, state, context } = fixture()
    const plain = value(setTargetDefinitionStrategy(catalog, state.baseId, context))
    const removed = value(
      editTargetDefinitionContext(catalog, state, plain, { kind: 'remove', targetId: 't7' }),
    )
    expect(removed.orphanedTargets).toEqual([])
    expect(removed.definitions.nextTargetId).toBe(40)
    expect(setTargetDefinitionStrategy(catalog, state.baseId, removed, strategy(['t7'])).ok).toBe(
      false,
    )
    expect(setTargetDefinitionStrategy(catalog, state.baseId, removed, strategy(['t39'])).ok).toBe(
      false,
    )
    expect(setTargetDefinitionStrategy(catalog, state.baseId, removed, strategy(['t21'])).ok).toBe(
      true,
    )
  })
  it('拒绝由继承字段伪装的完整上下文或孤儿元数据', () => {
    const { catalog, state, context } = fixture()
    const plain = { definitions: context.definitions, orphanedTargets: [] }
    expect(readTargetDefinitionContext(catalog, state.baseId, Object.create(plain)).ok).toBe(false)
    expect(
      readTargetDefinitionContext(catalog, state.baseId, {
        ...context,
        orphanedTargets: [Object.create({ targetId: 't3', modId: 'prefix1' })],
      }).ok,
    ).toBe(false)
  })

  it('当前数值有歧义时仍可读取和编辑已合法保存的有效值目标', () => {
    const { catalog, state, context } = fixture()
    const mod = catalog.modifiers.find((entry) => entry.id === 'prefix1')
    if (!mod) throw Error('缺少词缀')
    mod.lines = ['Value (1-10)', 'Value (1-5)']
    const ambiguous = { ...state, affixes: [{ modId: 'prefix1', lines: ['Value 3', 'Value 4'] }] }
    const input: CraftTargetDefinitionContext = {
      ...context,
      definitions: {
        ...context.definitions,
        values: [
          { targetId: 't7', modId: 'prefix1', basis: 'effective', bounds: [{ index: 0, min: 7 }] },
        ],
      },
    }
    expect(readTargetDefinitionContext(catalog, state.baseId, input).ok).toBe(true)
    const edited = value(
      editTargetDefinitionContext(catalog, ambiguous, input, {
        kind: 'reorder',
        targetIds: ['t21', 't7'],
      }),
    )
    expect(edited.definitions.values).toEqual(input.definitions.values)
    expect(edited.definitions.nextTargetId).toBe(40)
    expect(edited.orphanedTargets).toEqual(input.orphanedTargets)
  })
})
