import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { applyCraftStep } from './craftSteps'
import { prepareEssenceCraft } from './essenceCraft'
import { essenceResultModIds } from './essenceOutcomes'
import { inspectEssences } from './essences'
import { type CraftState, craftCandidates } from './rehearsal'

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('测试目录缺少预期记录')
  return value
}

const catalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')) as CraftCatalog
const essenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceAttribute'
const resultIds = [
  'EssencePercentStrength1',
  'EssencePercentDexterity1',
  'EssencePercentIntelligence1',
] as const
const base = required(catalog.bases.find((entry) => entry.id === 'Amber Amulet'))
const state: CraftState = {
  baseId: base.id,
  itemLevel: 72,
  rarity: 'rare',
  sourceText: null,
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
}

describe('完美无限精华真实结果', () => {
  it('展开三条独立后缀，不进入普通生成池', () => {
    expect(
      inspectEssences(catalog, base)
        .filter((entry) => entry.essence.id === essenceId)
        .map((entry) => entry.modId),
    ).toEqual(resultIds)
    const essence = required(catalog.essences?.find((entry) => entry.id === essenceId))
    expect(essenceResultModIds(catalog, base, essence)).toEqual(resultIds)
    for (const id of resultIds)
      expect(craftCandidates(catalog, state).map((entry) => entry.id)).not.toContain(id)
    expect(
      inspectEssences(catalog, base)
        .filter((entry) => entry.essence.id === essenceId)
        .map((entry) => entry.resultModId),
    ).toEqual(resultIds)
  })
  it.each(resultIds)('显式制作 %s，保留工艺身份和数值范围', (resultModId) => {
    expect(prepareEssenceCraft(catalog, state, essenceId, undefined, resultModId)).toMatchObject({
      ok: true,
      value: { mod: { id: resultModId, level: 72 } },
    })
    expect(
      applyCraftStep(catalog, state, {
        kind: 'essence',
        essenceId,
        resultModId,
        removeModId: 'IncreasedLife1',
        values: [9],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        affixes: [
          { modId: resultModId, crafted: true, lines: [expect.stringContaining('9(7-10)%')] },
        ],
      },
    })
  })
  it('要求选择并拒绝越权结果和低物等', () => {
    expect(prepareEssenceCraft(catalog, state, essenceId)).toMatchObject({
      ok: false,
      error: expect.stringContaining('选择'),
    })
    expect(prepareEssenceCraft(catalog, state, essenceId, undefined, 'Strength6').ok).toBe(false)
    expect(
      prepareEssenceCraft(catalog, { ...state, itemLevel: 71 }, essenceId, undefined, resultIds[0])
        .ok,
    ).toBe(false)
  })
  it('严格核对来源、声明、实际词缀身份和普通池资格', () => {
    const mutations: ((input: CraftCatalog) => void)[] = [
      (input) => {
        input._meta.sources = input._meta.sources.filter(
          (source) => source.path !== 'src/Data/Essence.lua',
        )
      },
      (input) => {
        required(
          input._meta.sources.find((source) => source.path === 'src/Data/ModItem.lua'),
        ).sha256 = 'a'.repeat(64)
      },
      (input) => {
        required(input.essences?.find((entry) => entry.id === essenceId)).mods.Amulet =
          'EssenceDisplayAttributes3'
      },
      (input) => {
        required(input.essences?.find((entry) => entry.id === essenceId)).mods.Amulet = resultIds[0]
      },
      (input) => {
        required(input.modifiers.find((entry) => entry.id === resultIds[0])).eligibility = [
          { tag: 'default', value: 1 },
        ]
      },
      (input) => {
        required(input.modifiers.find((entry) => entry.id === resultIds[0])).group = 'Strength'
      },
      (input) => {
        required(input.modifiers.find((entry) => entry.id === resultIds[0])).level = 57
      },
    ]
    for (const mutate of mutations) {
      const input = structuredClone(catalog)
      mutate(input)
      expect(prepareEssenceCraft(input, state, essenceId, undefined, resultIds[0]).ok).toBe(false)
    }
    expect(
      prepareEssenceCraft(
        catalog,
        { ...state, baseId: 'Iron Ring' },
        essenceId,
        undefined,
        resultIds[0],
      ).ok,
    ).toBe(false)
  })
  it('防御精华接入后，其余82个类别映射继续保留未解析状态', () => {
    const seen = new Set<string>()
    for (const currentBase of catalog.bases)
      for (const entry of inspectEssences(catalog, currentBase)) {
        if (!entry.mod && !entry.essence.id.endsWith('EssenceDefences'))
          seen.add(`${entry.essence.id}:${entry.category}`)
      }
    expect(seen.size).toBe(82)
  })
  it('单结果继续无需新字段，并拒绝伪造结果字段与越界数值', () => {
    const essence = required(
      catalog.essences?.find(
        (entry) => entry.id === 'Metadata/Items/Currency/CurrencyLesserEssenceLife',
      ),
    )
    expect(essenceResultModIds(catalog, base, essence)).toEqual([essence.mods.Amulet])
    expect(
      applyCraftStep(
        catalog,
        { ...state, rarity: 'magic', affixes: [] },
        { kind: 'essence', essenceId: essence.id, values: [25] },
      ).ok,
    ).toBe(true)
    for (const values of [[6], [11], []])
      expect(
        applyCraftStep(catalog, state, {
          kind: 'essence',
          essenceId,
          resultModId: resultIds[0],
          removeModId: 'IncreasedLife1',
          values,
        }).ok,
      ).toBe(false)
    for (const resultModId of [null, 1, '', undefined])
      expect(
        applyCraftStep(catalog, state, {
          kind: 'essence',
          essenceId,
          resultModId: resultModId as string,
          removeModId: 'IncreasedLife1',
          values: [9],
        }).ok,
      ).toBe(false)
  })
  it('按真实冲突组和工艺容量拒绝冲突，不能伪造Astrid首饰孔绕过', () => {
    const crafted: CraftState = {
      ...state,
      affixes: [
        ...state.affixes,
        { modId: resultIds[0], lines: ['9% increased Strength'], crafted: true },
      ],
    }
    for (const resultId of resultIds)
      expect(prepareEssenceCraft(catalog, crafted, essenceId, undefined, resultId).ok).toBe(false)
    expect(
      prepareEssenceCraft(
        catalog,
        { ...crafted, sockets: ['pob2:augment:["Astrid\'s Creativity","armour"]'] },
        essenceId,
        undefined,
        resultIds[1],
      ).ok,
    ).toBe(false)
    expect(
      new Set(
        resultIds.map((id) => required(catalog.modifiers.find((entry) => entry.id === id)).group),
      ).size,
    ).toBe(3)
  })
  it('结晶预兆沿用真实移除侧，不将结果选择视为移除选择', () => {
    for (const resultId of resultIds) {
      expect(
        prepareEssenceCraft(catalog, state, essenceId, 'sinistral_crystallisation', resultId),
      ).toMatchObject({ ok: true, value: { removableAffixes: [{ modId: 'IncreasedLife1' }] } })
      expect(
        prepareEssenceCraft(catalog, state, essenceId, 'dextral_crystallisation', resultId).ok,
      ).toBe(false)
    }
  })
  it('破裂词缀不能移除', () => {
    const fractured: CraftState = {
      ...state,
      affixes: [{ ...required(state.affixes[0]), fractured: true }],
    }
    expect(prepareEssenceCraft(catalog, fractured, essenceId, undefined, resultIds[0]).ok).toBe(
      false,
    )
  })
})
