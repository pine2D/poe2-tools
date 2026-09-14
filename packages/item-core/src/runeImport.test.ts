import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { compareCraftStates } from './comparison'
import { CRAFT_RULES_VERSION, type CraftProject, parseCraftProject } from './craftProject'
import { applyCraftStep } from './craftSteps'
import { type InspectedRune, type ItemDictionary, type ItemInspection, inspectItem } from './export'
import { parseItem } from './parse'
import { type CraftState, createCraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'
import { socketEffects } from './sockets'
import type { ItemDocument } from './types'

const hash = 'a'.repeat(64)
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [{ path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: hash }],
  },
  bases: [
    {
      id: 'Test Helmet',
      name: 'Test Helmet',
      type: 'Helmet',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'fire-affix',
      name: 'Test',
      kind: 'suffix',
      group: 'fire',
      level: 1,
      lines: ['+10% to Fire Resistance'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
  augments: ['Fire', 'Cold', 'Lightning'].map((element, index) => ({
    id: element,
    name: ['Lesser Desert Rune', 'Lesser Glacial Rune', 'Lesser Storm Rune'][index] ?? '',
    category: 'armour',
    type: 'Rune',
    localMod: false,
    lines: [`+10% to ${element} Resistance`],
    statOrder: [1],
    tradeHashes: {},
    levelReq: 0,
  })),
}
const dictionary: ItemDictionary = {
  items: { bases: { 'Test Helmet': '测试头盔' }, uniques: {} },
  stats: {
    entries: [
      { id: 'fire', en: '+#% to Fire Resistance', text: '+#% 火焰抗性' },
      { id: 'cold', en: '+#% to Cold Resistance', text: '+#% 冰冷抗性' },
    ],
  },
}
const baseText = 'Item Class: Helmets\nRarity: Normal\nTest Helmet\n--------\nItem Level: 46'

// 独立构造来源区块，让导入门禁的失败不依赖解析器是否先支持新语法。
function fixture(effects = ['+10% to Fire Resistance'], english = effects) {
  const parsed = parseItem(baseText)
  if (!parsed.ok) throw new Error(parsed.error)
  const sources = effects.map((effect, index) => ({ raw: `${effect} (rune)`, line: 7 + index }))
  const item: ItemDocument = {
    ...parsed.item,
    rawText: `${baseText}\n--------\n${sources.map((source) => source.raw).join('\n')}`,
    blocks: [...parsed.item.blocks, { kind: 'runes', lines: sources }],
  }
  const inspection: ItemInspection = {
    ...inspectItem(parsed.item, dictionary),
    runes: sources.map((source, index) => ({
      source,
      resolution: { english: english[index] ?? null, candidates: [] },
    })),
  }
  return { item, inspection }
}
function firstRune(inspection: ItemInspection): InspectedRune {
  const rune = inspection.runes[0]
  if (!rune) throw new Error('测试符文缺失')
  return rune
}
function run(effects = ['+10% to Fire Resistance'], sockets: (string | null)[] = ['Fire']) {
  const { item, inspection } = fixture(effects)
  return importCraftState(catalog, 'Test Helmet', item, inspection, sockets)
}
function initial(): CraftState {
  const result = run()
  if (!result.ok) throw new Error(result.error)
  return result.value
}
function project(): CraftProject {
  return {
    schemaVersion: 1,
    sourceCommit: 'test',
    rulesVersion: CRAFT_RULES_VERSION,
    initialState: initial(),
    importedSockets: ['Fire'],
    augmentSourceHash: hash,
    operations: [{ kind: 'socket', socketIndex: 0, augmentId: 'Cold' }],
    cursor: 0,
  }
}

describe('符文原文与声明贡献核对', () => {
  it.each([
    [
      ['+10% to Fire Resistance', '+10% to Fire Resistance'],
      ['Fire', 'Fire'],
    ],
    [['+20% to Fire Resistance'], ['Fire', 'Fire']],
    [
      ['+10% to Cold Resistance', '+10% to Lightning Resistance'],
      ['Cold', 'Lightning'],
    ],
  ])('按三系聚合原文并保存确认英文，不生成额外词缀', (effects, sockets) => {
    expect(run(effects, sockets)).toMatchObject({
      ok: true,
      value: { affixes: [], sockets, runeSourceLines: effects },
    })
  })
  it.each(
    [
      ['+10% to Cold Resistance'],
      ['+9% to Fire Resistance'],
      ['+10% to Chaos Resistance'],
      ['+10.5% to Fire Resistance'],
      ['-10% to Fire Resistance'],
      ['+0% to Fire Resistance'],
      ['+10(10-20)% to Fire Resistance'],
      ['+10% to Fire Resistance — Unscalable Value'],
      ['+9007199254740992% to Fire Resistance'],
      ['+10% to Fire Resistance', '+10 to maximum Life'],
    ].map((effects) => ({ effects })),
  )('拒绝错系、未知、非正整数和额外效果 $effects', ({ effects }) => {
    expect(run(effects, ['Fire']).ok).toBe(false)
  })
  it('原文有符文不能选空、少选或跳过 inspection', () => {
    const { item, inspection } = fixture()
    expect(run(undefined, [null]).ok).toBe(false)
    expect(run(undefined, []).ok).toBe(false)
    expect(importCraftState(catalog, 'Test Helmet', item, inspection).ok).toBe(false)
    const { runes: _runes, ...missing } = inspection
    expect(importCraftState(catalog, 'Test Helmet', item, missing, ['Fire']).ok).toBe(false)
  })
  it('检查完整原文和行号，不接受移位、遗漏或多出的 inspection', () => {
    for (const patch of [{ raw: '+99% to Fire Resistance (rune)' }, { line: 8 }]) {
      const { item, inspection } = fixture()
      firstRune(inspection).source = { ...firstRune(inspection).source, ...patch }
      expect(importCraftState(catalog, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(false)
    }
    const { item, inspection } = fixture()
    inspection.runes.push(firstRune(inspection))
    expect(importCraftState(catalog, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(false)
  })
  it('中文必须有明确译法，英文未知可精确核对，歧义不能借英文原文绕过', () => {
    const { item, inspection } = fixture(['+10% 火焰抗性'], ['+10% to Fire Resistance'])
    expect(importCraftState(catalog, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(true)
    firstRune(inspection).resolution.english = null
    expect(importCraftState(catalog, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(false)
    const en = fixture()
    firstRune(en.inspection).resolution.english = null
    expect(importCraftState(catalog, 'Test Helmet', en.item, en.inspection, ['Fire']).ok).toBe(true)
    firstRune(en.inspection).resolution.candidates.push({
      id: 'fire',
      english: '+10% to Fire Resistance',
    })
    expect(importCraftState(catalog, 'Test Helmet', en.item, en.inspection, ['Fire']).ok).toBe(
      false,
    )
    firstRune(en.inspection).resolution.english = '+10% to Cold Resistance'
    expect(importCraftState(catalog, 'Test Helmet', en.item, en.inspection, ['Cold']).ok).toBe(
      false,
    )
  })
  it('核对使用目录各档实值，已有身份与来源门禁不能被效果相同绕过', () => {
    for (const tier of ['Lesser ', '', 'Greater ', 'Perfect ']) {
      for (const [index, name] of ['Desert Rune', 'Glacial Rune', 'Storm Rune'].entries()) {
        const source = structuredClone(catalog)
        const augment = source.augments?.[index]
        if (!augment) throw new Error('测试符文缺失')
        augment.name = tier + name
        const { item, inspection } = fixture(augment.lines)
        expect(importCraftState(source, 'Test Helmet', item, inspection, [augment.id]).ok).toBe(
          true,
        )
        augment.lines.push('+10 to maximum Life')
        expect(importCraftState(source, 'Test Helmet', item, inspection, [augment.id]).ok).toBe(
          false,
        )
      }
    }
    const { item, inspection } = fixture()
    for (const patch of [
      { name: 'Unknown Rune' },
      { category: 'weapon' },
      { isSocketBound: true },
      { limit: 1 },
    ]) {
      const source = structuredClone(catalog)
      Object.assign(source.augments?.[0] ?? {}, patch)
      expect(importCraftState(source, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(false)
    }
    const source = structuredClone(catalog)
    source._meta.sources = []
    expect(importCraftState(source, 'Test Helmet', item, inspection, ['Fire']).ok).toBe(false)
  })
  it('普通同抗性后缀不参与符文合计', () => {
    const text = `${fixture().item.rawText.replace('Rarity: Normal', 'Rarity: Rare').replace('Test Helmet\n', 'Test Rare\nTest Helmet\n')}\n--------\n{ Suffix Modifier "Test" (Tier: 1) }\n+10% to Fire Resistance`
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const result = importCraftState(
      catalog,
      'Test Helmet',
      parsed.item,
      inspectItem(parsed.item, dictionary),
      ['Fire'],
    )
    expect(result).toMatchObject({
      ok: true,
      value: { affixes: [{ modId: 'fire-affix' }], runeSourceLines: ['+10% to Fire Resistance'] },
    })
  })
})

describe('符文来源与当前效果独立', () => {
  it('深拷贝来源数组，替换符文与普通通货保留起点，当前效果只看孔位', () => {
    const state = initial()
    const copied = createCraftState(catalog, state)
    expect(copied.ok).toBe(true)
    if (!copied.ok) return
    expect(copied.value.runeSourceLines).not.toBe(state.runeSourceLines)
    const changed = applyCraftStep(catalog, state, {
      kind: 'socket',
      socketIndex: 0,
      augmentId: 'Cold',
    })
    expect(changed).toMatchObject({
      ok: true,
      value: { runeSourceLines: ['+10% to Fire Resistance'], sockets: ['Cold'] },
    })
    if (!changed.ok) return
    expect(socketEffects(catalog, changed.value).flatMap(({ augment }) => augment.lines)).toEqual([
      '+10% to Cold Resistance',
    ])
    expect(
      applyCraftStep(catalog, changed.value, { currency: 'transmutation', modIds: ['fire-affix'] }),
    ).toMatchObject({ ok: true, value: { runeSourceLines: ['+10% to Fire Resistance'] } })
  })
  it('来源字段不能脱离原文、孔位或对应的独立符文行', () => {
    const state = initial()
    for (const patch of [
      { sourceText: null },
      { sourceText: baseText },
      { sockets: undefined },
      { runeSourceLines: [] },
      { runeSourceLines: ['unknown'] },
      { runeSourceLines: [10] },
      { runeSourceLines: ['+10% to Fire Resistance', '+10% to Cold Resistance'] },
    ])
      expect(createCraftState(catalog, { ...state, ...patch } as CraftState).ok).toBe(false)
  })
  it('比较不能冒换、删除或改写符文来源', () => {
    const state = initial()
    expect(
      compareCraftStates(catalog, state, { ...state, runeSourceLines: ['+10% to Cold Resistance'] })
        .ok,
    ).toBe(false)
    const { runeSourceLines: _source, ...without } = state
    expect(compareCraftStates(catalog, state, without).ok).toBe(false)
  })
})

describe('v8 项目重验符文来源', () => {
  it('v9组合恢复三抗来源、导入孔位与严格品质声明', () => {
    const p = project()
    const input = {
      ...p,
      rulesVersion: 'basic-2026-09-12-v9',
      initialState: { ...p.initialState, quality: 20 },
      importedQuality: 20,
    }
    const result = parseCraftProject(JSON.stringify(input), catalog, dictionary)
    expect(result).toMatchObject({
      ok: true,
      value: {
        project: {
          rulesVersion: CRAFT_RULES_VERSION,
          importedSockets: ['Fire'],
          importedQuality: 20,
          initialState: { runeSourceLines: ['+10% to Fire Resistance'], quality: 20 },
        },
      },
    })
    expect(
      parseCraftProject(
        JSON.stringify({ ...input, initialState: { ...input.initialState, quality: 19 } }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })

  it('往返恢复并回放撤销游标后的符文替换', () => {
    const p = project()
    const result = parseCraftProject(JSON.stringify(p), catalog, dictionary)
    expect(CRAFT_RULES_VERSION).toBe('basic-2026-09-12-v68')
    expect(result).toMatchObject({
      ok: true,
      value: {
        project: p,
        states: [
          { sockets: ['Fire'], runeSourceLines: ['+10% to Fire Resistance'] },
          { sockets: ['Cold'], runeSourceLines: ['+10% to Fire Resistance'] },
        ],
      },
    })
  })
  it('中文人工消歧仅从仍存在候选恢复，词典候选消失即拒绝', () => {
    const dict: ItemDictionary = {
      ...dictionary,
      stats: {
        entries: [
          { id: 'fire', en: '+#% to Fire Resistance', text: '+#% 元素抗性' },
          { id: 'cold', en: '+#% to Cold Resistance', text: '+#% 元素抗性' },
        ],
      },
    }
    const p = project()
    p.initialState.sourceText = fixture(['+10% 元素抗性'])
      .item.rawText.replace('Item Class: Helmets', '物品类别: 头盔')
      .replace('Rarity: Normal', '稀有度: 普通')
      .replace('Test Helmet', '测试头盔')
      .replace('Item Level', '物品等级')
    expect(parseCraftProject(JSON.stringify(p), catalog, dict).ok).toBe(true)
    expect(parseCraftProject(JSON.stringify(p), catalog, dictionary).ok).toBe(false)
  })
  it('拒绝伪造来源英文、孔位声明和缺失来源字段', () => {
    const p = project()
    for (const patch of [
      { runeSourceLines: ['+11% to Fire Resistance'] },
      { runeSourceLines: undefined },
      { sourceText: baseText },
      { sourceText: null },
      { sockets: ['Cold'] },
    ])
      expect(
        parseCraftProject(
          JSON.stringify({ ...p, initialState: { ...p.initialState, ...patch } }),
          catalog,
          dictionary,
        ).ok,
      ).toBe(false)
    expect(
      parseCraftProject(JSON.stringify({ ...p, importedSockets: ['Cold'] }), catalog, dictionary)
        .ok,
    ).toBe(false)
  })
  it.each([2, 3, 4, 5, 6, 7])('v%s 不能夹带新符文来源字段', (version) => {
    expect(
      parseCraftProject(
        JSON.stringify({ ...project(), rulesVersion: `basic-2026-09-12-v${version}` }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(false)
  })
  it('合法 v7 无符文原文项目继续允许已有孔位声明', () => {
    const p = project()
    const { runeSourceLines: _source, ...state } = p.initialState
    expect(
      parseCraftProject(
        JSON.stringify({
          ...p,
          rulesVersion: 'basic-2026-09-12-v7',
          initialState: { ...state, sourceText: baseText },
        }),
        catalog,
        dictionary,
      ).ok,
    ).toBe(true)
  })
})

it('定向预兆通货保留符文来源和当前孔位', () => {
  const state = { ...initial(), rarity: 'rare' as const }
  const result = applyCraftStep(catalog, state, {
    currency: 'exalted',
    modIds: ['fire-affix'],
    omen: 'dextral_exaltation',
  })
  expect(result).toMatchObject({
    ok: true,
    value: { runeSourceLines: state.runeSourceLines, sockets: state.sockets },
  })
  expect(state.affixes).toEqual([])
})
