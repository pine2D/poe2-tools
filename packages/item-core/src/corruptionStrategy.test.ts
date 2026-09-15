import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { collectCraftCosts } from './craftCosts'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { type CraftStrategy, evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import {
  definitionStrategyStageAt,
  evaluateDefinitionCraftStrategy,
  readDefinitionCraftStrategy,
} from './definitionStrategy'
import { type CraftState, createCraftState } from './rehearsal'
import { checkCraftStrategyAction, readCraftStrategyAction } from './strategyActions'
import { readStrategyConditions } from './strategyConditions'
import { operationMatchesStrategyAction, strategyStageAt } from './strategyStages'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const ring: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'magic',
  sourceText: null,
  nextAffixId: 3,
  affixes: [
    { affixId: 'a1', modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
    { affixId: 'a2', modId: 'FireResist1', lines: ['+10(6-10)% to Fire Resistance'] },
  ],
}
const vaal = { kind: 'vaal' as const }
const architect = { kind: 'architect' as const }
const unchanged = { kind: 'vaal' as const, outcome: 'unchanged' as const }
const success = {
  kind: 'architect' as const,
  outcome: 'enchant' as const,
  modId: 'CorruptionAllResistances1',
  values: [10],
}
const must = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) throw Error(result.error)
  return result.value
}
const once = must(applyCraftStep(catalog, ring, unchanged))
const twice = must(applyCraftStep(catalog, once, success))
const goals = { definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] } }

describe('腐化收尾条件指引', () => {
  it('动作仅保存材料，条件严格保存三种互斥状态且不读取非法对象访问器', () => {
    for (const action of [vaal, architect]) {
      expect(readCraftStrategyAction(action)).toEqual(action)
      for (const extra of [
        { outcome: 'unchanged' },
        { modId: 'x' },
        { values: [] },
        { omen: undefined },
      ])
        expect(readCraftStrategyAction({ ...action, ...extra })).toBeNull()
    }
    for (const value of ['none', 'once', 'twice'])
      expect(readStrategyConditions([{ kind: 'corruption-state', value }])).toEqual([
        { kind: 'corruption-state', value },
      ])
    for (const value of [null, undefined, true, 'corrupted', ''])
      expect(readStrategyConditions([{ kind: 'corruption-state', value }])).toBeNull()
    let reads = 0
    for (const valid of [vaal, { kind: 'corruption-state', value: 'none' }]) {
      for (const invalid of [
        Object.create(valid),
        Object.defineProperty({ ...valid }, 'hidden', { value: undefined }),
        Object.defineProperty({ ...valid }, 'kind', {
          enumerable: true,
          get: () => {
            reads++
            return valid.kind
          },
        }),
        { ...valid, extra: 1 },
      ]) {
        if (valid.kind === 'vaal') expect(readCraftStrategyAction(invalid)).toBeNull()
        else {
          expect(readStrategyConditions([invalid])).toBeNull()
          const config = {
            maxSteps: 5,
            rules: [{ conditions: [{ kind: 'not', condition: invalid }], action: vaal }],
          }
          expect(readCraftStrategy(config).ok).toBe(false)
          expect(readDefinitionCraftStrategy(config).ok).toBe(false)
        }
      }
    }
    expect(reads).toBe(0)
  })

  it('仅一次腐化排除二重，嵌套条件与非法状态不会把未知伪装成未腐化', () => {
    for (const [index, state] of [ring, once, twice].entries()) {
      for (const [expected, value] of ['none', 'once', 'twice'].entries()) {
        const config = must(
          readCraftStrategy({
            maxSteps: 5,
            rules: [
              {
                conditions: [
                  {
                    kind: 'all',
                    conditions: [
                      { kind: 'corruption-state', value },
                      {
                        kind: 'not',
                        condition: {
                          kind: 'any',
                          conditions: [
                            { kind: 'rarity', value: 'normal' },
                            { kind: 'rarity', value: 'rare' },
                          ],
                        },
                      },
                    ],
                  },
                ],
                action: { kind: 'stop' },
              },
            ],
          }),
        )
        expect(must(evaluateCraftStrategy(catalog, state, config, 0)).kind).toBe(
          index === expected ? 'stop' : 'unmatched',
        )
      }
    }
    const config = must(
      readCraftStrategy({
        maxSteps: 5,
        rules: [
          {
            conditions: [{ kind: 'corruption-state', value: 'none' }],
            action: { kind: 'stop' },
          },
        ],
      }),
    )
    for (const patch of [
      { corrupted: false },
      { corrupted: undefined },
      { twiceCorrupted: true },
      { destroyed: true },
    ])
      expect(
        evaluateCraftStrategy(catalog, { ...ring, ...patch } as CraftState, config, 0).ok,
      ).toBe(false)
  })

  it('资格与原引擎一致，预检不选择结果、不改输入或拒绝合法未知孔', () => {
    const saved = structuredClone(ring)
    expect(checkCraftStrategyAction(catalog, ring, vaal)).toEqual({ ok: true, value: null })
    expect(checkCraftStrategyAction(catalog, once, architect)).toEqual({ ok: true, value: null })
    const { corruptions: _, ...withoutEnhancements } = catalog
    expect(checkCraftStrategyAction(withoutEnhancements, ring, vaal).ok).toBe(true)
    expect(checkCraftStrategyAction(withoutEnhancements, once, architect).ok).toBe(true)
    expect(checkCraftStrategyAction(catalog, ring, architect).ok).toBe(false)
    expect(checkCraftStrategyAction(catalog, once, vaal).ok).toBe(false)
    const pending = must(
      createCraftState(catalog, {
        ...ring,
        rarity: 'rare',
        pendingDesecration: { boneId: 'preserved_collarbone', kind: 'prefix' },
      }),
    )
    for (const state of [
      twice,
      pending,
      { ...once, destroyed: true as const },
      { ...ring, baseId: 'missing' },
      { ...ring, baseId: 'Corona Amulet', affixes: [] },
    ])
      for (const action of [vaal, architect])
        expect(checkCraftStrategyAction(catalog, state, action).ok).toBe(false)
    expect(ring).toEqual(saved)
    expect(ring).not.toHaveProperty('corrupted')
    expect(once).not.toHaveProperty('destroyed')
  })

  it('每个真实结果均可完成对应材料阶段，其他材料不能冒充，也不重复计费', () => {
    const replacement = {
      removeModId: 'IncreasedLife1',
      removeAffixId: 'a1',
      modId: 'IncreasedLife2',
      values: [25],
    }
    const replacements = [
      replacement,
      { removeModId: 'IncreasedLife2', removeAffixId: 'a3', modId: 'IncreasedLife3', values: [35] },
      { removeModId: 'IncreasedLife3', removeAffixId: 'a4', modId: 'IncreasedLife1', values: [10] },
    ]
    const cases: { state: CraftState; operation: CraftStep }[] = [
      { state: ring, operation: unchanged },
      {
        state: { ...ring, baseId: 'Crude Bow', affixes: [], sockets: [] },
        operation: { kind: 'vaal', outcome: 'socket' },
      },
      {
        state: ring,
        operation: {
          kind: 'vaal',
          outcome: 'enchant',
          modId: 'CorruptionChaosResistance1',
          values: [15],
        },
      },
      ...[1, 2, 3].map((count) => ({
        state: ring,
        operation: {
          kind: 'vaal' as const,
          outcome: 'reroll' as const,
          replacements: replacements.slice(0, count),
        },
      })),
      { state: once, operation: success },
      { state: once, operation: { kind: 'architect', outcome: 'destroy' } },
    ]
    for (const { state, operation } of cases) {
      if (!('kind' in operation) || (operation.kind !== 'vaal' && operation.kind !== 'architect'))
        throw Error('fixture')
      const action = { kind: operation.kind }
      const config = must(
        readCraftStrategy({
          maxSteps: 5,
          flow: {
            entryStageId: 'work',
            stages: [
              { id: 'work', name: '处理' },
              { id: 'done', name: '完成' },
            ],
          },
          rules: [
            { stageId: 'work', nextStageId: 'done', conditions: [{ kind: 'always' }], action },
            { stageId: 'done', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          ],
        }),
      )
      const after = must(applyCraftStep(catalog, state, operation))
      expect(operationMatchesStrategyAction(state, action, operation)).toBe(true)
      for (const other of [
        { kind: 'extraction' },
        { kind: 'artificer' },
        { kind: 'socket', augmentId: 'unused', socketIndex: 0 },
        operation.kind === 'vaal' ? { kind: 'architect', outcome: 'destroy' } : unchanged,
      ])
        expect(operationMatchesStrategyAction(state, action, other as CraftStep)).toBe(false)
      expect(strategyStageAt(catalog, [state, after], [operation], config, 0, 1)).toEqual({
        ok: true,
        value: 'done',
      })
      expect(
        definitionStrategyStageAt(
          catalog,
          [state, after],
          [operation],
          must(readDefinitionCraftStrategy(config)),
          0,
          1,
          goals,
        ),
      ).toEqual({ ok: true, value: 'done' })
      expect(must(collectCraftCosts(catalog, [operation]))).toEqual([
        {
          id: `currency:${operation.kind}`,
          name: operation.kind === 'vaal' ? 'Vaal Orb' : "Architect's Orb",
          count: 1,
        },
      ])
    }
  })

  it('不可用建筑师转向瓦尔准备，实际操作后推进而空转循环被阻止', () => {
    const config: CraftStrategy = {
      maxSteps: 5,
      flow: {
        entryStageId: 'finish',
        stages: [
          { id: 'finish', name: '二重腐化' },
          { id: 'prepare', name: '初次腐化' },
          { id: 'done', name: '完成' },
        ],
      },
      rules: [
        {
          stageId: 'finish',
          nextStageId: 'done',
          onBlockedStageId: 'prepare',
          conditions: [{ kind: 'always' }],
          action: architect,
        },
        {
          stageId: 'prepare',
          nextStageId: 'finish',
          conditions: [{ kind: 'always' }],
          action: vaal,
        },
        {
          stageId: 'done',
          conditions: [{ kind: 'corruption-state', value: 'twice' }],
          action: { kind: 'stop' },
        },
      ],
    }
    expect(evaluateCraftStrategy(catalog, ring, config, 0)).toMatchObject({
      ok: true,
      value: { kind: 'action', action: vaal, route: [{ from: 'finish', to: 'prepare' }] },
    })
    expect(
      strategyStageAt(catalog, [ring, once, twice], [unchanged, success], config, 0, 1),
    ).toEqual({ ok: true, value: 'finish' })
    expect(
      strategyStageAt(catalog, [ring, once, twice], [unchanged, success], config, 0, 2),
    ).toEqual({ ok: true, value: 'done' })
    expect(evaluateCraftStrategy(catalog, twice, config, 2, {}, 'done')).toMatchObject({
      ok: true,
      value: { kind: 'stop', reason: 'rule' },
    })
    expect(evaluateCraftStrategy(catalog, ring, config, 5)).toMatchObject({
      ok: true,
      value: { kind: 'stop', reason: 'step-limit' },
    })
    const cycle = structuredClone(config)
    cycle.rules[1] = {
      stageId: 'prepare',
      onBlockedStageId: 'finish',
      conditions: [{ kind: 'always' }],
      action: architect,
    }
    expect(evaluateCraftStrategy(catalog, ring, cycle, 0)).toMatchObject({
      ok: true,
      value: { kind: 'blocked', message: expect.stringContaining('循环') },
    })
  })

  it('新条件与动作不能让未执行阶段的孤儿目标或反向引用逃过检查', () => {
    const config = must(
      readDefinitionCraftStrategy({
        maxSteps: 5,
        flow: {
          entryStageId: 'work',
          stages: [
            { id: 'work', name: '腐化' },
            { id: 'later', name: '后续' },
          ],
        },
        rules: [
          {
            stageId: 'work',
            conditions: [{ kind: 'corruption-state', value: 'none' }],
            action: vaal,
          },
          {
            stageId: 'later',
            conditions: [
              {
                kind: 'not',
                condition: { kind: 'selected-targets', targetIds: ['t1'], min: 1, value: true },
              },
            ],
            action: architect,
          },
        ],
      }),
    )
    expect(evaluateDefinitionCraftStrategy(catalog, ring, config, 0, goals)).toMatchObject({
      ok: true,
      value: { kind: 'blocked', message: expect.stringContaining('t1') },
    })
  })
})
