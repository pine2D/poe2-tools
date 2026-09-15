import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, craftMaterials, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { definitionStrategyStageAt, readDefinitionCraftStrategy } from './definitionStrategy'
import type { CraftState } from './rehearsal'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'
import { operationMatchesStrategyAction, strategyStageAt } from './strategyStages'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const iron = 'pob2:augment:["Iron Rune","weapon"]'
const state: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  nextAffixId: 1,
  sourceText: null,
  sockets: [iron, null, iron],
}
const action = { kind: 'extraction' as const }
const must = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}

describe('萃取石指引与消费', () => {
  it('独立目标阶段只接纳紧邻的真实萃取终态，不接受缺失或其他操作', () => {
    const strategy = {
      maxSteps: 5,
      flow: { entryStageId: 'a', stages: [{ id: 'a', name: '取回符文' }] },
      rules: [{ stageId: 'a', conditions: [{ kind: 'always' as const }], action }],
    }
    const goals = { definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] } }
    const terminal = must(applyCraftStep(catalog, state, action))
    expect(
      definitionStrategyStageAt(catalog, [state, terminal], [action], strategy, 0, 1, goals),
    ).toEqual({ ok: true, value: 'a' })
    expect(definitionStrategyStageAt(catalog, [terminal], [], strategy, 0, 0, goals).ok).toBe(false)
    expect(
      definitionStrategyStageAt(
        catalog,
        [state, terminal],
        [{ kind: 'vaal', outcome: 'unchanged' }],
        strategy,
        0,
        1,
        goals,
      ).ok,
    ).toBe(false)
  })

  it('动作只保存实际材料身份，拒绝伪造返还、额外字段及访问器', () => {
    expect(readCraftStrategyAction(action)).toEqual(action)
    let reads = 0
    const getter = Object.defineProperty({}, 'kind', {
      enumerable: true,
      get: () => {
        reads++
        return 'extraction'
      },
    })
    for (const invalid of [
      { ...action, returns: [] },
      { ...action, count: 2 },
      { ...action, omen: undefined },
      Object.create(action),
      Object.defineProperty({ ...action }, 'extra', { value: undefined }),
      getter,
    ])
      expect(readCraftStrategyAction(invalid)).toBeNull()
    expect(reads).toBe(0)
    expect(
      readDefinitionCraftStrategy({
        maxSteps: 5,
        rules: [{ conditions: [{ kind: 'always' }], action }],
      }).ok,
    ).toBe(true)
  })

  it('同一资格核对已占用、未知、空孔和腐化状态，终态不能再制作', () => {
    expect(checkCraftStrategyAction(catalog, state, action)).toEqual({ ok: true, value: null })
    expect(checkCraftStrategyAction(catalog, { ...state, corrupted: true }, action).ok).toBe(true)
    for (const sockets of [undefined, [], [null], ['missing']])
      expect(
        checkCraftStrategyAction(catalog, { ...state, sockets } as CraftState, action).ok,
      ).toBe(false)
    const terminal = must(applyCraftStep(catalog, state, action))
    expect(checkCraftStrategyAction(catalog, terminal, action).ok).toBe(false)
    expect(applyCraftStep(catalog, terminal, action).ok).toBe(false)
  })

  it('指引按当前孔位决定动作，并遵守步骤上限和未知条件', () => {
    const strategy: CraftStrategy = {
      maxSteps: 2,
      rules: [{ conditions: [{ kind: 'socket-count', min: 1, max: 3 }], action }],
    }
    expect(evaluateCraftStrategy(catalog, state, strategy, 0)).toMatchObject({
      ok: true,
      value: { kind: 'action', action },
    })
    expect(
      evaluateCraftStrategy(catalog, { ...state, sockets: [null] }, strategy, 0),
    ).toMatchObject({
      ok: true,
      value: { kind: 'blocked' },
    })
    const { sockets: _, ...unknown } = state
    expect(evaluateCraftStrategy(catalog, unknown, strategy, 0)).toMatchObject({
      ok: true,
      value: { kind: 'unmatched' },
    })
    expect(evaluateCraftStrategy(catalog, state, strategy, 2)).toMatchObject({
      ok: true,
      value: { kind: 'stop', reason: 'step-limit' },
    })
  })

  it('阶段只匹配萃取实际步骤，其他摧毁不会冒充已完成', () => {
    expect(operationMatchesStrategyAction(state, action, action)).toBe(true)
    expect(
      operationMatchesStrategyAction(state, action, { kind: 'architect', outcome: 'destroy' }),
    ).toBe(false)
    const strategy: CraftStrategy = {
      maxSteps: 5,
      flow: {
        entryStageId: 'recover',
        stages: [
          { id: 'recover', name: '萃取' },
          { id: 'done', name: '结束' },
        ],
      },
      rules: [
        { stageId: 'recover', nextStageId: 'done', conditions: [{ kind: 'always' }], action },
        { stageId: 'done', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
      ],
    }
    const terminal = must(applyCraftStep(catalog, state, action))
    expect(strategyStageAt(catalog, [state, terminal], [action], strategy, 0, 0)).toEqual({
      ok: true,
      value: 'recover',
    })
    expect(strategyStageAt(catalog, [state, terminal], [action], strategy, 0, 1)).toEqual({
      ok: true,
      value: 'done',
    })
  })

  it('一颗萃取石不因返还多个孔内物增减，历史镶嵌支出不抵扣', () => {
    const material = { id: 'currency:extraction', name: 'Orb of Extraction' }
    expect(craftMaterials(catalog)).toContainEqual(material)
    expect(collectCraftCosts(catalog, [])).toEqual({ ok: true, value: [] })
    const steps: CraftStep[] = [
      { kind: 'socket', socketIndex: 0, augmentId: iron },
      { kind: 'socket', socketIndex: 2, augmentId: iron },
      action,
    ]
    const costs = must(collectCraftCosts(catalog, steps))
    expect(costs).toEqual([
      { id: 'augment:Iron Rune', name: 'Iron Rune', count: 2 },
      { ...material, count: 1 },
    ])
    const pricing = {
      unit: 'divine' as const,
      baseCost: 10,
      prices: { 'currency:extraction': 0.5, 'augment:Iron Rune': 3 },
    }
    expect(parseCraftPricing(pricing, catalog)).toEqual({ ok: true, value: pricing })
    expect(quoteCraftCosts(costs, pricing, true)).toMatchObject({
      ok: true,
      value: { total: 16.5 },
    })
    expect(quoteCraftCosts(costs, { unit: 'divine', prices: {} })).toMatchObject({
      ok: true,
      value: { total: null, missing: ['augment:Iron Rune', 'currency:extraction'] },
    })
  })
})
