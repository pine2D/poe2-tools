import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { craftAffixCapacities, craftAffixSpace } from './affixCapacity'
import type { CraftCatalog } from './catalog'
import { parseCraftCatalog } from './catalogFormat'
import { collectCraftCosts } from './craftCosts'
import { createCraftItemDictionary } from './craftDictionary'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep, type CraftStep } from './craftSteps'
import { inspectItem } from './export'
import { estimateJewelRadius } from './jewelRadius'
import { JEWEL_SOURCE } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import { inspectLiquidEmotions, LIQUID_EMOTION_SOURCE } from './liquidEmotions'
import { parseItem } from './parse'
import { type CraftState, craftCandidates, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { planCraftTargetRoutes } from './targetRoutes'
import { craftTargetCandidates } from './targets'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const emotion = (n: number, potent = false) =>
  `Metadata/Items/Currency/${potent ? 'Endgame' : ''}DistilledEmotionTimeLost${n}`
const extraLarge = 'CraftedJewelRadiusExtraLargeSize'
const suffixCapacity = 'CraftedJewelAdditionalPrefixAllowed'
const initial: CraftState = {
  baseId: 'Time-Lost Sapphire',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    {
      modId: 'JewelRadiusSmallNodeEffect',
      lines: ['20% increased Effect of Small Passive Skills in Radius'],
    },
  ],
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试数据')
  return value
}
function apply(state: CraftState, step: CraftStep) {
  const result = applyCraftStep(catalog, state, step)
  if (!result.ok) throw Error(result.error)
  return result.value
}
function craft(
  state: CraftState,
  emotionId: string,
  values: number[] = [],
  resultKind?: 'prefix' | 'suffix',
) {
  return apply(state, {
    kind: 'liquid-emotion',
    emotionId,
    removeModId: required(state.affixes[0]).modId,
    values,
    ...(resultKind ? { resultKind } : {}),
  })
}

it.each([
  ['Time-Lost Ruby', 13, 14],
  ['Time-Lost Sapphire', 13, 14],
  ['Time-Lost Emerald', 13, 14],
  ['Time-Lost Diamond', 3, 4],
] as const)('%s 精确匹配全部远古材料，拒绝普通材料与空类别', (baseId, count, outcomes) => {
  const base = required(catalog.bases.find((b) => b.id === baseId))
  const entries = inspectLiquidEmotions(catalog, base).filter((e) => e.reason === null)
  expect(entries).toHaveLength(count)
  expect(entries.flatMap((e) => e.outcomes)).toHaveLength(outcomes)
  expect(entries.every((e) => e.emotion.radiusJewel)).toBe(true)
  expect(() => parseCraftCatalog(catalog)).not.toThrow()
})

it.each([
  [1, false, 'JewelRadiusEnergyShield', [3]],
  [2, false, 'JewelRadiusColdDamage', [2]],
  [3, false, 'JewelRadiusChaosDamage', [2]],
  [4, false, 'JewelRadiusCastSpeed', [2]],
  [5, false, 'JewelRadiusSpellDamage', [2]],
  [6, false, 'JewelRadiusManaonKill', []],
  [7, false, 'JewelRadiusSpellCriticalChance', [7]],
  [8, false, 'JewelRadiusSpellCriticalDamage', [10]],
  [9, false, 'JewelRadiusAreaofEffect', [3]],
  [10, false, 'JewelRadiusIncLightningFireToCold', []],
  [1, true, extraLarge, []],
  [2, true, 'CraftedJewelRadiusColdResistance', [7]],
] as const)('蓝玉远古材料 %s / %s 替换并保留正确工艺身份', (n, potent, modId, values) => {
  const state = craft(initial, emotion(n, potent), [...values])
  expect(state.affixes).toMatchObject([{ modId, crafted: true }])
  expect(state.affixes).toHaveLength(1)
  expect(createCraftState(catalog, state).ok).toBe(true)
  expect(prepareLiquidEmotionCraft(catalog, state, emotion(1)).ok).toBe(false)
  expect(craftCandidates(catalog, { ...initial, affixes: [] }).some((m) => m.craftedOnly)).toBe(
    false,
  )
})

it('超大半径随工艺移除回到小；不允许去掉工艺身份或与已有半径并存', () => {
  const state = craft(initial, emotion(1, true))
  expect(estimateJewelRadius(catalog, state)).toEqual({ ok: true, value: 'Very Large' })
  expect(
    estimateJewelRadius(
      catalog,
      apply(state, { currency: 'annulment', modIds: [], removeModId: extraLarge }),
    ),
  ).toEqual({ ok: true, value: 'Small' })
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [{ modId: extraLarge, lines: ['Upgrades Radius to Very Large'] }],
    }).ok,
  ).toBe(false)
  expect(
    createCraftState(catalog, {
      ...state,
      affixes: [
        ...state.affixes,
        { modId: 'JewelRadiusLargeSize', lines: ['Upgrades Radius to Large'] },
      ],
    }).ok,
  ).toBe(false)
})

it('增容只开放反侧第三条，移除工艺后保留已有三前缀但不能继续添加前缀', () => {
  let state = craft(initial, emotion(3, true), [], 'suffix')
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 3, suffix: 2 })
  for (const [modId, values] of [
    ['JewelRadiusLargeSize', []],
    ['JewelRadiusSpellDamage', [2]],
    ['JewelRadiusEnergyShield', [3]],
  ] as const)
    state = apply(state, {
      currency: 'exalted',
      modIds: [modId],
      ...(values.length ? { rolls: [{ modId, values: [...values] }] } : {}),
    })
  state = apply(state, { currency: 'annulment', modIds: [], removeModId: suffixCapacity })
  expect(state.affixes).toHaveLength(3)
  expect(craftAffixCapacities(catalog, state)).toEqual({ prefix: 2, suffix: 2 })
  expect(craftAffixSpace(catalog, state)).toEqual({ prefix: 0, suffix: 2, total: 2 })
  expect(craftCandidates(catalog, state).every((m) => m.kind === 'suffix')).toBe(true)
  expect(
    createCraftState(
      {
        ...catalog,
        _meta: {
          ...catalog._meta,
          sources: catalog._meta.sources.filter((s) => s.path !== LIQUID_EMOTION_SOURCE.path),
        },
      },
      state,
    ).ok,
  ).toBe(false)
})

it('范围材料与词缀域、双侧完整映射及来源指纹不可互换', () => {
  const base = required(catalog.bases.find((b) => b.id === initial.baseId))
  for (const mutate of [
    (c: CraftCatalog) => {
      required(c.liquidEmotions?.find((e) => e.id === emotion(1))).radiusJewel = false
    },
    (c: CraftCatalog) => {
      delete required(c.modifiers.find((m) => m.id === 'JewelRadiusEnergyShield')).radiusJewelOnly
    },
    (c: CraftCatalog) => {
      delete required(c.liquidEmotions?.find((e) => e.id === emotion(3, true))).mods.Sapphire.suffix
    },
    (c: CraftCatalog) => {
      c._meta.sources = c._meta.sources.filter((s) => s.path !== LIQUID_EMOTION_SOURCE.path)
    },
  ]) {
    const changed = structuredClone(catalog)
    mutate(changed)
    expect(inspectLiquidEmotions(changed, base).filter((e) => e.reason === null)).not.toHaveLength(
      13,
    )
  }
  const fractured = {
    ...initial,
    affixes: initial.affixes.map((a) => ({ ...a, fractured: true as const })),
  }
  expect(prepareLiquidEmotionCraft(catalog, fractured, emotion(1)).ok).toBe(false)
  expect(prepareLiquidEmotionCraft(catalog, initial, emotion(3, true)).ok).toBe(false)
})

it.each(['en', 'zh-CN', 'zh-TW'] as const)(
  '%s 超大半径、范围抗性和转换工艺可导出重新导入',
  (locale) => {
    const dictionary = createCraftItemDictionary(catalog, {
      items: JSON.parse(
        readFileSync(`data/dict/${locale === 'en' ? 'zh-CN' : locale}/items.json`, 'utf8'),
      ),
      stats: JSON.parse(
        readFileSync(`data/dict/${locale === 'en' ? 'zh-CN' : locale}/stats.json`, 'utf8'),
      ),
    })
    for (const [id, values] of [
      [emotion(1, true), []],
      [emotion(2, true), [7]],
      [emotion(10), []],
    ] as const) {
      const state = craft(initial, id, [...values])
      const text = exportCraftItemText(catalog, state, { locale, dictionary })
      if (!text.ok) throw Error(text.error)
      const parsed = parseItem(text.value.text)
      if (!parsed.ok) throw Error(parsed.error)
      const restored = importCraftState(
        catalog,
        state.baseId,
        parsed.item,
        inspectItem(parsed.item, dictionary),
        undefined,
        undefined,
        dictionary.stats?.entries,
      )
      expect(restored, text.value.text).toMatchObject({
        ok: true,
        value: { affixes: state.affixes },
      })
    }
  },
)

it('专属目标能生成可重放的远古制作路线并记录材料费用', () => {
  expect(craftTargetCandidates(catalog, initial.baseId).some((m) => m.id === extraLarge)).toBe(true)
  const routes = planCraftTargetRoutes(catalog, initial, [extraLarge], [], [], {
    maxDepth: 2,
    maxStates: 16,
  })
  if (!routes.ok) throw Error(routes.error)
  const route = required(routes.value.routes[0])
  const state = route.steps.reduce((s, step) => apply(s, step.operation), initial)
  expect(state.affixes.some((a) => a.modId === extraLarge && a.crafted)).toBe(true)
  expect(
    collectCraftCosts(
      catalog,
      route.steps.map((s) => s.operation),
    ),
  ).toMatchObject({ ok: true, value: [{ id: `emotion:${emotion(1, true)}`, count: 1 }] })
})

it('新项目重放所有历史并绑定材料来源，旧 v67 不能含远古步骤、目标、指引或工艺起点', () => {
  const dictionary = createCraftItemDictionary(catalog)
  const source = exportCraftItemText(catalog, initial)
  if (!source.ok) throw Error(source.error)
  const imported = { ...initial, sourceText: source.value.text }
  const step: CraftStep = {
    kind: 'liquid-emotion',
    emotionId: emotion(1, true),
    removeModId: 'JewelRadiusSmallNodeEffect',
    values: [],
  }
  const project = {
    schemaVersion: 1,
    rulesVersion: CRAFT_RULES_VERSION,
    sourceCommit: catalog._meta.sourceCommit,
    jewelSourceHash: JEWEL_SOURCE.sha256,
    liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
    initialState: imported,
    operations: [step],
    cursor: 1,
  }
  const restore = (p: unknown) => parseCraftProject(JSON.stringify(p), catalog, dictionary)
  for (const cursor of [0, 1]) expect(restore({ ...project, cursor }).ok).toBe(true)
  expect(restore({ ...project, liquidEmotionSourceHash: undefined }).ok).toBe(false)
  const old = { ...project, rulesVersion: 'basic-2026-09-12-v67' }
  expect(
    restore({
      ...old,
      operations: [],
      cursor: 0,
      minimumTargetCount: 2,
      targetModIds: ['JewelRadiusLargeSize', 'JewelRadiusSpellDamage', 'JewelRadiusEnergyShield'],
    }).ok,
  ).toBe(true)
  expect(
    restore({
      ...old,
      operations: [],
      cursor: 0,
      targetModIds: ['JewelRadiusLargeSize', 'JewelRadiusSpellDamage', 'JewelRadiusEnergyShield'],
    }).ok,
  ).toBe(false)
  expect(restore({ ...old, cursor: 0 }).ok).toBe(false)
  expect(restore({ ...old, operations: [], cursor: 0, targetModIds: [extraLarge] }).ok).toBe(false)
  expect(
    restore({
      ...old,
      operations: [],
      cursor: 0,
      strategy: {
        maxSteps: 5,
        rules: [
          {
            conditions: [{ kind: 'always' }],
            action: { kind: 'liquid-emotion', emotionId: emotion(1, true) },
          },
        ],
      },
    }).ok,
  ).toBe(false)
  const crafted = craft(initial, emotion(1, true))
  const exported = exportCraftItemText(catalog, crafted)
  if (!exported.ok) throw Error(exported.error)
  expect(
    restore({
      ...old,
      operations: [],
      cursor: 0,
      initialState: { ...crafted, sourceText: exported.value.text },
    }).ok,
  ).toBe(false)
  expect(
    restore({ ...old, operations: [], cursor: 0, liquidEmotionSourceHash: undefined }).ok,
  ).toBe(true)
})
