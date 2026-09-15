import { describe, expect, it } from 'vitest'
import { alloyCatalogSignature } from './alloys'
import { alloyTestFixture } from './alloyTestFixture'
import { catalog as primary } from './catalystTestFixture'
import { CRAFT_RULES_VERSION, type CraftProject } from './craftProject'
import { upgradeCraftProjectIdentity } from './craftProjectIdentity'
import { parseIdentityCraftProject } from './craftProjectIdentityReader'
import {
  parseTargetCraftProject,
  serializeTargetCraftProject,
  upgradeTargetCraftProject,
} from './craftProjectTargets'
import type { ItemDictionary } from './export'
import { JEWEL_SOURCE } from './jewels'
import { LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { catalog as makeCatalog } from './partialTargetFixture'
import type { CraftResult } from './rehearsal'
import { socketStrategyCatalog } from './socketStrategyFixture'
import { STAT_SCALABILITY_SOURCE } from './statScalability'

function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
const source = { ...primary, alloys: alloyTestFixture() }
const cases = [
  {
    modId: 'AlloyMaximumRunicWard1',
    baseId: 'Gold Ring',
    fields: { alloyCatalogSignature: alloyCatalogSignature(source) as string },
  },
  {
    modId: 'AlloyEffectOfResistanceMods1',
    baseId: 'Gold Ring',
    fields: {
      alloyCatalogSignature: alloyCatalogSignature(source) as string,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    },
  },
  {
    modId: 'CraftedJewelPrefixEffect',
    baseId: 'Ruby',
    fields: {
      jewelSourceHash: JEWEL_SOURCE.sha256,
      liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    },
  },
]

describe('v74 来源门禁', () => {
  it.each(cases)(
    '只有失联条件引用 $modId 也要求完整来源，未触发阶段不能绕过',
    ({ modId, baseId, fields }) => {
      const old: CraftProject = {
        schemaVersion: 1,
        rulesVersion: CRAFT_RULES_VERSION,
        sourceCommit: source._meta.sourceCommit,
        initialState: { baseId, itemLevel: 86, rarity: 'normal', affixes: [], sourceText: null },
        operations: [],
        cursor: 0,
        targetModIds: [],
        ...fields,
        strategyStartStep: 0,
        strategy: {
          maxSteps: 10,
          flow: {
            entryStageId: 'first',
            stages: [
              { id: 'first', name: '首步' },
              { id: 'future', name: '尚未进入' },
            ],
          },
          rules: [
            { stageId: 'first', conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
            {
              stageId: 'future',
              conditions: [
                {
                  kind: 'not',
                  condition: { kind: 'selected-targets', modIds: [modId], min: 1, value: false },
                },
              ],
              action: { kind: 'stop' },
            },
          ],
        },
      }
      const baseline = must(upgradeCraftProjectIdentity(JSON.stringify(old), source))
      const upgraded = must(upgradeTargetCraftProject(JSON.stringify(baseline.project), source))
      expect(upgraded.project.orphanedTargets).toEqual([{ targetId: 't1', modId }])
      expect(upgraded.project.targetDefinitions.targets).toEqual([])
      expect(upgraded.project.targetDefinitions.nextTargetId).toBe(2)
      expect(
        parseTargetCraftProject(
          must(serializeTargetCraftProject(upgraded.project, source)),
          source,
        ),
      ).toEqual({ ok: true, value: upgraded })
      for (const key of Object.keys(fields)) {
        for (const replacement of [undefined, 'tampered']) {
          const broken = JSON.parse(JSON.stringify(upgraded.project))
          if (replacement === undefined) delete broken[key]
          else broken[key] = replacement
          expect(parseTargetCraftProject(JSON.stringify(broken), source).ok, key).toBe(false)
          expect(serializeTargetCraftProject(broken, source).ok, key).toBe(false)
          const legacyBroken = JSON.parse(JSON.stringify(baseline.project))
          if (replacement === undefined) delete legacyBroken[key]
          else legacyBroken[key] = replacement
          expect(parseIdentityCraftProject(JSON.stringify(legacyBroken), source).ok, key).toBe(
            false,
          )
        }
      }
    },
  )

  it('显式有效值目标独立触发来源，不能因无当前词缀而删除指纹', () => {
    const old: CraftProject = {
      schemaVersion: 1,
      rulesVersion: CRAFT_RULES_VERSION,
      sourceCommit: source._meta.sourceCommit,
      initialState: {
        baseId: 'Gold Ring',
        itemLevel: 86,
        rarity: 'normal',
        affixes: [],
        sourceText: null,
      },
      operations: [],
      cursor: 0,
      targetModIds: ['FireResist1'],
      targetValues: [{ modId: 'FireResist1', basis: 'effective', bounds: [{ index: 0, min: 8 }] }],
      scalabilitySourceHash: STAT_SCALABILITY_SOURCE.sha256,
    }
    const baseline = must(upgradeCraftProjectIdentity(JSON.stringify(old), source))
    const upgraded = must(upgradeTargetCraftProject(JSON.stringify(baseline.project), source))
    const broken = JSON.parse(JSON.stringify(upgraded.project))
    delete broken.scalabilitySourceHash
    expect(parseTargetCraftProject(JSON.stringify(broken), source).ok).toBe(false)
    expect(serializeTargetCraftProject(broken, source).ok).toBe(false)
  })
})

const locales = [
  {
    locale: 'en',
    name: 'Focus',
    category: 'Item Class: Foci',
    rarity: 'Rarity: Normal',
    level: 'Item Level: 86',
  },
  {
    locale: 'zh-CN',
    name: '测试法器',
    category: '物品类别: 法器',
    rarity: '稀有度: 普通',
    level: '物品等级: 86',
  },
  {
    locale: 'zh-TW',
    name: '測試法器',
    category: '物品種類: 法器',
    rarity: '稀有度: 普通',
    level: '物品等級: 86',
  },
]

describe('v74 三语来源和导入声明', () => {
  it.each(locales)(
    '$locale 原文、品质和孔位声明、未来历史及报价原样保存',
    ({ name, category, rarity, level, locale }) => {
      const catalog = makeCatalog()
      catalog.augments = socketStrategyCatalog().augments ?? []
      const hash = 'b'.repeat(64)
      catalog._meta.sources.push({
        path: 'src/Data/ModRunes.lua',
        url: 'https://example.test/runes',
        sha256: hash,
      })
      const dictionary: ItemDictionary = { items: { bases: { Focus: name }, uniques: {} } }
      const raw = [category, rarity, name, '--------', level].join('\n')
      const old: CraftProject = {
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: CRAFT_RULES_VERSION,
        initialState: {
          baseId: 'Focus',
          itemLevel: 86,
          rarity: 'normal',
          affixes: [],
          sourceText: raw,
          quality: 25,
          sockets: [null],
        },
        importedQuality: 25,
        importedSockets: [null],
        augmentSourceHash: hash,
        operations: [
          { currency: 'transmutation', modIds: ['p1'], rolls: [{ modId: 'p1', values: [7] }] },
        ],
        cursor: 0,
        targetModIds: ['p1'],
        pricing: { unit: 'divine', prices: {}, baseCost: 3 },
      }
      const baseline = must(upgradeCraftProjectIdentity(JSON.stringify(old), catalog, dictionary))
      const upgraded = must(
        upgradeTargetCraftProject(JSON.stringify(baseline.project), catalog, dictionary),
      )
      const before = structuredClone(upgraded)
      expect(upgraded.states).toEqual(baseline.states)
      expect(upgraded.project).toMatchObject({
        importedQuality: 25,
        importedSockets: [null],
        augmentSourceHash: hash,
        pricing: old.pricing,
        cursor: 0,
        initialState: { sourceText: raw },
      })
      expect(upgraded.project.operations[0]).toMatchObject({
        rolls: [{ modId: 'p1', values: [7], affixId: 'a1' }],
      })
      const text = must(serializeTargetCraftProject(upgraded.project, catalog, dictionary))
      expect(parseTargetCraftProject(text, catalog, dictionary)).toEqual({
        ok: true,
        value: upgraded,
      })
      expect(upgraded).toEqual(before)
      if (locale !== 'en') expect(parseTargetCraftProject(text, catalog).ok).toBe(false)
      const tampered = {
        ...upgraded.project,
        initialState: { ...upgraded.project.initialState, itemLevel: 85 },
      }
      expect(parseTargetCraftProject(JSON.stringify(tampered), catalog, dictionary).ok).toBe(false)
      expect(serializeTargetCraftProject(tampered, catalog, dictionary).ok).toBe(false)
    },
  )
})
