import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { catalog, dictionary } from './catalystTestFixture'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { LIQUID_EMOTION_SOURCE, supportedLiquidEmotionId } from './liquidEmotions'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { craftTargetCandidates, validateCraftTargets } from './targets'

const melancholy = 'Metadata/Items/Currency/EndgameDistilledEmotion1'
const isolation = 'Metadata/Items/Currency/DistilledEmotion10'
const cases = [
  ['Ruby', melancholy, 'CraftedJewelDebilitateOnHitWhileEmeraldSapphireSocketed', []],
  ['Sapphire', melancholy, 'CraftedJewelExposureOnHitWhileRubyEmeraldSocketed', []],
  ['Emerald', melancholy, 'CraftedJewelBlindOnHitWhileRubySapphireSocketed', []],
  ['Diamond', isolation, 'CraftedJewelMaximumChaosResistance', []],
] as const
function start(baseId: string, emotionId: string): CraftState {
  for (const mod of catalog.modifiers.filter((m) => m.jewelOnly)) {
    const ranges = inspectNumericLines(mod.lines)
    if (!ranges.ok) continue
    const lines = renderNumericLines(
      mod.lines,
      ranges.value.map((r) => r.min),
    )
    if (!lines.ok) continue
    const candidate: CraftState = {
      baseId,
      rarity: 'rare',
      itemLevel: 86,
      sourceText: null,
      affixes: [{ modId: mod.id, lines: lines.value }],
    }
    if (prepareLiquidEmotionCraft(catalog, candidate, emotionId).ok) return imported(candidate)
  }
  throw Error('没有可用测试起点')
}
function imported(state: CraftState, locale: 'en' | 'zh-CN' | 'zh-TW' = 'en'): CraftState {
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
  const exported = exportCraftItemText(catalog, state, { locale, dictionary: dict })
  if (!exported.ok) throw Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const result = importCraftState(
    catalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, dict),
    undefined,
    undefined,
    dict.stats?.entries,
  )
  if (!result.ok) throw Error(result.error)
  return result.value
}
describe('珠宝工艺专属固定效果', () => {
  it('支持列表新增 Melancholy，增容增效尚不因数据声明而开放', () => {
    expect(supportedLiquidEmotionId(melancholy)).toBe(true)
    for (const id of [
      'Metadata/Items/Currency/EndgameDistilledEmotion2',
      'Metadata/Items/Currency/EndgameDistilledEmotion3',
      `${melancholy}0`,
    ])
      expect(supportedLiquidEmotionId(id)).toBe(false)
  })
  it.each(cases)(
    '%s 固定效果制作、目标、普通身份隔离和项目往返',
    (baseId, emotionId, modId, values) => {
      const state = start(baseId, emotionId)
      const first = state.affixes[0]
      if (!first) throw Error('缺少起点词缀')
      const operation = {
        kind: 'liquid-emotion' as const,
        emotionId,
        removeModId: first.modId,
        values: [...values],
      }
      const crafted = applyCraftStep(catalog, state, operation)
      if (!crafted.ok) throw Error(crafted.error)
      expect(crafted.value.affixes).toHaveLength(1)
      expect(crafted.value.affixes[0]).toMatchObject({ modId, crafted: true })
      for (const locale of ['en', 'zh-CN', 'zh-TW'] as const)
        expect(imported(crafted.value, locale).affixes).toEqual(crafted.value.affixes)
      expect(
        createCraftState(catalog, {
          ...crafted.value,
          affixes: crafted.value.affixes.map(({ crafted: _crafted, ...affix }) => affix),
        }).ok,
      ).toBe(false)
      expect(craftTargetCandidates(catalog, baseId).some((m) => m.id === modId)).toBe(true)
      expect(validateCraftTargets(catalog, baseId, [modId]).ok).toBe(true)
      const project = {
        schemaVersion: 1,
        rulesVersion: CRAFT_RULES_VERSION,
        sourceCommit: catalog._meta.sourceCommit,
        jewelSourceHash: JEWEL_SOURCE.sha256,
        liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
        initialState: state,
        operations: [operation],
        cursor: 1,
      }
      expect(parseCraftProject(JSON.stringify(project), catalog, dictionary).ok).toBe(true)
      expect(collectCraftCosts(catalog, [operation])).toMatchObject({
        ok: true,
        value: [{ id: `emotion:${emotionId}`, count: 1 }],
      })
      for (const cursor of [0, 1])
        expect(
          parseCraftProject(
            JSON.stringify({ ...project, rulesVersion: 'basic-2026-09-12-v50', cursor }),
            catalog,
            dictionary,
          ).ok,
        ).toBe(false)
      const targetOnly = { ...project, operations: [], cursor: 0, targetModIds: [modId] }
      expect(parseCraftProject(JSON.stringify(targetOnly), catalog, dictionary).ok).toBe(true)
      expect(
        parseCraftProject(
          JSON.stringify({ ...targetOnly, liquidEmotionSourceHash: undefined }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
      expect(
        parseCraftProject(
          JSON.stringify({ ...targetOnly, rulesVersion: 'basic-2026-09-12-v50' }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
      const craftedStart = {
        ...project,
        initialState: imported(crafted.value),
        operations: [],
        cursor: 0,
      }
      expect(parseCraftProject(JSON.stringify(craftedStart), catalog, dictionary).ok).toBe(true)
      expect(
        parseCraftProject(
          JSON.stringify({ ...craftedStart, rulesVersion: 'basic-2026-09-12-v50' }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
      expect(applyCraftStep(catalog, state, { ...operation, values: [99] }).ok).toBe(false)
      expect(applyCraftStep(catalog, crafted.value, operation).ok).toBe(false)
    },
  )
  it('钻石空映射仍不回退，三色固定效果不能互换', () => {
    const diamond = start('Diamond', isolation)
    expect(prepareLiquidEmotionCraft(catalog, diamond, melancholy).ok).toBe(false)
    expect(
      prepareLiquidEmotionCraft(catalog, diamond, 'Metadata/Items/Currency/DistilledEmotion1').ok,
    ).toBe(false)
    expect(
      craftTargetCandidates(catalog, 'Ruby').some(
        (m) => m.id === 'CraftedJewelMaximumChaosResistance',
      ),
    ).toBe(false)
  })
})
