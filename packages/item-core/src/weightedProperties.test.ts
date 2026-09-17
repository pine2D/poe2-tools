import { expect, it, vi } from 'vitest'
import { catalog } from './catalystTestFixture'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import type { CraftState } from './rehearsal'
import { readStrategyConditions } from './strategyConditions'
import { readWeightedProperties, readWeightedPropertiesCondition } from './weightedProperties'

const bow: CraftState = {
  baseId: 'Crude Bow',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  quality: 0,
  sockets: [],
}
const condition = (min = 6, max?: number) => ({
  kind: 'weighted-properties',
  terms: [
    { property: 'physicalDps', weight: 1 },
    { property: 'attackSpeed', weight: -2.5 },
  ],
  min,
  ...(max === undefined ? {} : { max }),
})
function decision(input: unknown, state = bow) {
  const parsed = readCraftStrategy({
    maxSteps: 10,
    rules: [{ conditions: [input], action: { kind: 'stop' } }],
  })
  if (!parsed.ok) throw new Error(parsed.error)
  return evaluateCraftStrategy(catalog, state, parsed.value, 0)
}
it('面板加权合计支持有符号系数和闭区间，不修改输入', () => {
  expect(readStrategyConditions([condition()])).toEqual([condition()])
  expect(decision(condition(6, 6))).toMatchObject({ ok: true, value: { kind: 'stop' } })
  expect(decision(condition(6.0001))).toMatchObject({ ok: true, value: { kind: 'unmatched' } })
  expect(
    decision({
      ...condition(-6, -6),
      terms: [
        { property: 'physicalDps', weight: -1 },
        { property: 'attackSpeed', weight: 2.5 },
      ],
    }),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('任一面板未知和取反均未知，混合树保留三值逻辑', () => {
  const unknown = {
    ...condition(),
    terms: [...condition().terms, { property: 'Armour', weight: 1 }],
  }
  expect(decision(unknown)).toMatchObject({ ok: true, value: { kind: 'unmatched' } })
  expect(decision({ kind: 'not', condition: unknown })).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  expect(decision({ kind: 'any', conditions: [unknown, { kind: 'always' }] })).toMatchObject({
    ok: true,
    value: { kind: 'stop' },
  })
  const { quality: _, ...missingQuality } = bow
  expect(decision({ kind: 'not', condition: condition() }, missingQuality)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})
it('拒绝非法范围、系数、重复或未知指标、空项和额外字段', () => {
  const term = { property: 'physicalDps', weight: 1 }
  for (const bad of [
    ...[0, -0, Infinity, NaN, 1_000_001, -1_000_001].map((weight) => ({
      ...condition(),
      terms: [{ ...term, weight }],
    })),
    ...[
      [],
      [term, term],
      [{ ...term, property: 'unknown' }],
      [{ ...term, extra: true }],
      [null],
      Array(5).fill(term),
      new Array(1),
    ].map((terms) => ({ ...condition(), terms })),
    condition(7, 6),
    condition(Infinity),
    condition(-Number.MAX_SAFE_INTEGER - 1),
    condition(0, Number.MAX_SAFE_INTEGER + 1),
    { ...condition(), max: undefined },
    { ...condition(), extra: true },
  ])
    expect(readStrategyConditions([bad])).toBeNull()
  expect(
    readStrategyConditions([condition(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)]),
  ).not.toBeNull()
})
it('不执行输入取值器，并构造独立的项副本', () => {
  const getter = vi.fn(() => 1)
  const term = {
    property: 'physicalDps',
    get weight() {
      return getter()
    },
  }
  expect(readStrategyConditions([{ ...condition(), terms: [term] }])).toBeNull()
  expect(readWeightedPropertiesCondition({ ...condition(), terms: [term] })).toBeNull()
  expect(getter).not.toHaveBeenCalled()
  const input = condition()
  const parsed = readStrategyConditions([input])
  expect(parsed).toEqual([input])
  const first = input.terms[0]
  if (!first) throw new Error('缺少加权项')
  first.weight = 4
  expect(parsed).toEqual([condition()])
})
it('共享计算保留小数精度，并拒绝中间乘积与合计越界', () => {
  const terms = [{ property: 'attackSpeed' as const, weight: 0.00001 }]
  expect(readWeightedProperties(catalog, bow, terms)).toEqual({ ok: true, value: 1.2 * 0.00001 })
  expect(decision({ ...condition(0.0000121), terms })).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
  const base = catalog.bases.find((base) => base.id === bow.baseId)
  if (!base) throw new Error('缺少弓基底')
  const source = {
    ...catalog,
    bases: [
      {
        ...base,
        properties: {
          ...base.properties,
          PhysicalMin: 5_000_000_000,
          PhysicalMax: 5_000_000_000,
          AttackRateBase: 1,
        },
      },
    ],
  }
  expect(
    readWeightedProperties(source, bow, [{ property: 'physicalDps', weight: 1_000_000 }]),
  ).toEqual({ ok: true, value: 5_000_000_000_000_000 })
  const overflow = readWeightedProperties(source, bow, [
    { property: 'physicalDps', weight: 1_000_000 },
    { property: 'totalDps', weight: 1_000_000 },
    { property: 'attackSpeed', weight: -1_000_000 },
  ])
  expect(overflow).toMatchObject({ ok: false, error: expect.stringContaining('安全数值') })
  const doubled = {
    ...source,
    bases: [
      {
        ...base,
        properties: {
          ...base.properties,
          AttackRateBase: 1,
          PhysicalMin: 10_000_000_000,
          PhysicalMax: 10_000_000_000,
        },
      },
    ],
  }
  expect(
    readWeightedProperties(doubled, bow, [
      { property: 'physicalDps', weight: 1_000_000 },
      { property: 'totalDps', weight: -1_000_000 },
    ]),
  ).toMatchObject({ ok: false, error: expect.stringContaining('安全数值') })
})
it('停止、制作动作与阶段跳转共用加权条件', () => {
  for (const action of [{ kind: 'stop' }, { kind: 'currency', currency: 'transmutation' }]) {
    const parsed = readCraftStrategy({
      maxSteps: 10,
      flow: {
        stages: [
          { id: 'a', name: '判断' },
          { id: 'b', name: '执行' },
        ],
        entryStageId: 'a',
      },
      rules: [
        { stageId: 'a', nextStageId: 'b', conditions: [condition()], action: { kind: 'jump' } },
        {
          stageId: 'b',
          conditions: [
            { kind: 'all', conditions: [condition(), { kind: 'rarity', value: 'normal' }] },
          ],
          action,
        },
      ],
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(evaluateCraftStrategy(catalog, bow, parsed.value, 0)).toMatchObject({
      ok: true,
      value: {
        kind: action.kind === 'stop' ? 'stop' : 'action',
        ruleIndex: 1,
        route: [{ ruleIndex: 0, from: 'a', to: 'b' }],
      },
    })
  }
})
