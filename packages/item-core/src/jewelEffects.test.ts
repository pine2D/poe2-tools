import { describe, expect, it } from 'vitest'
import { estimateCatalystEffects } from './catalystEffects'
import { catalog as realCatalog } from './catalystTestFixture'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { projectCraftTargetValues } from './effectiveTargetValues'
import { JEWEL_EFFECT_EMOTION_ID, jewelEffectModKind } from './jewelEffectRules'
import { estimateCraftAffixEffects, jewelEffectForKind, usesJewelEffect } from './jewelEffects'
import { jewelFixture } from './jewelTestFixture'
import { inspectLiquidEmotions, LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { createCraftState } from './rehearsal'
import { estimateResistances } from './resistances'
import {
  STAT_SCALABILITY_SOURCE,
  scaleStatLine,
  scaleStatLineByEffect,
  scaleStatValueBoundsByEffect,
} from './statScalability'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试记录')
  return value
}

function fixture(kind: 'prefix' | 'suffix' = 'prefix', value = 50) {
  const { catalog, state, base } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE, STAT_SCALABILITY_SOURCE)
  catalog.liquidEmotions = structuredClone(realCatalog.liquidEmotions ?? [])
  const crafts = realCatalog.modifiers.filter((m) =>
    /^CraftedJewel(?:Prefix|Suffix)Effect$/.test(m.id),
  )
  catalog.modifiers.push(...structuredClone(crafts))
  const mod = required(
    catalog.modifiers.find((m) => m.id === (kind === 'prefix' ? 'suffix1' : 'prefix1')),
  )
  mod.lines = ['+(10-20)% to Fire Resistance', 'Damage lasts (3-5) seconds within 2 metres']
  mod.tags = ['fire']
  const effect = required(crafts.find((m) => m.kind === kind))
  catalog.scalability = {
    [required(mod.lines[0])]: [{ scalable: true, formats: [] }],
    [required(mod.lines[1])]: [
      { scalable: true, formats: [] },
      { scalable: false, formats: [] },
    ],
    [required(effect.lines[0])]: [{ scalable: false, formats: [] }],
  }
  state.affixes = [
    {
      modId: effect.id,
      crafted: true,
      lines: [
        `${value}(40-60)% increased Effect of ${kind === 'prefix' ? 'Suffixes' : 'Prefixes'}`,
      ],
    },
    {
      modId: mod.id,
      lines: ['+11(10-20)% to Fire Resistance', 'Damage lasts 3(3-5) seconds within 2 metres'],
    },
  ]
  return { catalog, state, base, mod, effect }
}

describe('珠宝侧别增效', () => {
  it('神圣改变工艺基础值后破裂词缀基础值不变，移除工艺恢复效果', () => {
    const { catalog, state, mod, effect } = fixture()
    required(state.affixes[1]).fractured = true
    state.catalyst = { id: "Xoph's", quality: 20 }
    const next = applyCraftStep(catalog, state, {
      currency: 'divine',
      modIds: [],
      rolls: [{ modId: effect.id, values: [60] }],
    })
    if (!next.ok) throw Error(next.error)
    expect(next.value.affixes[1]).toEqual(state.affixes[1])
    expect(estimateResistances(catalog, next.value).fireResistance).toEqual({ ok: true, value: 19 })
    const strategy = {
      maxSteps: 10,
      rules: [
        {
          conditions: [
            { kind: 'item-property' as const, property: 'fireResistance' as const, min: 19 },
          ],
          action: { kind: 'stop' as const },
        },
      ],
    }
    expect(evaluateCraftStrategy(catalog, state, strategy, 0)).toMatchObject({
      ok: true,
      value: { kind: 'unmatched' },
    })
    expect(evaluateCraftStrategy(catalog, next.value, strategy, 0)).toMatchObject({
      ok: true,
      value: { kind: 'stop' },
    })
    expect(estimateCraftAffixEffects(catalog, next.value)).toMatchObject({
      ok: true,
      value: { groups: [{}, { percent: 80, lines: [{ after: '+19% to Fire Resistance' }, {}] }] },
    })
    const removed = applyCraftStep(catalog, next.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: effect.id,
    })
    if (!removed.ok) throw Error(removed.error)
    expect(removed.value.affixes).toEqual([state.affixes[1]])
    expect(estimateResistances(catalog, removed.value).fireResistance).toEqual({
      ok: true,
      value: 13,
    })
    expect(
      applyCraftStep(catalog, state, {
        currency: 'divine',
        modIds: [],
        rolls: [
          { modId: effect.id, values: [60] },
          { modId: mod.id, values: [20, 5] },
        ],
      }).ok,
    ).toBe(false)
  })
  it('未命中催化标签仍显示侧别效果，不可缩放行保留且未知范围不猜', () => {
    const { catalog, state } = fixture()
    required(state.affixes[1]).lines[1] += ' (unscalable)'
    expect(estimateCatalystEffects(catalog, state, 'Flesh', 20)).toMatchObject({
      ok: true,
      value: {
        groups: [
          {},
          {
            matched: false,
            lines: [
              { after: '+16% to Fire Resistance', status: 'estimated' },
              { status: 'unscalable' },
            ],
          },
        ],
      },
    })
    required(state.affixes[1]).lines[0] = '+(10-20)% to Fire Resistance'
    expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
      ok: true,
      value: {
        groups: [
          {},
          {
            lines: [
              { after: null, reason: expect.stringMatching(/未知/) },
              { after: required(state.affixes[1]).lines[1] },
            ],
          },
        ],
      },
    })
  })
  it('固定可缩放与不可缩放数字沿元数据，未知精度结果不猜', () => {
    expect(
      scaleStatLineByEffect(
        'Damage 5 within 2 metres',
        'Damage 5 within 2 metres',
        [
          { scalable: true, formats: [] },
          { scalable: false, formats: [] },
        ],
        60,
      ),
    ).toEqual({ ok: true, value: 'Damage 8 within 2 metres' })
    const { catalog, state, mod } = fixture()
    required(catalog.scalability)[required(mod.lines[1])] = [
      { scalable: true, formats: ['unknown'] },
      { scalable: false, formats: [] },
    ]
    expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
      ok: true,
      value: {
        groups: [{}, { lines: [{}, { after: null, reason: expect.stringMatching(/格式/) }] }],
      },
    })
  })
  it('篡改任一侧工艺映射、身份及类似增效规则均不能开放', () => {
    for (const edit of ['kind', 'group', 'line', 'mapping', 'emotion'] as const) {
      const { catalog, state, effect } = fixture()
      const local = required(catalog.modifiers.find((m) => m.id === effect.id))
      if (edit === 'kind') local.kind = 'suffix'
      if (edit === 'group') local.group = 'forged'
      if (edit === 'line') local.lines = ['(40-60)% increased Effect of Prefixes']
      const emotion = required(
        catalog.liquidEmotions?.find((e) => e.id === JEWEL_EFFECT_EMOTION_ID),
      )
      if (edit === 'mapping') delete emotion.mods.Sapphire.suffix
      if (edit === 'emotion') emotion.id = 'Metadata/Items/Currency/DistilledEmotion1'
      expect(createCraftState(catalog, state).ok).toBe(false)
      expect(jewelEffectForKind(catalog, state, 'suffix').ok).toBe(false)
    }
    const { catalog, state, mod } = fixture()
    state.affixes = state.affixes.slice(1)
    mod.lines = ['50% increased Effect of Suffixes']
    required(state.affixes[0]).lines = [...mod.lines]
    expect(createCraftState(catalog, state).ok).toBe(false)
  })
  it.each(['prefix', 'suffix'] as const)('%s 只作用反侧且基础值不改', (kind) => {
    const { catalog, state, mod, effect } = fixture(kind)
    const snapshot = structuredClone(state)
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(jewelEffectModKind(effect)).toBe(kind)
    expect(jewelEffectForKind(catalog, state, kind)).toEqual({ ok: true, value: 0 })
    expect(jewelEffectForKind(catalog, state, mod.kind)).toEqual({ ok: true, value: 50 })
    expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
      ok: true,
      value: {
        groups: [
          { percent: 0 },
          {
            percent: 50,
            lines: [
              { after: '+16% to Fire Resistance' },
              { after: 'Damage lasts 4 seconds within 2 metres' },
            ],
          },
        ],
      },
    })
    expect(state).toEqual(snapshot)
  })
  it('50 与催化 20 相加一次截断，预览与抗性及有效目标相同', () => {
    const { catalog, state, mod } = fixture()
    state.catalyst = { id: "Xoph's", quality: 20 }
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
      ok: true,
      value: { groups: [{}, { percent: 70, lines: [{ after: '+18% to Fire Resistance' }, {}] }] },
    })
    expect(estimateCatalystEffects(catalog, state, "Xoph's", 20)).toMatchObject({
      ok: true,
      value: { groups: [{}, { lines: [{ after: '+18% to Fire Resistance' }, {}] }] },
    })
    expect(estimateResistances(catalog, state).fireResistance).toEqual({ ok: true, value: 18 })
    const effective = projectCraftTargetValues(catalog, state, mod, {
      modId: mod.id,
      basis: 'effective',
      bounds: [{ index: 0, min: 18 }],
    })
    if (!effective.ok) throw Error(effective.error)
    expect(effective.value.ranges[0]).toMatchObject({ min: 17, max: 34 })
    expect(effective.value.baseBounds([{ index: 0, min: 18 }])).toMatchObject({
      ok: true,
      value: [{ min: 11 }],
    })
    expect(projectCraftTargetValues(catalog, state, mod)).toMatchObject({
      ok: true,
      value: { ranges: [{ min: 10, max: 20 }, {}] },
    })
  })
  it('未知增效允许目录身份但不能猜掷值，缺来源拒绝', () => {
    const { catalog, state, effect } = fixture()
    required(state.affixes[0]).lines = [...effect.lines]
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(jewelEffectForKind(catalog, state, 'suffix')).toMatchObject({ ok: false })
    expect(estimateCraftAffixEffects(catalog, state)).toMatchObject({
      ok: true,
      value: {
        groups: [
          {},
          { percent: null, lines: [{ after: null, reason: expect.stringMatching(/未知/) }, {}] },
        ],
      },
    })
    catalog._meta.sources = catalog._meta.sources.filter(
      (s) => s.path !== STAT_SCALABILITY_SOURCE.path,
    )
    expect(usesJewelEffect(catalog, state)).toBe(true)
    expect(createCraftState(catalog, state).ok).toBe(false)
  })
  it.each(['Ruby', 'Sapphire', 'Emerald', 'Diamond'])('%s 精确双侧映射', (id) => {
    const entry = inspectLiquidEmotions(
      realCatalog,
      required(realCatalog.bases.find((b) => b.id === id)),
    ).find((e) => e.emotion.id === JEWEL_EFFECT_EMOTION_ID)
    expect(entry).toMatchObject({
      reason: null,
      outcomes: [{ kind: 'prefix' }, { kind: 'suffix' }],
    })
  })
  it('保留品质参数上限，共享算子支持 80 总效果与未知精度', () => {
    const meta = [{ scalable: true, formats: [] }]
    expect(scaleStatLine('(1-20)', '11', meta, 80).ok).toBe(false)
    expect(scaleStatLineByEffect('(1-20)', '11', meta, 80)).toEqual({ ok: true, value: '19' })
    expect(scaleStatValueBoundsByEffect(-11, [], 70)).toEqual({
      ok: true,
      value: { min: -18, max: -18 },
    })
    expect(scaleStatValueBoundsByEffect(1, ['unknown'], 70).ok).toBe(false)
    expect(scaleStatValueBoundsByEffect(1, [], 106).ok).toBe(false)
    expect(scaleStatValueBoundsByEffect(1.4, ['per_minute_to_per_second'], 70)).toEqual({
      ok: true,
      value: { min: 2.3, max: 2.4 },
    })
    expect(
      scaleStatLineByEffect(
        '(1-2) per second',
        '1.4 per second',
        [{ scalable: true, formats: ['per_minute_to_per_second'] }],
        70,
      ).ok,
    ).toBe(false)
    expect(scaleStatValueBoundsByEffect(0.65, ['divide_by_one_hundred'], 70)).toEqual({
      ok: true,
      value: { min: 1.1, max: 1.1 },
    })
  })
})
