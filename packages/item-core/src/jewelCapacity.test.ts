import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { boneCatalog, boneState } from './boneTestFixture'
import { catalog as realCatalog } from './catalystTestFixture'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { applyCraftStep } from './craftSteps'
import { evaluateCraftStrategy } from './craftStrategy'
import { prepareEssenceCraft } from './essenceCraft'
import { inspectItem } from './export'
import { craftAffixCapacities, craftAffixSpace, usesJewelCapacity } from './index'
import { jewelFixture } from './jewelTestFixture'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectLiquidEmotions, LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { inspectNumericLines, renderNumericLines } from './numeric'
import { parseItem } from './parse'
import { craftCandidates, createCraftState, prepareCraftOperation } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { checkCraftStrategyAction } from './strategyActions'
import { craftTargetCandidates } from './targets'

const contempt = 'Metadata/Items/Currency/EndgameDistilledEmotion3'
const extra = {
  prefix: 'CraftedJewelAdditionalSuffixAllowed',
  suffix: 'CraftedJewelAdditionalPrefixAllowed',
} as const
function fixture(ids: string[] = []) {
  const { catalog, state, base } = jewelFixture()
  catalog._meta.sources.push(LIQUID_EMOTION_SOURCE)
  catalog.liquidEmotions = structuredClone(realCatalog.liquidEmotions ?? [])
  catalog.modifiers.push(
    ...structuredClone(
      realCatalog.modifiers.filter((m) => Object.values(extra).includes(m.id as never)),
    ),
  )
  state.affixes = boneState(ids).affixes
  return { catalog, state, base }
}
function capacityAffix(kind: 'prefix' | 'suffix') {
  const mod = realCatalog.modifiers.find((m) => m.id === extra[kind])
  if (!mod) throw Error('缺少增容测试词缀')
  return { modId: mod.id, lines: [...mod.lines], crafted: true as const }
}

describe('珠宝已有状态与新增容量分离', () => {
  it.each(['prefix', 'suffix'] as const)('%s 工艺只增加反侧容量，移除后第三条保留', (kind) => {
    const opposite = kind === 'prefix' ? 'suffix' : 'prefix'
    const { catalog, state } = fixture([`${kind}1`, `${opposite}1`, `${opposite}2`, `${opposite}3`])
    state.affixes.push(capacityAffix(kind))
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(craftAffixCapacities(catalog, state)).toEqual({ [kind]: 2, [opposite]: 3 })
    expect(usesJewelCapacity(catalog, state)).toBe(true)
    const removed = applyCraftStep(catalog, state, {
      currency: 'annulment',
      modIds: [],
      removeModId: extra[kind],
    })
    if (!removed.ok) throw Error(removed.error)
    expect(removed.value.affixes).toHaveLength(4)
    expect(craftAffixCapacities(catalog, removed.value)).toEqual({ prefix: 2, suffix: 2 })
    expect(craftCandidates(catalog, removed.value).every((m) => m.kind === kind)).toBe(true)
    expect(prepareCraftOperation(catalog, removed.value, 'exalted').ok).toBe(true)
    expect(
      prepareCraftOperation(catalog, removed.value, 'exalted', undefined, 'greater_exaltation').ok,
    ).toBe(false)
  })
  it('无增容的五词缀保留，混沌移除超量侧失败，移除另一侧可填回', () => {
    const { catalog, state } = fixture(['prefix1', 'prefix2', 'suffix1', 'suffix2', 'suffix3'])
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(craftCandidates(catalog, state)).toEqual([])
    expect(craftAffixSpace(catalog, state)).toEqual({ prefix: 0, suffix: 0, total: 0 })
    expect(prepareCraftOperation(catalog, state, 'chaos', 'suffix1').ok).toBe(false)
    expect(prepareCraftOperation(catalog, state, 'chaos', 'prefix1').ok).toBe(true)
    const sparse = { ...state, affixes: state.affixes.filter((a) => a.modId !== 'prefix2') }
    const prepared = prepareCraftOperation(catalog, sparse, 'chaos', 'suffix1')
    if (!prepared.ok) throw Error(prepared.error)
    expect(craftCandidates(catalog, prepared.value.state).every((m) => m.kind === 'prefix')).toBe(
      true,
    )
  })
  it('历史状态需要液态来源，禁止六组及无工艺身份的增容', () => {
    const { catalog, state } = fixture(['prefix1', 'prefix2', 'suffix1', 'suffix2', 'suffix3'])
    expect(
      createCraftState(catalog, {
        ...state,
        affixes: [...state.affixes, ...boneState(['prefix3']).affixes],
      }).ok,
    ).toBe(false)
    catalog._meta.sources = catalog._meta.sources.filter(
      (s) => s.path !== LIQUID_EMOTION_SOURCE.path,
    )
    expect(createCraftState(catalog, state).ok).toBe(false)
    expect(
      createCraftState(realCatalog, {
        ...state,
        affixes: [{ ...capacityAffix('prefix'), crafted: undefined } as never],
      }).ok,
    ).toBe(false)
  })
  it('已有超量侧不会把空位计成负数而吞掉另一侧的双崇高空位', () => {
    const { catalog, state } = fixture(['suffix1', 'suffix2', 'suffix3'])
    expect(
      prepareCraftOperation(catalog, state, 'exalted', undefined, 'greater_exaltation').ok,
    ).toBe(true)
  })
})

describe('强效轻蔑双侧结果', () => {
  it.each(['Ruby', 'Emerald', 'Sapphire', 'Diamond'])(
    '%s 暴露两侧结果并严格要求显式选择',
    (baseId) => {
      const base = realCatalog.bases.find((b) => b.id === baseId)
      if (!base) throw Error('缺少珠宝')
      const entry = inspectLiquidEmotions(realCatalog, base).find((e) => e.emotion.id === contempt)
      expect(entry).toMatchObject({ reason: null, mod: null, modId: null })
      expect(entry?.outcomes.map((m) => m.id)).toEqual([extra.prefix, extra.suffix])
      const { catalog, state } = fixture(['prefix1', 'suffix1'])
      expect(prepareLiquidEmotionCraft(catalog, state, contempt).ok).toBe(false)
      for (const resultKind of ['prefix', 'suffix'] as const) {
        expect(prepareLiquidEmotionCraft(catalog, state, contempt, resultKind).ok).toBe(true)
        expect(
          applyCraftStep(catalog, state, {
            kind: 'liquid-emotion',
            emotionId: contempt,
            resultKind,
            removeModId: 'prefix1',
            values: [],
          }).ok,
        ).toBe(true)
      }
      expect(
        checkCraftStrategyAction(catalog, state, { kind: 'liquid-emotion', emotionId: contempt })
          .ok,
      ).toBe(true)
    },
  )
  it('任一侧映射损坏时整体拒绝；Ferocity 仍未开放', () => {
    const { catalog, base } = fixture()
    const mod = catalog.modifiers.find((m) => m.id === extra.suffix)
    if (!mod) throw Error('缺少测试词缀')
    mod.kind = 'prefix'
    expect(
      inspectLiquidEmotions(catalog, base).find((e) => e.emotion.id === contempt)?.outcomes,
    ).toEqual([])
    expect(
      inspectLiquidEmotions(realCatalog, base).find((e) =>
        e.emotion.id.endsWith('/EndgameDistilledEmotion2'),
      )?.reason,
    ).toBeTruthy()
  })
  it('新增工艺按移除后容量检查，不能借已有三组边界追加第三同侧', () => {
    const { catalog, state } = fixture(['prefix1', 'prefix2', 'suffix1', 'suffix2', 'suffix3'])
    const prepared = prepareLiquidEmotionCraft(catalog, state, contempt, 'prefix')
    expect(prepared.ok && prepared.value.removableAffixes.map((a) => a.modId)).toEqual([
      'prefix1',
      'prefix2',
    ])
  })
  it.each(['prefix', 'suffix'] as const)('%s 增容目标及高级文本往返', (kind) => {
    const state = {
      baseId: 'Sapphire',
      itemLevel: 86,
      rarity: 'rare' as const,
      affixes: [capacityAffix(kind)],
      sourceText: null,
    }
    expect(craftTargetCandidates(realCatalog, state.baseId).some((m) => m.id === extra[kind])).toBe(
      true,
    )
    for (const locale of ['en', 'zh-CN', 'zh-TW'] as const)
      expect(roundtrip(state, locale).affixes).toEqual(state.affixes)
  })
})

it('容量身份不能通过基础材料的伪映射或精华追加路径授权', () => {
  const { catalog, state, base } = fixture(['prefix1', 'prefix2', 'suffix1'])
  const emotion = catalog.liquidEmotions?.find((entry) => entry.id === contempt)
  if (!emotion) throw Error('缺少测试材料')
  catalog._meta.sources.push({ path: 'src/Data/Essence.lua', url: '', sha256: 'a'.repeat(64) })
  catalog.essences = [
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceTest',
      name: 'Test',
      type: 'Perfect',
      tierLevel: 1,
      mods: { Jewel: extra.prefix },
    },
  ]
  expect(
    prepareEssenceCraft(catalog, state, 'Metadata/Items/Currency/CurrencyPerfectEssenceTest').ok,
  ).toBe(false)
  emotion.id = 'Metadata/Items/Currency/DistilledEmotion1'
  emotion.mods.Sapphire = { prefix: extra.prefix }
  state.affixes = [capacityAffix('prefix')]
  expect(
    inspectLiquidEmotions(catalog, base).find((entry) => entry.emotion === emotion)?.reason,
  ).toBeTruthy()
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 2, suffix: 2 })
  expect(createCraftState(catalog, state).ok).toBe(false)
})
it('条件使用新增容量，超量已有词缀无合法空位', () => {
  const { catalog, state } = fixture(['suffix1', 'suffix2', 'suffix3'])
  expect(
    evaluateCraftStrategy(
      catalog,
      state,
      {
        maxSteps: 10,
        rules: [
          {
            conditions: [{ kind: 'not', condition: { kind: 'open-suffix', min: 1 } }],
            action: { kind: 'stop' },
          },
        ],
      },
      0,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  state.affixes = [...boneState(['suffix1', 'suffix2']).affixes, capacityAffix('prefix')]
  expect(
    evaluateCraftStrategy(
      catalog,
      state,
      {
        maxSteps: 10,
        rules: [{ conditions: [{ kind: 'open-suffix', min: 1 }], action: { kind: 'stop' } }],
      },
      0,
    ),
  ).toMatchObject({ ok: true, value: { kind: 'stop' } })
})
it('步骤严格拒绝缺省、空值、未知结果及单侧多余 resultKind', () => {
  const { catalog, state } = fixture(['prefix1', 'suffix1'])
  for (const resultKind of [undefined, null, 'both', ''])
    expect(
      applyCraftStep(catalog, state, {
        kind: 'liquid-emotion',
        emotionId: contempt,
        removeModId: 'prefix1',
        values: [],
        resultKind,
      } as never).ok,
    ).toBe(false)
  const ordinary = realCatalog.modifiers.find((m) => m.id === 'JewelArmour')
  if (!ordinary) throw Error('缺少基础工艺')
  catalog.modifiers.push(ordinary)
  expect(
    prepareLiquidEmotionCraft(catalog, state, 'Metadata/Items/Currency/DistilledEmotion1', 'prefix')
      .ok,
  ).toBe(false)
})

function roundtrip(
  state: Parameters<typeof exportCraftItemText>[1],
  locale: 'en' | 'zh-CN' | 'zh-TW',
) {
  const dictionary = createCraftItemDictionary(
    realCatalog,
    locale === 'en'
      ? undefined
      : {
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
        },
  )
  const exported = exportCraftItemText(realCatalog, state, { locale, dictionary })
  if (!exported.ok) throw Error(exported.error)
  if (locale !== 'en') expect(exported.value.text).toMatch(/[\u3400-\u9fff]/)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importCraftState(
    realCatalog,
    state.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    undefined,
    undefined,
    dictionary.stats?.entries,
  )
  if (!imported.ok) throw Error(imported.error)
  return imported.value
}
it('真实五词缀无工艺珠宝三语高级文本往返保留第三条', () => {
  const state: Parameters<typeof exportCraftItemText>[1] = {
    baseId: 'Sapphire',
    rarity: 'rare',
    itemLevel: 86,
    sourceText: null,
    affixes: [],
  }
  const pool = craftCandidates(realCatalog, state)
  for (const kind of ['prefix', 'prefix', 'suffix', 'suffix', 'suffix'] as const) {
    let added = false
    for (const mod of pool.filter((entry) => entry.kind === kind)) {
      const ranges = inspectNumericLines(mod.lines)
      if (!ranges.ok) continue
      const lines = renderNumericLines(
        mod.lines,
        ranges.value.map((range) => range.min),
      )
      if (!lines.ok) continue
      const next = createCraftState(realCatalog, {
        ...state,
        affixes: [...state.affixes, { modId: mod.id, lines: lines.value }],
      })
      if (!next.ok) continue
      state.affixes = next.value.affixes
      added = true
      break
    }
    expect(added).toBe(true)
  }
  for (const locale of ['en', 'zh-CN', 'zh-TW'] as const) {
    const imported = roundtrip(state, locale)
    expect(imported.affixes).toEqual(state.affixes)
    expect(craftAffixCapacities(realCatalog, imported)).toEqual({ prefix: 2, suffix: 2 })
  }
})

it.each(['prefix', 'suffix'] as const)(
  '%s 增容后的第三条可新增，破裂后保留增容身份且不可移除',
  (kind) => {
    const opposite = kind === 'prefix' ? 'suffix' : 'prefix'
    const { catalog, state } = fixture([`${kind}1`, `${opposite}1`, `${opposite}2`])
    state.affixes.push(capacityAffix(kind))
    const locked = applyCraftStep(catalog, state, { kind: 'fracture', modId: extra[kind] })
    if (!locked.ok) throw Error(locked.error)
    expect(locked.value.affixes.find((a) => a.modId === extra[kind])).toMatchObject({
      crafted: true,
      fractured: true,
    })
    expect(
      applyCraftStep(catalog, locked.value, {
        currency: 'annulment',
        modIds: [],
        removeModId: extra[kind],
      }).ok,
    ).toBe(false)
    const full = applyCraftStep(catalog, locked.value, {
      currency: 'exalted',
      modIds: [`${opposite}3`],
      rolls: [{ modId: `${opposite}3`, values: [5] }],
    })
    expect(full.ok && full.value.affixes.length).toBe(5)
    expect(prepareLiquidEmotionCraft(catalog, locked.value, contempt, kind).ok).toBe(false)
  },
)
it('双崇高实际填满另一侧，已有第三条后缀原样保留', () => {
  const { catalog, state } = fixture(['suffix1', 'suffix2', 'suffix3'])
  const result = applyCraftStep(catalog, state, {
    currency: 'exalted',
    omen: 'greater_exaltation',
    modIds: ['prefix1', 'prefix2'],
    rolls: [
      { modId: 'prefix1', values: [5] },
      { modId: 'prefix2', values: [5] },
    ],
  })
  expect(result.ok && result.value.affixes.length).toBe(5)
  expect(result.ok && result.value.affixes.slice(0, 3)).toEqual(state.affixes)
})
it('四条同侧与增容伪属性文本不能进入已有状态', () => {
  const { catalog, state } = fixture(['prefix1', 'prefix2', 'prefix3'])
  const ordinary = catalog.modifiers.find((m) => m.id === 'prefix1')
  if (!ordinary) throw Error('缺少合成词缀')
  catalog.modifiers.push({
    ...ordinary,
    id: 'prefix4',
    group: 'prefix4',
    lines: ['prefix4 (1-10)'],
  })
  state.affixes.push({ modId: 'prefix4', lines: ['prefix4 5'] })
  expect(createCraftState(catalog, state).ok).toBe(false)
  const capacity = catalog.modifiers.find((m) => m.id === extra.prefix)
  if (!capacity) throw Error('缺少增容词缀')
  capacity.lines = ['+2 Suffix Modifier allowed']
  state.affixes = [{ modId: extra.prefix, lines: [...capacity.lines], crafted: true }]
  expect(createCraftState(catalog, state).ok).toBe(false)
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 2, suffix: 2 })
})

it.each(['prefix', 'suffix'] as const)(
  '%s 侧已有三组含增容时，总计五组禁止第六组候选与崇高',
  (kind) => {
    const opposite = kind === 'prefix' ? 'suffix' : 'prefix'
    const { catalog, state } = fixture([`${kind}1`, `${kind}2`, `${opposite}1`, `${opposite}2`])
    state.affixes.push(capacityAffix(kind))
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(craftCandidates(catalog, state)).toEqual([])
    expect(craftAffixSpace(catalog, state)).toEqual({ prefix: 0, suffix: 0, total: 0 })
    expect(prepareCraftOperation(catalog, state, 'exalted')).toMatchObject({
      ok: false,
      error: expect.stringContaining('已满'),
    })
    expect(
      evaluateCraftStrategy(
        catalog,
        state,
        {
          maxSteps: 10,
          rules: [
            {
              conditions: [{ kind: opposite === 'prefix' ? 'open-prefix' : 'open-suffix', min: 1 }],
              action: { kind: 'currency', currency: 'exalted' },
            },
            { conditions: [{ kind: 'always' }], action: { kind: 'stop' } },
          ],
        },
        0,
      ),
    ).toMatchObject({ ok: true, value: { kind: 'stop' } })
  },
)
it.each(['prefix', 'suffix'] as const)(
  '%s 侧三组含增容的四组历史，只剩一组全局空位不能双崇高',
  (kind) => {
    const opposite = kind === 'prefix' ? 'suffix' : 'prefix'
    const { catalog, state } = fixture([`${kind}1`, `${kind}2`, `${opposite}1`])
    state.affixes.push(capacityAffix(kind))
    expect(createCraftState(catalog, state).ok).toBe(true)
    expect(prepareCraftOperation(catalog, state, 'exalted').ok).toBe(true)
    expect(craftAffixCapacities(catalog, state)).toEqual({ [kind]: 2, [opposite]: 3 })
    expect(craftAffixSpace(catalog, state)).toEqual({ [kind]: 0, [opposite]: 1, total: 1 })
    for (const omen of [
      'greater_exaltation',
      opposite === 'prefix' ? 'greater_sinistral_exaltation' : 'greater_dextral_exaltation',
    ] as const)
      expect(prepareCraftOperation(catalog, state, 'exalted', undefined, omen).ok).toBe(false)
  },
)

it('空位统一保留普通/魔法/装备边界并计入待揭示亵渎占位', () => {
  const { catalog, state } = fixture()
  expect(craftAffixSpace(catalog, { ...state, rarity: 'normal' })).toEqual({
    prefix: 0,
    suffix: 0,
    total: 0,
  })
  expect(craftAffixSpace(catalog, { ...state, rarity: 'magic' })).toEqual({
    prefix: 1,
    suffix: 1,
    total: 2,
  })
  expect(craftAffixSpace(catalog, state)).toEqual({ prefix: 2, suffix: 2, total: 4 })
  const equipment = boneCatalog()
  const pending = {
    ...boneState(['prefix1', 'suffix1', 'suffix2']),
    pendingDesecration: { boneId: 'preserved_rib' as const, kind: 'suffix' as const },
  }
  expect(createCraftState(equipment, pending).ok).toBe(true)
  expect(craftAffixSpace(equipment, pending)).toEqual({ prefix: 2, suffix: 0, total: 2 })
})
