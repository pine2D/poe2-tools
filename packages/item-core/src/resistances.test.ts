import { expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { parseCraftProject } from './craftProject'
import { evaluateCraftStrategy, readCraftStrategy } from './craftStrategy'
import { readCraftProperty } from './itemProperties'
import { catalog as makeCatalog, mod } from './partialTargetFixture'
import type { CraftState } from './rehearsal'
import { estimateResistances } from './resistances'

const ring: CraftState = {
  baseId: 'Prismatic Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  implicitLines: ['+10(7-10)% to all Elemental Resistances'],
  affixes: [{ modId: 'FireResist1', lines: ['+10(6-10)% to Fire Resistance'] }],
}
it('全元素逐项计入，元素合计不含混沌；不修改起点', () => {
  const result = estimateResistances(catalog, ring)
  expect(result.fireResistance).toEqual({ ok: true, value: 20 })
  expect(result.coldResistance).toEqual({ ok: true, value: 10 })
  expect(result.chaosResistance).toEqual({ ok: true, value: 0 })
  expect(result.elementalResistance).toEqual({ ok: true, value: 40 })
  expect(ring.affixes[0]?.lines[0]).toBe('+10(6-10)% to Fire Resistance')
})
it('未掷火抗只使火抗与合计未知，冰抗仍可判断', () => {
  const state = {
    ...ring,
    affixes: [{ modId: 'FireResist1', lines: ['+(6-10)% to Fire Resistance'] }],
  }
  const result = estimateResistances(catalog, state)
  expect(result.fireResistance.ok).toBe(false)
  expect(result.elementalResistance.ok).toBe(false)
  expect(result.coldResistance).toEqual({ ok: true, value: 10 })
})
it('品质按标签与来源缩放，缺少缩放资料不能假定原值', () => {
  const state = { ...ring, catalyst: { id: "Xoph's", quality: 20 } }
  expect(readCraftProperty(catalog, state, 'fireResistance')).toEqual({ ok: true, value: 24 })
  // 全元素固有带火焰标签，整行同时获得品质效果。
  expect(readCraftProperty(catalog, state, 'elementalResistance')).toEqual({ ok: true, value: 48 })
  expect(readCraftProperty({ ...catalog, scalability: {} }, state, 'fireResistance').ok).toBe(false)
  const missingTags = {
    ...catalog,
    bases: catalog.bases.map((base) =>
      base.id === ring.baseId ? { ...base, implicitTags: [] } : base,
    ),
  }
  expect(estimateResistances(missingTags, state).elementalResistance.ok).toBe(false)
  expect(estimateResistances(missingTags, state).chaosResistance).toEqual({ ok: true, value: 0 })
})
it('防具未知孔位不能推定零抗性，确认零孔才返回零', () => {
  const state: CraftState = { ...ring, baseId: 'Brimmed Helm', implicitLines: [], affixes: [] }
  expect(estimateResistances(catalog, state).fireResistance.ok).toBe(false)
  expect(estimateResistances(catalog, { ...state, sockets: [] }).fireResistance).toEqual({
    ok: true,
    value: 0,
  })
})
it('当前符文贡献逐枚相加，替换后不残留旧符文效果', () => {
  const rune = catalog.augments?.find(
    (entry) => entry.name === 'Desert Rune' && entry.category === 'armour',
  )
  if (!rune) throw new Error('缺少沙漠符文')
  const state: CraftState = {
    ...ring,
    baseId: 'Brimmed Helm',
    implicitLines: [],
    affixes: [],
    sockets: [rune.id, rune.id],
  }
  expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 28 })
  expect(
    estimateResistances(catalog, { ...state, sockets: [rune.id, null] }).fireResistance,
  ).toEqual({ ok: true, value: 14 })
})
it('上限、穿透、友军与条件抗性均不进入无条件合计；未知规则不能静默丢弃', () => {
  const lines = [
    '+3% to Maximum Fire Resistance',
    '+1% to all maximum Resistances',
    'Damage Penetrates 10% Fire Resistance',
    'Minions have +20% to all Elemental Resistances',
    '+50% to Chaos Resistance during any Flask Effect',
    '+1% to all Resistances for each Corrupted Item Equipped',
    '+10% to Fire and Chaos Resistances',
  ]
  const source = makeCatalog([mod('test', 'suffix', { lines })], { type: 'Ring' })
  const state: CraftState = {
    baseId: 'Focus',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes: [{ modId: 'test', lines }],
  }
  expect(estimateResistances(source, state).elementalResistance).toEqual({ ok: true, value: 10 })
  expect(estimateResistances(source, state).chaosResistance).toEqual({ ok: true, value: 10 })
  for (const extra of [
    '20% increased Explicit Resistance Modifier magnitudes',
    'Special Resistance Rule',
  ]) {
    const expanded = [...lines, extra]
    const next = { ...source, modifiers: [mod('test', 'suffix', { lines: expanded })] }
    expect(
      estimateResistances(next, { ...state, affixes: [{ modId: 'test', lines: expanded }] })
        .fireResistance.ok,
    ).toBe(false)
  }
})
it('不可缩放尾注保留抗性基础值；未知抗性条件取反仍不匹配', () => {
  const state = {
    ...ring,
    catalyst: { id: "Xoph's", quality: 20 },
    affixes: [
      { modId: 'FireResist1', lines: ['+10(6-10)% to Fire Resistance — Unscalable Value'] },
    ],
  }
  expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 22 })
  const strategy = readCraftStrategy({
    maxSteps: 10,
    rules: [
      {
        conditions: [
          {
            kind: 'not',
            condition: { kind: 'item-property', property: 'elementalResistance', min: 40 },
          },
        ],
        action: { kind: 'stop' },
      },
    ],
  })
  if (!strategy.ok) throw new Error(strategy.error)
  const { implicitLines: _, ...unknownImplicit } = ring
  expect(evaluateCraftStrategy(catalog, unknownImplicit, strategy.value, 0)).toMatchObject({
    ok: true,
    value: { kind: 'unmatched' },
  })
})
it('v49 保存抗性条件，v48 拒绝深层抗性条件但继续接受旧面板指标', () => {
  const p = {
    schemaVersion: 1,
    sourceCommit: catalog._meta.sourceCommit,
    rulesVersion: 'basic-2026-09-12-v49',
    initialState: { ...ring, implicitLines: undefined, rarity: 'normal', affixes: [] },
    operations: [],
    cursor: 0,
    strategy: {
      maxSteps: 10,
      rules: [
        {
          conditions: [
            {
              kind: 'any',
              conditions: [
                { kind: 'always' },
                { kind: 'item-property', property: 'elementalResistance', min: 40 },
              ],
            },
          ],
          action: { kind: 'stop' },
        },
      ],
    },
  }
  const parsed = parseCraftProject(JSON.stringify(p), catalog, dictionary)
  expect(parsed.ok, parsed.ok ? '' : parsed.error).toBe(true)
  expect(
    parseCraftProject(
      JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v48' }),
      catalog,
      dictionary,
    ).ok,
  ).toBe(false)
  expect(
    parseCraftProject(
      JSON.stringify({ ...p, rulesVersion: 'basic-2026-09-12-v48' }).replace(
        'elementalResistance',
        'Armour',
      ),
      catalog,
      dictionary,
    ).ok,
  ).toBe(true)
})
