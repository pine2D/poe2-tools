import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CatalogMod, CraftCatalog } from './catalog'
import { catalystChoices, estimateCatalystEffects } from './catalystEffects'
import type { CraftState } from './rehearsal'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
)
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  implicitLines: ['10% increased Rarity of Items found'],
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
    { modId: 'FireResist1', lines: ['+9% to Fire Resistance'] },
  ],
}
function estimate(input = state, id = 'Flesh', quality = 20, data = catalog) {
  const result = estimateCatalystEffects(data, input, id, quality)
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function custom(patterns: string[], actual: string[], tags = ['life']) {
  const source = catalog.modifiers.find((x) => x.id === 'IncreasedLife1') as CatalogMod
  const mod = { ...source, lines: patterns, tags }
  return {
    data: { ...catalog, modifiers: catalog.modifiers.map((x) => (x.id === mod.id ? mod : x)) },
    input: { ...state, affixes: [{ modId: mod.id, lines: actual }] },
  }
}

describe('催化剂效果估算，不应用品质或消耗', () => {
  it('按标签命中一组，保留未命中固有与显式属性，不修改来源', () => {
    const snapshot = JSON.stringify({ state, catalog })
    const result = estimate()
    expect(result).toMatchObject({ quality: 20, maxQuality: 20, catalystName: 'Flesh Catalyst' })
    expect(result.groups).toMatchObject([
      { matched: false, lines: [{ status: 'unaffected', before: state.implicitLines?.[0] }] },
      {
        id: 'IncreasedLife1',
        matched: true,
        lines: [{ status: 'estimated', after: '+22 to maximum Life' }],
      },
      { id: 'FireResist1', matched: false, lines: [{ status: 'unaffected' }] },
    ])
    expect(estimate(state, "Xoph's").groups[2]?.lines[0]?.after).toBe('+10% to Fire Resistance')
    expect(JSON.stringify({ state, catalog })).toBe(snapshot)
  })

  it('13 类具有独立官方名称，珠宝选择精炼材料并按同一标签命中', () => {
    const choices = catalystChoices(catalog, state)
    expect(choices.ok && choices.value.choices).toHaveLength(13)
    if (!choices.ok) return
    for (const locale of ['zh-CN', 'zh-TW'] as const) {
      for (const choice of choices.value.choices) {
        expect(catalog.localizedNames?.[locale][choice.name]).toBeTruthy()
        expect(catalog.localizedNames?.[locale][`Refined ${choice.name}`]).toBeTruthy()
      }
    }
    const jewel: CraftState = {
      baseId: 'Ruby',
      itemLevel: 86,
      rarity: 'rare',
      sourceText: null,
      affixes: [{ modId: 'JewelMinionLife', lines: ['Minions have 14% increased maximum Life'] }],
    }
    expect(estimate(jewel, 'Necrotic')).toMatchObject({
      catalystName: 'Refined Necrotic Catalyst',
      groups: [{ matched: true, lines: [{ after: 'Minions have 16% increased maximum Life' }] }],
    })
    expect(estimate(jewel, 'Flesh').groups[0]?.lines[0]?.after).toBe(
      'Minions have 16% increased maximum Life',
    )
  })

  it('标签匹配不累乘，含关键字但无标签不命中', () => {
    const { input, data } = custom(
      ['+(10-19) to maximum Life'],
      ['+19 to maximum Life'],
      ['defences', 'armour', 'energyshield'],
    )
    expect(estimate(input, 'Carapace', 20, data).groups[1]?.lines[0]?.after).toBe(
      '+22 to maximum Life',
    )
    expect(estimate(input, 'Flesh', 20, data).groups[1]?.matched).toBe(false)
  })

  it('按目录显示精度对绝对值截断，多范围与负值不受浮点偏差影响', () => {
    const { input, data } = custom(
      ['Adds (1.0-2.0) to (3.0-4.0) Damage', '-(10-19) to test value'],
      ['-19 to test value', 'Adds 1.4 to 3.9 Damage'],
    )
    expect(estimate(input, 'Flesh', 20, data).groups[1]?.lines).toMatchObject([
      { after: '-22 to test value' },
      { after: 'Adds 1.6 to 4.6 Damage' },
    ])
  })

  it('固有标签跟随目录对应关系，能估算真实当前值，缺值不猜最小值', () => {
    const amulet = { ...state, baseId: 'Jade Amulet', implicitLines: ['+14(10-15) to Dexterity'] }
    expect(estimate(amulet, 'Adaptive').groups[0]).toMatchObject({
      kind: 'implicit',
      matched: true,
      lines: [{ after: '+16 to Dexterity' }],
    })
    const missing: CraftState = { ...amulet }
    delete missing.implicitLines
    expect(estimate(missing, 'Adaptive').groups[0]?.lines[0]).toMatchObject({
      status: 'unknown',
      after: null,
    })
  })

  it('不可缩放尾注保留；固定数字、未掷与精度不明逐行说明', () => {
    const { input, data } = custom(
      [
        '+(10-19) to maximum Life',
        '(10-20)% effect for 4 seconds',
        'Gain 1 charge',
        '(1-3)% speed',
      ],
      [
        '+19 to maximum Life — Unscalable Value',
        '15% effect for 4 seconds',
        'Gain 1 charge',
        '1.5% speed',
      ],
    )
    expect(estimate(input, 'Flesh', 20, data).groups[1]?.lines).toMatchObject([
      { status: 'unscalable', after: null },
      { status: 'unknown', after: null },
      { status: 'unknown', after: null },
      { status: 'unknown', after: null },
    ])
    const unrolled = {
      ...state,
      affixes: [{ modId: 'IncreasedLife1', lines: ['+(10-19) to maximum Life'] }],
    }
    expect(estimate(unrolled).groups[1]?.lines[0]?.status).toBe('unknown')
  })

  it('只为已核对的裂隙戒指提供 40% 上限', () => {
    const breach = { ...state, baseId: 'Breach Ring', implicitLines: ['+20% to Maximum Quality'] }
    expect(estimate(breach, 'Flesh', 40)).toMatchObject({ maxQuality: 40 })
    expect(estimate(breach, 'Flesh', 40).groups[1]?.lines[0]?.after).toBe('+26 to maximum Life')
    expect(estimateCatalystEffects(catalog, breach, 'Flesh', 41).ok).toBe(false)
    const changed = {
      ...catalog,
      bases: catalog.bases.map((b) =>
        b.id === 'Breach Ring' ? { ...b, implicit: '+30% to Maximum Quality' } : b,
      ),
    }
    expect(
      catalystChoices(changed, { ...breach, implicitLines: ['+30% to Maximum Quality'] }).ok,
    ).toBe(false)
  })

  it.each([-1, 20.1, 21, Number.NaN, Number.POSITIVE_INFINITY])('拒绝无效品质 %s', (quality) => {
    expect(estimateCatalystEffects(catalog, state, 'Flesh', quality).ok).toBe(false)
  })

  it('拒绝未知催化剂、不可制作物品及已有未知品质，零品质只作无变化比较', () => {
    expect(estimateCatalystEffects(catalog, state, 'Unknown', 20).ok).toBe(false)
    for (const input of [
      { ...state, baseId: 'Adherent Cuffs', implicitLines: [] },
      { ...state, rarity: 'unique' },
      { ...state, quality: 20 },
      { ...state, sourceText: 'Quality (Life Modifiers): +20%' },
    ])
      expect(catalystChoices(catalog, input as CraftState).ok).toBe(false)
    expect(estimate(state, 'Flesh', 0).groups[1]?.lines[0]?.after).toBe('+19 to maximum Life')
  })
})
