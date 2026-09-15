import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import type { CraftStrategy } from './craftStrategy'
import { evaluateDefinitionCraftStrategy } from './definitionStrategy'
import type { CraftResult } from './rehearsal'
import { editTargetDefinitions } from './targetDefinitionEdits'
import { createTargetDefinitionContext } from './targetDefinitionMigration'
import type { LegacyCraftTargetConfig } from './targetDefinitions'

function value<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const config: LegacyCraftTargetConfig = {
  targetModIds: ['prefix1'],
  targetValues: [{ modId: 'prefix1', bounds: [{ index: 0, min: 7 }] }],
}

describe('旧目标与条件指引一起迁移', () => {
  it('按已验证目标顺序初始化，条件使用同一份身份', () => {
    const strategy: CraftStrategy = {
      maxSteps: 12,
      rules: [
        {
          conditions: [{ kind: 'selected-targets', modIds: ['prefix1'], min: 1, value: true }],
          action: { kind: 'stop' },
        },
      ],
    }
    const result = value(
      createTargetDefinitionContext(boneCatalog(), boneState(), config, strategy),
    )
    expect(result).toEqual({
      orphanedTargets: [],
      definitions: {
        nextTargetId: 2,
        targets: [{ targetId: 't1', modId: 'prefix1' }],
        alternatives: [],
        values: [{ targetId: 't1', modId: 'prefix1', bounds: [{ index: 0, min: 7 }] }],
      },
      strategy: {
        ...strategy,
        rules: [
          {
            conditions: [{ kind: 'selected-targets', targetIds: ['t1'], min: 1, value: true }],
            action: { kind: 'stop' },
          },
        ],
      },
    })
  })

  it('所有嵌套与阶段共享失联引用编号，只预留编号而不创建目标', () => {
    const strategy: CraftStrategy = {
      maxSteps: 20,
      flow: {
        entryStageId: 'first',
        stages: [
          { id: 'first', name: '第一步' },
          { id: 'end', name: '结束' },
        ],
      },
      rules: [
        {
          stageId: 'first',
          nextStageId: 'end',
          conditions: [
            {
              kind: 'any',
              conditions: [
                {
                  kind: 'not',
                  condition: {
                    kind: 'selected-targets',
                    modIds: ['suffix1', 'prefix1'],
                    min: 1,
                    value: false,
                  },
                },
                { kind: 'selected-targets', modIds: ['suffix2'], min: 1, value: true },
              ],
            },
          ],
          action: { kind: 'jump' },
        },
        {
          stageId: 'end',
          conditions: [
            { kind: 'selected-targets', modIds: ['suffix2', 'suffix1'], min: 2, value: true },
          ],
          action: { kind: 'stop' },
        },
      ],
    }
    const input = structuredClone({ config, strategy })
    const result = value(
      createTargetDefinitionContext(boneCatalog(), boneState(), config, strategy),
    )
    expect(result.definitions.targets).toEqual([{ targetId: 't1', modId: 'prefix1' }])
    expect(result.definitions.nextTargetId).toBe(4)
    expect(result).toHaveProperty('orphanedTargets', [
      { targetId: 't2', modId: 'suffix1' },
      { targetId: 't3', modId: 'suffix2' },
    ])
    expect(result.strategy?.rules[0]?.conditions).toEqual([
      {
        kind: 'any',
        conditions: [
          {
            kind: 'not',
            condition: { kind: 'selected-targets', targetIds: ['t2', 't1'], min: 1, value: false },
          },
          { kind: 'selected-targets', targetIds: ['t3'], min: 1, value: true },
        ],
      },
    ])
    expect(result.strategy?.rules[1]?.conditions).toEqual([
      { kind: 'selected-targets', targetIds: ['t3', 't2'], min: 2, value: true },
    ])
    expect(result.strategy?.flow).toEqual(strategy.flow)
    expect({ config, strategy }).toEqual(input)
    const stage = result.strategy?.flow?.stages[0]
    const bound = result.definitions.values[0]?.bounds[0]
    if (!stage || !bound) throw new Error('缺少阶段或数值')
    stage.name = '改名'
    bound.min = 8
    expect({ config, strategy }).toEqual(input)
  })

  it('没有目标时仍预留旧失联引用，不把未达成条件当作无条件', () => {
    const result = value(
      createTargetDefinitionContext(
        boneCatalog(),
        boneState(),
        { targetModIds: [] },
        {
          maxSteps: 10,
          rules: [
            {
              conditions: [{ kind: 'selected-targets', modIds: ['suffix1'], min: 1, value: false }],
              action: { kind: 'stop' },
            },
          ],
        },
      ),
    )
    expect(result.definitions).toEqual({
      targets: [],
      alternatives: [],
      values: [],
      nextTargetId: 2,
    })
    expect(result.strategy?.rules[0]?.conditions).toEqual([
      { kind: 'selected-targets', targetIds: ['t1'], min: 1, value: false },
    ])
  })

  it('未提供指引时不创建可选字段；已知其他条件和动作不改写', () => {
    const plain = value(createTargetDefinitionContext(boneCatalog(), boneState(), config))
    expect(Object.hasOwn(plain, 'strategy')).toBe(false)
    expect(plain).toHaveProperty('orphanedTargets', [])
    const strategy: CraftStrategy = {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'rarity', value: 'rare' }],
          action: { kind: 'currency', currency: 'annulment' },
        },
      ],
    }
    const result = value(
      createTargetDefinitionContext(boneCatalog(), boneState(), config, strategy),
    )
    expect(result.strategy).toEqual(strategy)
    expect(result.definitions).toEqual(plain.definitions)
  })

  it('旧目标或指引无效时拒绝，不先改写类型字段使其合法', () => {
    for (const invalid of [
      { ...config, targetModIds: ['prefix1', 'prefix1'] },
      { ...config, nextTargetId: 20 },
      { ...config, targetValues: undefined },
    ])
      expect(
        createTargetDefinitionContext(
          boneCatalog(),
          boneState(),
          invalid as LegacyCraftTargetConfig,
        ).ok,
      ).toBe(false)
    for (const condition of [
      { kind: 'selected-targets', targetIds: ['t1'], min: 1, value: true },
      { kind: 'selected-targets', modIds: ['prefix1'], targetIds: ['t1'], min: 1, value: true },
      { kind: 'selected-targets', modIds: ['prefix1'], min: 2, value: true },
    ])
      expect(
        createTargetDefinitionContext(boneCatalog(), boneState(), config, {
          maxSteps: 10,
          rules: [{ conditions: [condition], action: { kind: 'stop' } }],
        } as CraftStrategy).ok,
      ).toBe(false)
  })

  it('迁移保留的失联引用不会被同类型新目标接替，明确编辑条件后才恢复', () => {
    const catalog = boneCatalog()
    const state = boneState(['prefix1', 'suffix1'])
    const context = value(
      createTargetDefinitionContext(catalog, state, config, {
        maxSteps: 10,
        rules: [
          {
            conditions: [{ kind: 'selected-targets', modIds: ['suffix1'], min: 1, value: true }],
            action: { kind: 'currency', currency: 'annulment' },
          },
        ],
      }),
    )
    if (!context.strategy) throw new Error('缺少迁移指引')
    const evaluate = (definitions = context.definitions, strategy = context.strategy) => {
      if (!strategy) throw new Error('缺少指引')
      return value(evaluateDefinitionCraftStrategy(catalog, state, strategy, 0, { definitions }))
    }
    expect(evaluate()).toMatchObject({ kind: 'blocked', ruleIndex: 0 })
    const added = value(
      editTargetDefinitions(catalog, state, context.definitions, { kind: 'add', modId: 'suffix1' }),
    )
    expect(added.targets).toEqual([
      { targetId: 't1', modId: 'prefix1' },
      { targetId: 't3', modId: 'suffix1' },
    ])
    expect(added.nextTargetId).toBe(4)
    expect(evaluate(added)).toMatchObject({ kind: 'blocked', ruleIndex: 0 })
    expect(
      evaluate(added, {
        ...context.strategy,
        rules: [
          {
            conditions: [{ kind: 'selected-targets', targetIds: ['t3'], min: 1, value: true }],
            action: { kind: 'currency', currency: 'annulment' },
          },
        ],
      }),
    ).toMatchObject({ kind: 'action', action: { kind: 'currency', currency: 'annulment' } })
  })
})
