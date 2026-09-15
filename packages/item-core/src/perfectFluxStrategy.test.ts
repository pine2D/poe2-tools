import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts, craftMaterials, parseCraftPricing, quoteCraftCosts } from './craftCosts'
import { applyCraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy } from './craftStrategy'
import { readDefinitionCraftStrategy } from './definitionStrategy'
import type { CraftState } from './rehearsal'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'
import { readStrategyConditions } from './strategyConditions'
import { operationMatchesStrategyAction, strategyStageAt } from './strategyStages'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const state: CraftState = {
  baseId: 'Rattling Sceptre',
  itemLevel: 53,
  rarity: 'normal',
  sourceText: null,
  affixes: [],
  nextAffixId: 1,
  implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
}
const action = { kind: 'perfect-flux' as const, previousMaxLevel: 13 }

describe('完美溶剂条件指引与费用', () => {
  it('公开条件和独立指引入口不清洗继承、隐藏字段或执行访问器', () => {
    let reads = 0
    const inherited = Object.create({ kind: 'granted-skill-level', min: 20 })
    const hidden = Object.defineProperty({ kind: 'granted-skill-level', min: 20 }, 'extra', {
      value: undefined,
    })
    const accessor = Object.defineProperty({ kind: 'granted-skill-level' }, 'min', {
      enumerable: true,
      get: () => {
        reads++
        return 20
      },
    })
    for (const condition of [inherited, hidden, accessor]) {
      expect(readStrategyConditions([condition])).toBeNull()
      expect(
        readDefinitionCraftStrategy({
          maxSteps: 5,
          rules: [{ conditions: [condition], action: { kind: 'stop' } }],
        }).ok,
      ).toBe(false)
    }
    expect(reads).toBe(0)
  })

  it('严格保存最高等级声明，未知字段和非法等级拒绝', () => {
    expect(readCraftStrategyAction(action)).toEqual(action)
    for (const value of [0, 20, 13.5, undefined, '13', Number.NaN])
      expect(readCraftStrategyAction({ ...action, previousMaxLevel: value })).toBeNull()
    expect(readCraftStrategyAction({ ...action, rolls: [] })).toBeNull()
    expect(readCraftStrategyAction({ ...action, omen: undefined })).toBeNull()
    expect(
      readDefinitionCraftStrategy({
        maxSteps: 5,
        rules: [
          {
            conditions: [{ kind: 'granted-skill-level', min: 1, max: 19 }],
            action,
          },
        ],
      }),
    ).toMatchObject({ ok: true })
  })

  it('装备技能条件使用1–20闭区间，不接受额外字段或反转范围', () => {
    expect(readStrategyConditions([{ kind: 'granted-skill-level', min: 20 }])).toEqual([
      { kind: 'granted-skill-level', min: 20 },
    ])
    for (const condition of [
      { kind: 'granted-skill-level', min: 0 },
      { kind: 'granted-skill-level', min: 21 },
      { kind: 'granted-skill-level', min: 12, max: 11 },
      { kind: 'granted-skill-level', min: 12, max: undefined },
      { kind: 'granted-skill-level', min: 12, source: 'ordinary' },
    ])
      expect(readStrategyConditions([condition])).toBeNull()
  })

  it('声明不符阻止动作，升级后停止且不改变角色观察', () => {
    const strategy: CraftStrategy = {
      maxSteps: 5,
      rules: [
        { conditions: [{ kind: 'granted-skill-level', min: 20 }], action: { kind: 'stop' } },
        { conditions: [{ kind: 'granted-skill-level', min: 1, max: 19 }], action },
      ],
    }
    expect(checkCraftStrategyAction(catalog, state, { ...action, previousMaxLevel: 12 }).ok).toBe(
      false,
    )
    expect(evaluateCraftStrategy(catalog, state, strategy, 0)).toMatchObject({
      ok: true,
      value: { kind: 'action', action },
    })
    const upgraded = applyCraftStep(catalog, state, action)
    if (!upgraded.ok) throw Error(upgraded.error)
    expect(upgraded.value.implicitLines).toEqual(state.implicitLines)
    expect(evaluateCraftStrategy(catalog, upgraded.value, strategy, 1)).toMatchObject({
      ok: true,
      value: { kind: 'stop', reason: 'rule', ruleIndex: 0 },
    })
    expect(checkCraftStrategyAction(catalog, upgraded.value, action).ok).toBe(false)
  })

  it('无最高尾注时正向与反向条件都不能将未知当成确定值', () => {
    const unknown = { ...state, implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'] }
    for (const condition of [
      { kind: 'granted-skill-level' as const, min: 20 },
      { kind: 'not' as const, condition: { kind: 'granted-skill-level' as const, min: 20 } },
    ]) {
      expect(
        evaluateCraftStrategy(
          catalog,
          unknown,
          {
            maxSteps: 5,
            rules: [{ conditions: [condition], action: { kind: 'stop' } }],
          },
          0,
        ),
      ).toEqual({ ok: true, value: { kind: 'unmatched' } })
    }
    expect(checkCraftStrategyAction(catalog, unknown, action)).toEqual({ ok: true, value: null })
  })

  it('阶段回放要求最高等级声明相同，不把其他溶剂身份当作已完成', () => {
    expect(operationMatchesStrategyAction(state, action, { ...action, previousMaxLevel: 14 })).toBe(
      false,
    )
    expect(operationMatchesStrategyAction(state, action, action)).toBe(true)
    const strategy: CraftStrategy = {
      maxSteps: 5,
      flow: {
        entryStageId: 'upgrade',
        stages: [
          { id: 'upgrade', name: '升级' },
          { id: 'done', name: '完成' },
        ],
      },
      rules: [
        { stageId: 'upgrade', nextStageId: 'done', conditions: [{ kind: 'always' }], action },
        {
          stageId: 'done',
          conditions: [{ kind: 'granted-skill-level', min: 20 }],
          action: { kind: 'stop' },
        },
      ],
    }
    const upgraded = applyCraftStep(catalog, state, action)
    if (!upgraded.ok) throw Error(upgraded.error)
    expect(strategyStageAt(catalog, [state, upgraded.value], [action], strategy, 0, 0)).toEqual({
      ok: true,
      value: 'upgrade',
    })
    expect(strategyStageAt(catalog, [state, upgraded.value], [action], strategy, 0, 1)).toEqual({
      ok: true,
      value: 'done',
    })
  })

  it('材料无需抗性关系目录，实际步骤逐颗计费且缺报价不伪造总价', () => {
    const material = { id: 'currency:perfect-flux', name: 'Perfect Flux' }
    expect(craftMaterials(catalog)).toContainEqual(material)
    const costs = collectCraftCosts(catalog, [action])
    expect(costs).toEqual({ ok: true, value: [{ ...material, count: 1 }] })
    expect(collectCraftCosts(catalog, [])).toEqual({ ok: true, value: [] })
    const pricing = { unit: 'divine' as const, prices: { [material.id]: 2.5 } }
    expect(parseCraftPricing(pricing, catalog)).toEqual({ ok: true, value: pricing })
    if (!costs.ok) throw Error(costs.error)
    expect(quoteCraftCosts(costs.value, pricing)).toMatchObject({ ok: true, value: { total: 2.5 } })
    expect(quoteCraftCosts(costs.value, { unit: 'divine', prices: {} })).toMatchObject({
      ok: true,
      value: { total: null, missing: [material.id] },
    })
  })
})
