import { describe, expect, it } from 'vitest'
import type { CatalogLiquidEmotionJewel, CatalogMod, CraftCatalog } from './catalog'
import { dictionary, catalog as realCatalog } from './catalystTestFixture'
import { exportCraftItemText } from './craftItemText'
import { CRAFT_RULES_VERSION, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { inspectItem } from './export'
import { JEWEL_SOURCE } from './jewels'
import { prepareLiquidEmotionCraft } from './liquidEmotionCraft'
import {
  inspectLiquidEmotions,
  isLiquidEmotionMappedMod,
  LIQUID_EMOTION_SOURCE,
  supportedBasicLiquidEmotionId,
} from './liquidEmotions'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

const kinds = [
  ['prefix', 'prefix', 'prefix'],
  ['prefix', 'prefix', 'prefix'],
  ['prefix', 'prefix', 'prefix'],
  ['prefix', 'suffix', 'suffix'],
  ['suffix', 'prefix', 'suffix'],
  ['suffix', 'suffix', 'suffix'],
  ['suffix', 'suffix', 'suffix'],
  ['suffix', 'suffix', 'suffix'],
  ['prefix', 'prefix', 'suffix'],
  ['suffix', 'suffix', 'suffix'],
] as const
const jewels = ['Ruby', 'Sapphire', 'Emerald'] as const

function fixture(baseId: CatalogLiquidEmotionJewel = 'Sapphire') {
  const mapped: CatalogMod[] = kinds.flatMap((row, emotionIndex) =>
    row.map((kind, jewelIndex) => ({
      jewelOnly: true as const,
      id: `emotion-${emotionIndex + 1}-${jewels[jewelIndex]}`,
      kind,
      name: `emotion-${emotionIndex + 1}-${jewels[jewelIndex]}`,
      group: `emotion-group-${emotionIndex + 1}-${jewels[jewelIndex]}`,
      level: 1,
      lines:
        emotionIndex === 0 && jewelIndex === 1
          ? ['Adds (1-3) to (4-6) Cold Damage', '(7-7)% increased Cold Damage']
          : [`(${emotionIndex + 1}-${emotionIndex + 3})% increased Effect`],
      statOrder: [],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'jewel', value: 0 as const }],
      tradeHashes: {},
    })),
  )
  const ordinary = (id: string, kind: 'prefix' | 'suffix', group = id): CatalogMod => ({
    jewelOnly: true,
    id,
    kind,
    name: id,
    group,
    level: 1,
    lines: ['(1-10)% increased Damage'],
    statOrder: [],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'jewel', value: 1 }],
    tradeHashes: {},
  })
  const catalog: CraftCatalog = {
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: LIQUID_EMOTION_SOURCE.commit,
      gameVersion: null,
      generatedAt: '',
      weightStatus: 'unknown',
      sources: [JEWEL_SOURCE, LIQUID_EMOTION_SOURCE],
      excludedBases: [],
    },
    bases: jewels.map((id) => ({
      id,
      name: id,
      type: 'Jewel',
      tags: ['default', 'jewel', id.toLowerCase()],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    })),
    modifiers: [
      ...mapped,
      ordinary('prefix-1', 'prefix'),
      ordinary('prefix-2', 'prefix'),
      ordinary('suffix-1', 'suffix'),
      ordinary('suffix-2', 'suffix'),
      ordinary('fractured-prefix', 'prefix'),
    ],
    liquidEmotions: kinds.map((row, index) => ({
      id: `Metadata/Items/Currency/DistilledEmotion${index + 1}`,
      name: `Emotion ${index + 1}`,
      radiusJewel: false,
      tierLevel: 99,
      mods: {
        Ruby: { [row[0]]: `emotion-${index + 1}-Ruby` },
        Sapphire: { [row[1]]: `emotion-${index + 1}-Sapphire` },
        Emerald: { [row[2]]: `emotion-${index + 1}-Emerald` },
        Diamond: index === 9 ? { suffix: 'diamond-special' } : {},
      },
    })),
  }
  const state: CraftState = {
    baseId,
    itemLevel: 1,
    rarity: 'rare',
    affixes: [
      { modId: 'prefix-1', lines: ['5% increased Damage'] },
      { modId: 'suffix-1', lines: ['5% increased Damage'] },
    ],
    sourceText: null,
  }
  return { catalog, state }
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('fixture')
  return value
}

describe('基础液态情感声明', () => {
  it('只接受编号 1–10 的精确基础材料身份', () => {
    for (let index = 1; index <= 10; index += 1)
      expect(
        supportedBasicLiquidEmotionId(`Metadata/Items/Currency/DistilledEmotion${index}`),
      ).toBe(true)
    for (const id of [
      'Metadata/Items/Currency/DistilledEmotion0',
      'Metadata/Items/Currency/DistilledEmotion01',
      'Metadata/Items/Currency/DistilledEmotion11',
      'Metadata/Items/Currency/DistilledEmotion1Extra',
      'Metadata/Items/Currency/AncientDistilledEmotion1',
      'Metadata/Items/Currency/DistilledEmotion1Endgame',
    ])
      expect(supportedBasicLiquidEmotionId(id)).toBe(false)
  })

  it.each(jewels)('%s 只连接 10 种基础材料的单侧映射，共覆盖精确 30 组合', (baseId) => {
    const { catalog } = fixture(baseId)
    const base = catalog.bases.find((entry) => entry.id === baseId)
    if (!base) throw Error('fixture')
    const inspections = inspectLiquidEmotions(catalog, base)
    expect(inspections).toHaveLength(10)
    expect(inspections.every((entry) => entry.reason === null && entry.mod !== null)).toBe(true)
    expect(
      inspections.every(
        (entry) =>
          entry.modId === entry.emotion.mods[baseId].prefix ||
          entry.modId === entry.emotion.mods[baseId].suffix,
      ),
    ).toBe(true)
  })

  it('保留未支持材料的原因，不给钻石空映射或伪来源降级匹配', () => {
    const { catalog } = fixture('Diamond')
    const base = { ...required(catalog.bases[0]), id: 'Diamond' }
    const diamond = inspectLiquidEmotions(catalog, base)
    expect(diamond).toHaveLength(10)
    expect(diamond.every((entry) => entry.mod === null && entry.reason)).toBeTruthy()
    catalog._meta.sources = [JEWEL_SOURCE, { ...LIQUID_EMOTION_SOURCE, sha256: 'a'.repeat(64) }]
    expect(
      inspectLiquidEmotions(catalog, { ...base, id: 'Ruby' }).every((entry) => entry.mod === null),
    ).toBe(true)
  })

  it('工艺身份要求双来源、精确映射、普通 jewelOnly 对象及侧别一致', () => {
    const { catalog } = fixture()
    const base = required(catalog.bases.find((entry) => entry.id === 'Sapphire'))
    expect(isLiquidEmotionMappedMod(catalog, base, 'emotion-1-Sapphire')).toBe(true)
    const mod = required(catalog.modifiers.find((entry) => entry.id === 'emotion-1-Sapphire'))
    delete mod.jewelOnly
    expect(isLiquidEmotionMappedMod(catalog, base, mod.id)).toBe(false)
    mod.jewelOnly = true
    mod.kind = 'suffix'
    expect(isLiquidEmotionMappedMod(catalog, base, mod.id)).toBe(false)
    mod.kind = 'prefix'
    mod.desecratedOnly = true
    expect(isLiquidEmotionMappedMod(catalog, base, mod.id)).toBe(false)
  })

  it('普通生成资格不能授权任意 crafted 标记', () => {
    const { catalog, state } = fixture()
    state.affixes = [{ modId: 'prefix-1', lines: ['5% increased Damage'], crafted: true }]
    expect(createCraftState(catalog, state).ok).toBe(false)
  })

  it('液态情感 crafted 普通珠宝必须保持稀有身份', () => {
    const { catalog, state } = fixture('Ruby')
    state.rarity = 'magic'
    state.affixes = [
      { modId: 'emotion-1-Ruby', lines: ['2(1-3)% increased Effect'], crafted: true },
    ]
    expect(createCraftState(catalog, state).ok).toBe(false)
  })

  it.each(['en', 'zh-CN', 'zh-TW'] as const)('%s 稀有工艺珠宝导出后可重新导入', (locale) => {
    const state: CraftState = {
      baseId: 'Ruby',
      itemLevel: 86,
      rarity: 'rare',
      affixes: [{ modId: 'JewelArmour', lines: ['20(10-20)% increased Armour'], crafted: true }],
      sourceText: null,
    }
    const output = exportCraftItemText(realCatalog, state, { locale, dictionary })
    if (!output.ok) throw Error(output.error)
    const parsed = parseItem(output.value.text)
    if (!parsed.ok) throw Error(parsed.error)
    const imported = importCraftState(
      realCatalog,
      'Ruby',
      parsed.item,
      inspectItem(parsed.item, dictionary),
      undefined,
      undefined,
      dictionary.stats?.entries,
    )
    expect(imported).toMatchObject({
      ok: true,
      value: { rarity: 'rare', affixes: [{ modId: 'JewelArmour', crafted: true }] },
    })
  })

  it('项目起点拒绝非稀有的液态情感工艺珠宝', () => {
    const initialState: CraftState = {
      baseId: 'Ruby',
      itemLevel: 86,
      rarity: 'magic',
      affixes: [{ modId: 'JewelArmour', lines: ['20(10-20)% increased Armour'], crafted: true }],
      sourceText: null,
    }
    expect(
      parseCraftProject(
        JSON.stringify({
          schemaVersion: 1,
          rulesVersion: CRAFT_RULES_VERSION,
          sourceCommit: realCatalog._meta.sourceCommit,
          jewelSourceHash: JEWEL_SOURCE.sha256,
          liquidEmotionSourceHash: LIQUID_EMOTION_SOURCE.sha256,
          initialState,
          operations: [],
          cursor: 0,
        }),
        realCatalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })
})

describe('基础液态情感制作', () => {
  it('准备结果不使用 tierLevel 门槛，并给出删除后容量合法的非破裂候选', () => {
    const { catalog, state } = fixture()
    state.affixes = [
      { modId: 'prefix-1', lines: ['5% increased Damage'] },
      { modId: 'prefix-2', lines: ['5% increased Damage'] },
      { modId: 'suffix-1', lines: ['5% increased Damage'], fractured: true },
      { modId: 'suffix-2', lines: ['5% increased Damage'] },
    ]
    const result = prepareLiquidEmotionCraft(
      catalog,
      state,
      'Metadata/Items/Currency/DistilledEmotion1',
    )
    expect(result.ok && result.value.removableAffixes.map((affix) => affix.modId).sort()).toEqual([
      'prefix-1',
      'prefix-2',
    ])
  })

  it.each([
    ['normal', '前三种稀有度'],
    ['magic', '前三种稀有度'],
    ['crafted', '已有工艺'],
    ['conflict', '冲突'],
    ['quality', '催化剂'],
    ['level', '低物等'],
  ])('拒绝未核实状态：%s', (scenario) => {
    const { catalog, state } = fixture()
    const emotionId = 'Metadata/Items/Currency/DistilledEmotion1'
    if (scenario === 'normal' || scenario === 'magic') state.rarity = scenario
    if (scenario === 'crafted')
      state.affixes[0] = {
        modId: 'emotion-2-Sapphire',
        lines: ['(2-4)% increased Effect'],
        crafted: true,
      }
    if (scenario === 'conflict') {
      const target = required(catalog.modifiers.find((entry) => entry.id === 'emotion-1-Sapphire'))
      required(catalog.modifiers.find((entry) => entry.id === 'prefix-1')).group = target.group
    }
    if (scenario === 'quality') state.quality = 0
    if (scenario === 'level')
      required(catalog.modifiers.find((entry) => entry.id === 'emotion-1-Sapphire')).level = 2
    expect(prepareLiquidEmotionCraft(catalog, state, emotionId).ok).toBe(false)
  })

  it.each([
    ['Diamond', { id: 'Diamond' }],
    ['radius', { id: 'Radius', subType: 'Radius', tags: ['jewel', 'radius_jewel'] }],
    ['charm', { id: 'Charm', type: 'Charm', tags: ['charm'] }],
    ['unique', { rarity: 'unique' }],
  ])('钻石、范围、咒符与传奇均保持未支持：%s', (_name, patch) => {
    const { catalog, state } = fixture()
    if ('rarity' in patch) state.rarity = patch.rarity as never
    else {
      const source = required(catalog.bases.find((entry) => entry.id === 'Sapphire'))
      catalog.bases.push({ ...source, ...patch })
      state.baseId = String(patch.id)
    }
    expect(
      prepareLiquidEmotionCraft(catalog, state, 'Metadata/Items/Currency/DistilledEmotion1').ok,
    ).toBe(false)
  })

  it('严格步骤渲染两行数值、替换所选组、保留其他状态且不修改原状态', () => {
    const { catalog, state } = fixture()
    const snapshot = structuredClone(state)
    const result = applyCraftStep(catalog, state, {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'prefix-1',
      values: [2, 5, 7],
    })
    expect(result).toMatchObject({
      ok: true,
      value: {
        affixes: [
          { modId: 'suffix-1' },
          {
            modId: 'emotion-1-Sapphire',
            lines: ['Adds 2(1-3) to 5(4-6) Cold Damage', '7(7-7)% increased Cold Damage'],
            crafted: true,
          },
        ],
      },
    })
    expect(state).toEqual(snapshot)
    if (!result.ok) return
    expect(createCraftState(catalog, result.value)).toEqual(result)
  })

  it.each([
    {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'prefix-1',
      values: [2, 5, 7],
      modId: 'injected',
    },
    {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'prefix-1',
      values: [2, 5, 7],
      omen: 'whittling',
    },
    {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'missing',
      values: [2, 5, 7],
    },
    {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'prefix-1',
      values: [2, Number.NaN, 7],
    },
  ])('拒绝伪造或非法步骤且保持输入不变：%j', (step) => {
    const { catalog, state } = fixture()
    const snapshot = structuredClone(state)
    expect(applyCraftStep(catalog, state, step as never).ok).toBe(false)
    expect(state).toEqual(snapshot)
  })

  it('普通后续重掷和移除会按既有操作语义保留或删除 crafted 身份', () => {
    const { catalog, state } = fixture()
    const crafted = applyCraftStep(catalog, state, {
      kind: 'liquid-emotion',
      emotionId: 'Metadata/Items/Currency/DistilledEmotion1',
      removeModId: 'prefix-1',
      values: [2, 5, 7],
    })
    if (!crafted.ok) throw Error(crafted.error)
    const divine = applyCraftStep(catalog, crafted.value, {
      currency: 'divine',
      modIds: [],
      rolls: [
        { modId: 'emotion-1-Sapphire', values: [3, 6, 7] },
        { modId: 'suffix-1', values: [6] },
      ],
    })
    expect(divine.ok && divine.value.affixes.find((affix) => affix.crafted)?.crafted).toBe(true)
    const removed = applyCraftStep(catalog, crafted.value, {
      currency: 'annulment',
      modIds: [],
      removeModId: 'emotion-1-Sapphire',
    })
    expect(removed.ok && removed.value.affixes.some((affix) => affix.crafted)).toBe(false)
  })
})
