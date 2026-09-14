import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalog, dictionary, parse } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { type ItemDictionary, inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { STAT_SCALABILITY_SOURCE } from './statScalability'

const state: CraftState = {
  baseId: 'Sapphire',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    {
      modId: 'CraftedJewelSuffixEffect',
      lines: ['50(40-60)% increased Effect of Suffixes'],
      crafted: true,
    },
    {
      modId: 'JewelSpellCriticalChance',
      lines: ['15(5-15)% increased Critical Hit Chance for Spells'],
    },
  ],
}
function exported(value = state, dict = dictionary, locale: 'en' | 'zh-CN' | 'zh-TW' = 'en') {
  const result = exportCraftItemText(catalog, value, { locale, dictionary: dict })
  if (!result.ok) throw Error(result.error)
  return result.value.text
}
function imported(text: string, dict: ItemDictionary = dictionary) {
  const item = parse(text)
  return importCraftState(
    catalog,
    state.baseId,
    item,
    inspectItem(item, dict),
    undefined,
    undefined,
    dict.stats?.entries,
  )
}

describe('珠宝增效高级基础文本', () => {
  it('固定 current(base) 仅凭准确总效果规范化，并保留原始文本', () => {
    const fixture = structuredClone(catalog)
    const fixed = fixture.modifiers.find((mod) => mod.id === 'JewelMaximumColdResistance')
    if (!fixed) throw Error('fixture')
    fixed.lines = ['+3% to Maximum Cold Resistance']
    fixture.scalability = {
      ...fixture.scalability,
      '+3% to Maximum Cold Resistance': [{ scalable: true, formats: [] }],
    }
    const text =
      'Item Class: Jewels\nRarity: Rare\nTest\nSapphire\n--------\nItem Level: 86\n--------\n{ Prefix Modifier }\n50(40-60)% increased Effect of Suffixes (crafted)\n--------\n{ Suffix Modifier "of the Kraken" — cold — 50% Increased }\n+4(3)% to Maximum Cold Resistance'
    const item = parse(text)
    const result = importCraftState(
      fixture,
      'Sapphire',
      item,
      inspectItem(item, dictionary),
      undefined,
      undefined,
      dictionary.stats?.entries,
    )
    expect(result).toMatchObject({
      ok: true,
      value: {
        sourceText: text,
        affixes: [
          state.affixes[0],
          { modId: fixed.id, lines: ['+3(3)% to Maximum Cold Resistance'] },
        ],
      },
    })
    if (!result.ok) throw Error(result.error)
    expect(
      parseCraftProject(
        JSON.stringify({
          schemaVersion: 1,
          rulesVersion: CRAFT_RULES_VERSION,
          sourceCommit: catalog._meta.sourceCommit,
          jewelSourceHash: JEWEL_SOURCE.sha256,
          liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
          scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
          initialState: result.value,
          operations: [],
          cursor: 0,
        }),
        fixture,
        dictionary,
      ),
    ).toMatchObject({ ok: true })
    for (const token of ['+5(3)', '+4(2)', '+4', '+3(2)']) {
      const bad = parse(text.replace('+4(3)', token))
      expect(
        importCraftState(
          fixture,
          'Sapphire',
          bad,
          inspectItem(bad, dictionary),
          undefined,
          undefined,
          dictionary.stats?.entries,
        ).ok,
      ).toBe(false)
    }
    for (const replacement of ['+3(3)', '+4(+3)']) {
      const valid = parse(text.replace('+4(3)', replacement))
      expect(
        importCraftState(
          fixture,
          'Sapphire',
          valid,
          inspectItem(valid, dictionary),
          undefined,
          undefined,
          dictionary.stats?.entries,
        ).ok,
      ).toBe(true)
    }
    for (const scalar of [
      undefined,
      { scalable: false, formats: [] },
      { scalable: true, formats: ['unknown'] },
      { scalable: true, formats: ['per_minute_to_per_second'] },
    ]) {
      const data = structuredClone(fixture)
      if (scalar) data.scalability = { ...data.scalability, [fixed.lines[0] as string]: [scalar] }
      else delete data.scalability?.[fixed.lines[0] as string]
      expect(
        importCraftState(
          data,
          'Sapphire',
          item,
          inspectItem(item, dictionary),
          undefined,
          undefined,
          dictionary.stats?.entries,
        ).ok,
      ).toBe(false)
    }
    const unscalable = parse(`${text} (unscalable)`)
    expect(
      importCraftState(
        fixture,
        'Sapphire',
        unscalable,
        inspectItem(unscalable, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      ).ok,
    ).toBe(false)
    const wrongMetadata = structuredClone(fixture)
    wrongMetadata.scalability = {
      ...wrongMetadata.scalability,
      [fixed.lines[0] as string]: [
        { scalable: true, formats: [] },
        { scalable: true, formats: [] },
      ],
    }
    expect(
      importCraftState(
        wrongMetadata,
        'Sapphire',
        item,
        inspectItem(item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      ).ok,
    ).toBe(false)
  })

  it('神圣重掷只变基础掷值，重新导出标题与项目来源重建保持一致', () => {
    const result = imported(exported())
    if (!result.ok) throw Error(result.error)
    const next = applyCraftStep(catalog, result.value, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'CraftedJewelSuffixEffect', values: [60] },
        { modId: 'JewelSpellCriticalChance', values: [10] },
      ],
    })
    if (!next.ok) throw Error(next.error)
    expect(next.value.affixes[1]?.lines).toEqual([
      '10(5-15)% increased Critical Hit Chance for Spells',
    ])
    const text = exported(next.value)
    expect(text).toContain('— 60% Increased }')
    expect(imported(text)).toMatchObject({ ok: true, value: { affixes: next.value.affixes } })
  })

  it('无范围旧起点施加 Ferocity 后仅出口补足范围，项目回放仍保留原基础状态', () => {
    const ordinary: CraftState = {
      ...state,
      affixes: [
        {
          modId: 'JewelSpellCriticalChance',
          lines: ['15% increased Critical Hit Chance for Spells'],
        },
        { modId: 'JewelCriticalChance', lines: ['10% increased Critical Hit Chance'] },
      ],
    }
    const originalText = exported(ordinary)
    expect(originalText).not.toContain('15(5-15)')
    const initial = imported(originalText)
    if (!initial.ok) throw Error(initial.error)
    const operation = {
      kind: 'liquid-emotion' as const,
      emotionId: 'Metadata/Items/Currency/EndgameDistilledEmotion2',
      resultKind: 'prefix' as const,
      removeModId: 'JewelCriticalChance',
      values: [50],
    }
    const crafted = applyCraftStep(catalog, initial.value, operation)
    if (!crafted.ok) throw Error(crafted.error)
    const before = JSON.stringify(crafted.value)
    const text = exported(crafted.value)
    expect(text).toContain('15(5-15)% increased Critical Hit Chance for Spells')
    expect(JSON.stringify(crafted.value)).toBe(before)
    expect(imported(text).ok).toBe(true)
    expect(
      parseCraftProject(
        JSON.stringify({
          schemaVersion: 1,
          rulesVersion: CRAFT_RULES_VERSION,
          sourceCommit: catalog._meta.sourceCommit,
          jewelSourceHash: JEWEL_SOURCE.sha256,
          liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
          scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
          initialState: initial.value,
          operations: [operation],
          cursor: 1,
        }),
        catalog,
        dictionary,
      ),
    ).toMatchObject({ ok: true, value: { states: [initial.value, crafted.value] } })
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '%s 真词典往返保留基础值，标题核对侧别与催化加法',
    (locale) => {
      const dict =
        locale === 'en'
          ? dictionary
          : createCraftItemDictionary(catalog, {
              items: JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/items.json`, import.meta.url),
                  'utf8',
                ),
              ),
              stats: JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url),
                  'utf8',
                ),
              ),
            })
      const value = { ...state, catalyst: { id: 'Sibilant', quality: 20 } }
      const text = exported(value, dict, locale)
      expect(text).toContain('— 70% Increased }')
      expect(imported(text, dict)).toMatchObject({
        ok: true,
        value: { affixes: state.affixes, sourceText: text },
      })
    },
  )

  it('无催化允许准确增效头及省略头的完整基础范围，未知百分比与缺范围拒绝', () => {
    const text = exported()
    expect(text).toContain('— 50% Increased }')
    expect(imported(text).ok).toBe(true)
    expect(imported(text.replace(' — 50% Increased', '')).ok).toBe(true)
    for (const invalid of [
      text.replace('50% Increased', '51% Increased'),
      text.replace('50% Increased', '50% Other'),
      text.replace('15(5-15)', '15'),
      text.replace('50(40-60)', '50'),
    ])
      expect(imported(invalid).ok).toBe(false)
  })

  it('导入检查结果的英语数字伪造不能替代原文或词典证据', () => {
    const text = exported()
    const item = parse(text)
    const inspection = inspectItem(item, dictionary)
    const line = inspection.mods[1]?.stats[0]
    if (!line) throw Error('fixture')
    line.resolution.english = '14(5-15)% increased Critical Hit Chance for Spells'
    expect(
      importCraftState(
        catalog,
        state.baseId,
        item,
        inspection,
        undefined,
        undefined,
        dictionary.stats?.entries,
      ).ok,
    ).toBe(false)
  })
})
