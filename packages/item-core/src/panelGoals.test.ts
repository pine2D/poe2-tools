import { describe, expect, it, vi } from 'vitest'
import { type DefinitionCraftStrategy, evaluateDefinitionCraftStrategy } from './definitionStrategy'
import { catalog, state } from './partialTargetFixture'
import { editTargetDefinitionContext } from './targetDefinitionContext'
import { editTargetDefinitions } from './targetDefinitionEdits'
import {
  type CraftTargetDefinitions,
  validateStoredTargetDefinitions,
  validateTargetDefinitions,
} from './targetDefinitions'
import { evaluateTargetDefinitions } from './targetProgress'

const data = () =>
  catalog(undefined, { type: 'Helmet', properties: { Armour: 18 }, sourceQuality: 0 })
const item = () => ({ ...state('normal'), quality: 0, sockets: [] })
const goal = { kind: 'item-property', property: 'Armour', min: 40 } as const
const definitions = (): CraftTargetDefinitions => ({
  nextTargetId: 1,
  targets: [],
  alternatives: [],
  values: [],
  panelGoals: [goal],
})

it('定位同一面板的互斥范围，包含端点与不同指标不误报', () => {
  expect(api.craftPanelGoalConflict([goal, { ...goal, min: 0, max: 39 }])).toMatch(
    /面板目标 1 与面板目标 2.*没有交集/,
  )
  expect(api.craftPanelGoalConflict([goal, { ...goal, min: 0, max: 40 }])).toBeNull()
  expect(
    api.craftPanelGoalConflict([goal, { ...goal, property: 'Evasion', min: 0, max: 1 }]),
  ).toBeNull()
  expect(api.craftPanelGoalConflict([])).toBeNull()
})

it('相同加权公式可定位冲突，不把不同系数或不同求和顺序视作同一公式', () => {
  const weighted: api.CraftPanelGoal = {
    kind: 'weighted-properties',
    terms: [
      { property: 'Armour', weight: 2 },
      { property: 'Evasion', weight: -1 },
    ],
    min: 10,
  }
  expect(api.craftPanelGoalConflict([goal, weighted, { ...weighted, min: 0, max: 9 }])).toMatch(
    /面板目标 2 与面板目标 3/,
  )
  expect(
    api.craftPanelGoalConflict([
      weighted,
      { ...weighted, terms: [{ property: 'Armour', weight: 1 }], min: 0, max: 9 },
    ]),
  ).toBeNull()
  expect(
    api.craftPanelGoalConflict([
      weighted,
      { ...weighted, terms: [...weighted.terms].reverse(), min: 0, max: 9 },
    ]),
  ).toBeNull()
})

describe('面板目标接入完整定义', () => {
  it('纯面板目标参与合取，显式计数和旧返回形状不改变', () => {
    expect(evaluateTargetDefinitions(data(), item(), definitions())).toEqual({
      matches: [],
      unmatchedTargetIds: [],
      requiredMatched: true,
      satisfied: false,
    })
    const { panelGoals: _, ...legacy } = definitions()
    expect(evaluateTargetDefinitions(data(), item(), legacy).satisfied).toBe(true)
  })
  it('读取、编辑和上下文支持纯面板且清空删除字段', () => {
    const input = definitions()
    expect(validateTargetDefinitions(data(), item(), input)).toEqual({ ok: true, value: input })
    expect(validateStoredTargetDefinitions(data(), item().baseId, input)).toEqual({
      ok: true,
      value: input,
    })
    const edited = editTargetDefinitions(data(), item(), input, {
      kind: 'panel-goals',
      goals: [{ ...goal, min: 18 }],
    })
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw Error(edited.error)
    expect(evaluateTargetDefinitions(data(), item(), edited.value).satisfied).toBe(true)
    expect(input.panelGoals?.[0]?.min).toBe(40)
    const cleared = editTargetDefinitionContext(
      data(),
      item(),
      { definitions: input, orphanedTargets: [] },
      { kind: 'panel-goals', goals: [] },
    )
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) throw Error(cleared.error)
    expect(cleared.value.definitions).not.toHaveProperty('panelGoals')
  })
  it.each([true, false])('未知面板阻塞完整目标条件（value=%s）', (value) => {
    const strategy: DefinitionCraftStrategy = {
      maxSteps: 10,
      rules: [{ conditions: [{ kind: 'targets-met', value }], action: { kind: 'stop' } }],
    }
    const { quality: _, ...unknown } = item()
    expect(
      evaluateDefinitionCraftStrategy(data(), unknown, strategy, 0, { definitions: definitions() }),
    ).toMatchObject({
      ok: true,
      value: { kind: 'blocked', ruleIndex: 0, message: expect.stringContaining('品质') },
    })
  })
  it('未知面板不阻塞仅检查显式选择的策略', () => {
    const strategy: DefinitionCraftStrategy = {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'selected-targets', targetIds: ['t1'], min: 1, value: false }],
          action: { kind: 'stop' },
        },
      ],
    }
    const input = { ...definitions(), nextTargetId: 2, targets: [{ targetId: 't1', modId: 'p1' }] }
    expect(
      evaluateDefinitionCraftStrategy(data(), state('normal'), strategy, 0, { definitions: input }),
    ).toMatchObject({ ok: true, value: { kind: 'stop', reason: 'rule' } })
  })
})

it('前置规则与逻辑短路不会被未使用的未知面板阻塞', () => {
  const unknown = state('normal')
  const complete = { kind: 'targets-met', value: false } as const
  const strategies: DefinitionCraftStrategy[] = [
    {
      maxSteps: 10,
      rules: [
        { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
        { conditions: [complete], action: { kind: 'stop' } },
      ],
    },
    {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'all', conditions: [complete, { kind: 'rarity', value: 'rare' }] }],
          action: { kind: 'stop' },
        },
        { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
      ],
    },
    {
      maxSteps: 10,
      rules: [
        {
          conditions: [{ kind: 'any', conditions: [complete, { kind: 'always' }] }],
          action: { kind: 'stop' },
        },
      ],
    },
  ]
  for (const strategy of strategies)
    expect(
      evaluateDefinitionCraftStrategy(data(), unknown, strategy, 0, { definitions: definitions() }),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})

import * as api from './index'

it('面板目标公开读取器拒绝不安全 JSON 与非面板条件，最多八项并深拷贝', () => {
  expect(api.readCraftPanelGoals).toBeTypeOf('function')
  const getter = vi.fn(() => 40)
  for (const bad of [
    null,
    [{ kind: 'always' }],
    [{ kind: 'not', condition: goal }],
    [{ ...goal, min: NaN }],
    Array(9).fill(goal),
    new Array(1),
    [
      {
        ...goal,
        get min() {
          return getter()
        },
      },
    ],
  ])
    expect(api.readCraftPanelGoals(bad).ok).toBe(false)
  expect(getter).not.toHaveBeenCalled()
  expect(api.readCraftPanelGoals([])).toEqual({ ok: true, value: [] })
  expect(api.readCraftPanelGoals(Array(8).fill(goal)).ok).toBe(true)
  const weighted = {
    kind: 'weighted-properties',
    terms: [{ property: 'Armour', weight: -2 }],
    min: -50,
    max: -30,
  } as const
  const input = [weighted]
  const parsed = api.readCraftPanelGoals(input)
  expect(parsed).toEqual({ ok: true, value: input })
  if (!parsed.ok) throw Error(parsed.error)
  const copy = parsed.value[0]
  if (copy?.kind !== 'weighted-properties') throw Error('错误条件类型')
  const term = copy.terms[0]
  if (!term) throw Error('缺少加权项')
  term.weight = 3
  expect(weighted.terms[0].weight).toBe(-2)
})

it('复用面板模型，闭区间、负权重与未知结果可区分，分数衡量接近程度', () => {
  expect(api.evaluateCraftPanelGoals).toBeTypeOf('function')
  const evaluated = api.evaluateCraftPanelGoals(data(), item(), [goal])
  expect(evaluated).toMatchObject({
    satisfied: false,
    statuses: [{ goal, actual: { ok: true, value: 18 }, matched: false }],
  })
  expect(evaluated.score).toBeGreaterThan(0)
  expect(evaluated.score).toBeLessThan(1)
  const closer = api.evaluateCraftPanelGoals(data(), item(), [{ ...goal, min: 20 }])
  expect(closer.score).toBeGreaterThan(evaluated.score)
  expect(
    api.evaluateCraftPanelGoals(data(), item(), [{ ...goal, min: 18, max: 18 }]),
  ).toMatchObject({ satisfied: true, score: 1 })
  expect(
    api.evaluateCraftPanelGoals(data(), item(), [{ ...goal, min: 0, max: 17 }]).satisfied,
  ).toBe(false)
  expect(
    api.evaluateCraftPanelGoals(data(), item(), [
      {
        kind: 'weighted-properties',
        terms: [{ property: 'Armour', weight: -2 }],
        min: -36,
        max: -36,
      },
    ]),
  ).toMatchObject({ satisfied: true, score: 1 })
  expect(api.evaluateCraftPanelGoals(data(), state('normal'), [goal])).toMatchObject({
    satisfied: false,
    score: 0,
    statuses: [{ actual: { ok: false }, matched: false }],
  })
  expect(api.evaluateCraftPanelGoals(data(), item(), [])).toEqual({
    statuses: [],
    satisfied: true,
    score: 0,
  })
})

it('嵌套取反不能把未知完整目标变成可执行动作', () => {
  const strategy: DefinitionCraftStrategy = {
    maxSteps: 10,
    rules: [
      {
        conditions: [{ kind: 'not', condition: { kind: 'targets-met', value: true } }],
        action: { kind: 'currency', currency: 'transmutation' },
      },
      { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
    ],
  }
  expect(
    evaluateDefinitionCraftStrategy(data(), state('normal'), strategy, 0, {
      definitions: definitions(),
    }),
  ).toMatchObject({ ok: true, value: { kind: 'blocked', ruleIndex: 0 } })
})

it('已知纯面板完整目标可达成，显式和面板仍为合取', () => {
  const strategy: DefinitionCraftStrategy = {
    maxSteps: 10,
    rules: [{ conditions: [{ kind: 'targets-met', value: true }], action: { kind: 'stop' } }],
  }
  const input = { ...definitions(), panelGoals: [{ ...goal, min: 18, max: 18 }] }
  expect(
    evaluateDefinitionCraftStrategy(data(), item(), strategy, 0, { definitions: input }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  const combined = { ...input, nextTargetId: 2, targets: [{ targetId: 't1', modId: 'p1' }] }
  expect(evaluateTargetDefinitions(data(), item(), combined)).toMatchObject({
    matches: [],
    satisfied: false,
  })
  expect(
    evaluateTargetDefinitions(data(), { ...item(), ...state('magic', ['p1']) }, combined).satisfied,
  ).toBe(true)
  expect(
    evaluateCraftForGoals([
      { ...goal, min: 18 },
      { ...goal, min: 20 },
    ]).satisfied,
  ).toBe(false)
})
function evaluateCraftForGoals(goals: api.CraftPanelGoal[]) {
  return api.evaluateCraftPanelGoals(data(), item(), goals)
}

it('目标定义拒绝访问器且保留输入与编辑的引用隔离', () => {
  const getter = vi.fn(() => [goal])
  const bad = {
    ...definitions(),
    get panelGoals() {
      return getter()
    },
  }
  expect(validateTargetDefinitions(data(), item(), bad).ok).toBe(false)
  expect(validateStoredTargetDefinitions(data(), item().baseId, bad).ok).toBe(false)
  expect(getter).not.toHaveBeenCalled()
  const input = definitions()
  const goals: api.CraftPanelGoal[] = [
    { kind: 'weighted-properties', terms: [{ property: 'Armour', weight: 2 }], min: 40 },
  ]
  const edited = editTargetDefinitions(data(), item(), input, { kind: 'panel-goals', goals })
  if (!edited.ok) throw Error(edited.error)
  const copy = edited.value.panelGoals?.[0]
  if (copy?.kind !== 'weighted-properties') throw Error('错误条件类型')
  const term = copy.terms[0]
  if (!term) throw Error('缺少加权项')
  term.weight = 10
  expect(goals).toMatchObject([{ terms: [{ weight: 2 }] }])
  expect(input.panelGoals).toEqual([goal])
  expect(
    editTargetDefinitions(data(), item(), input, {
      kind: 'panel-goals',
      goals: [goal],
      extra: true,
    }).ok,
  ).toBe(false)
  expect(
    editTargetDefinitions(data(), item(), input, {
      kind: 'panel-goals',
      goals: [{ ...goal, max: 0 }],
    }).ok,
  ).toBe(false)
  expect(validateTargetDefinitions(data(), item(), { ...input, panelGoals: [] })).toMatchObject({
    ok: true,
    value: { panelGoals: [] },
  })
})
