import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { estimateDefences } from './defences'
import { type ItemDictionary, inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { runeSocketContributionError } from './runeImport'
import { socketCandidates, socketEffects, socketStateError } from './sockets'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(new URL('../../../data/craft/catalog.json', import.meta.url), 'utf8'),
)
const horrorId = 'EssenceLocalRuneAndSoulCoreEffect1'
const essenceId = 'Metadata/Items/Currency/CurrencyCorruptedEssenceHorror'
const line = '60% increased effect of Socketed Augment Items'
const iron = 'pob2:augment:["Iron Rune","armour"]'
const lesser = 'pob2:augment:["Lesser Iron Rune","armour"]'
const state: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'rare',
  quality: 20,
  sourceText: null,
  sockets: [iron, lesser],
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
}
const operation = { kind: 'essence' as const, essenceId, removeModId: 'IncreasedLife1', values: [] }
const amplified: CraftState = {
  ...state,
  affixes: [{ modId: horrorId, lines: [line], crafted: true }],
}
const effects = (input: CraftState) => socketEffects(catalog, input).flatMap((x) => x.augment.lines)
function imported(
  input: CraftState,
  locale: 'en' | 'zh-CN' | 'zh-TW' = 'en',
  dictionary: ItemDictionary = {},
): CraftState {
  const exported = exportCraftItemText(catalog, input, { locale, dictionary })
  if (!exported.ok) throw new Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, createCraftItemDictionary(catalog, dictionary))
  const result = importCraftState(catalog, input.baseId, parsed.item, inspection, input.sockets)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('恐惧精华镶嵌增效', () => {
  it.each(['en', 'zh-CN', 'zh-TW'] as const)(
    '%s 使用入库独立词典回读增效，来源在消除后保留，项目恢复核对起点',
    (locale) => {
      const dictionary: ItemDictionary =
        locale === 'en'
          ? {}
          : {
              stats: JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/stats.json`, import.meta.url),
                  'utf8',
                ),
              ),
              items: JSON.parse(
                readFileSync(
                  new URL(`../../../data/dict/${locale}/items.json`, import.meta.url),
                  'utf8',
                ),
              ),
            }
      const initialState = imported(amplified, locale, dictionary)
      expect(initialState.runeSourceLines).toEqual(effects(amplified))
      const removal = { currency: 'annulment' as const, modIds: [], removeModId: horrorId }
      const removed = applyCraftStep(catalog, initialState, removal)
      expect(removed.ok).toBe(true)
      if (!removed.ok) return
      expect(removed.value.runeSourceLines).toEqual(initialState.runeSourceLines)
      expect(effects(removed.value)).toEqual(effects(state))
      const project = {
        schemaVersion: 1,
        rulesVersion: CRAFT_RULES_VERSION,
        sourceCommit: catalog._meta.sourceCommit,
        augmentSourceHash: catalog._meta.sources.find((x) => x.path === 'src/Data/ModRunes.lua')
          ?.sha256,
        importedSockets: initialState.sockets,
        initialState,
        operations: [removal],
        cursor: 1,
      }
      expect(parseCraftProject(JSON.stringify(project), catalog, dictionary)).toMatchObject({
        ok: true,
        value: { states: [initialState, removed.value] },
      })
    },
  )

  it('已有两孔手套可制作，并逐枚向下取整后合计，保留目录与绑定来源', () => {
    const snapshot = JSON.stringify(catalog)
    expect(createCraftState(catalog, state).ok).toBe(true)
    const result = applyCraftStep(catalog, state, operation)
    expect(result).toMatchObject({ ok: true, value: amplified })
    expect(effects(amplified)).toEqual([
      '25% increased Armour, Evasion and Energy Shield',
      '22% increased Armour, Evasion and Energy Shield',
    ])
    expect(estimateDefences(catalog, amplified)).toMatchObject({
      ok: true,
      value: [
        { stat: 'Armour', runeIncreased: 47, value: 173 },
        { stat: 'EnergyShield', runeIncreased: 47, value: 48 },
      ],
    })
    expect(socketCandidates(catalog, amplified).find((x) => x.id === iron)?.lines).toEqual([
      '25% increased Armour, Evasion and Energy Shield',
    ])
    expect(JSON.stringify(catalog)).toBe(snapshot)
  })

  it('相同孔内物也比较实际效果，移除精华即时恢复普通值', () => {
    const comparison = compareCraftStates(catalog, state, amplified)
    expect(comparison).toMatchObject({
      ok: true,
      value: {
        sockets: [
          {
            socketIndex: 0,
            beforeId: iron,
            afterId: iron,
            beforeLines: ['16% increased Armour, Evasion and Energy Shield'],
            afterLines: ['25% increased Armour, Evasion and Energy Shield'],
          },
          { socketIndex: 1, beforeId: lesser, afterId: lesser },
        ],
      },
    })
    const removed = applyCraftStep(catalog, amplified, {
      currency: 'annulment',
      modIds: [],
      removeModId: horrorId,
    })
    expect(removed.ok).toBe(true)
    if (removed.ok) expect(effects(removed.value)).toEqual(effects(state))
  })

  it('导入以增效后的合计核对，导出也使用当前有效值', () => {
    expect(
      runeSocketContributionError(catalog, {
        ...amplified,
        runeSourceLines: ['47% increased Armour, Evasion and Energy Shield'],
      }),
    ).toBeNull()
    for (const value of [30, 48])
      expect(
        runeSocketContributionError(catalog, {
          ...amplified,
          runeSourceLines: [`${value}% increased Armour, Evasion and Energy Shield`],
        }),
      ).not.toBeNull()
    const exported = exportCraftItemText(catalog, amplified)
    expect(exported.ok).toBe(true)
    if (exported.ok) {
      expect(exported.value.text).toContain(
        '25% increased Armour, Evasion and Energy Shield (rune)',
      )
      expect(exported.value.text).toContain(
        '22% increased Armour, Evasion and Energy Shield (rune)',
      )
    }
  })

  it('不放宽其他特殊规则、旧数值或身份；鞋可用', () => {
    for (const patch of [
      {
        affixes: [
          { modId: horrorId, lines: [line.replace('60%', '100%')], crafted: true as const },
        ],
      },
      { affixes: [{ modId: horrorId, lines: [line, 'Has 3 Sockets'], crafted: true as const }] },
      { affixes: [{ modId: horrorId, lines: [line] }] },
      { implicitLines: ['60% increased effect of Socketed Augment Items'] },
    ])
      expect(socketStateError(catalog, { ...amplified, ...patch })).not.toBeNull()
    const boots = catalog.bases.find((x) => x.type === 'Boots' && !x.hidden && !x.runeforged)
    expect(boots).toBeDefined()
    if (boots) expect(createCraftState(catalog, { ...amplified, baseId: boots.id }).ok).toBe(true)
  })

  it('新版保存全历史；旧版拒绝起点及撤销后注入，零孔合法旧项目仍可升级', () => {
    const hash = (path: string) => catalog._meta.sources.find((x) => x.path === path)?.sha256
    const project = {
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: catalog._meta.sourceCommit,
      augmentSourceHash: hash('src/Data/ModRunes.lua'),
      essenceSourceHash: hash('src/Data/Essence.lua'),
      initialState: imported(state),
      importedSockets: state.sockets,
      operations: [operation],
      cursor: 0,
    }
    const restored = parseCraftProject(JSON.stringify(project), catalog)
    expect(restored.ok).toBe(true)
    if (restored.ok)
      expect(effects(restored.value.states[1] as CraftState)).toEqual(effects(amplified))
    for (const initialState of [state, amplified]) {
      const old = parseCraftProject(
        JSON.stringify({
          ...project,
          initialState: imported(initialState),
          operations: initialState === state ? [operation] : [],
          rulesVersion: 'basic-2026-09-12-v34',
        }),
        catalog,
      )
      expect(old.ok ? '' : old.error).toContain('镶嵌增效')
    }
    expect(
      parseCraftProject(
        JSON.stringify({
          ...project,
          rulesVersion: 'basic-2026-09-12-v34',
          initialState: imported({ ...state, sockets: [] }),
          importedSockets: [],
          operations: [operation],
        }),
        catalog,
      ).ok,
    ).toBe(true)
  })
})
