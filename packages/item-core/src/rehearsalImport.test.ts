import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { matchCatalogMods } from './catalogMatch'
import { inspectItem } from './export'
import { parseItem } from './parse'
import { importCraftState } from './rehearsalImport'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'test',
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Test Focus',
      name: 'Test Focus',
      type: 'Focus',
      tags: ['focus', 'default'],
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
      id: 'mana',
      kind: 'suffix',
      name: 'Test',
      group: 'mana',
      level: 1,
      lines: ['+(35-54) to maximum Mana'],
      statOrder: [1],
      tags: ['mana'],
      addsTags: [],
      eligibility: [
        { tag: 'focus', value: 1 },
        { tag: 'default', value: 0 },
      ],
      tradeHashes: {},
    },
  ],
}
const raw =
  '物品类别: 法器\n稀有度: 稀有\n测试 圣曲\n测试法器\n--------\n物品等级: 46\n--------\n{ 后缀属性 "测试之" (等阶：8) — 魔力 }\n+47(35-54) 魔力上限'
function run(text = raw, selectedId = 'Test Focus') {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {
    items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
    stats: { entries: [{ id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' }] },
  })
  return importCraftState(catalog, selectedId, parsed.item, inspection)
}

describe('导入当前装备进入通货演练', () => {
  it('自动读取原文品质，并允许声明补充缺失品质', () => {
    expect(run(raw.replace('物品等级: 46', '品质: +20%\n--------\n物品等级: 46'))).toMatchObject({
      ok: true,
      value: { quality: 20 },
    })
    const parsed = parseItem(raw)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, {
      items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
      stats: { entries: [{ id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' }] },
    })
    expect(
      importCraftState(catalog, 'Test Focus', parsed.item, inspection, undefined, 25),
    ).toMatchObject({ ok: true, value: { quality: 25 } })
  })

  it('拒绝原文品质与声明冲突及非法声明', () => {
    const text = raw.replace('物品等级: 46', '品质: +20%\n--------\n物品等级: 46')
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, {
      items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
      stats: { entries: [{ id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' }] },
    })
    expect(importCraftState(catalog, 'Test Focus', parsed.item, inspection, undefined, 21).ok).toBe(
      false,
    )
    expect(importCraftState(catalog, 'Test Focus', parsed.item, inspection, undefined, 31).ok).toBe(
      false,
    )
  })
  it('S 标记不能证明孔为空，未核对的孔内状态不得丢弃后进入制作', () => {
    const result = run(`${raw}\n--------\n插槽: S`)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('孔') })
  })
  it('保存已识别的完整固有英文实值，不能丢弃后再按目录重建', () => {
    const source = structuredClone(catalog)
    if (!source.bases[0]) throw new Error('测试数据缺失')
    source.bases[0].implicit = '+(10-20) to maximum Life'
    const text =
      'Item Class: Foci\nRarity: Normal\nTest Focus\n--------\nItem Level: 46\n--------\n{ Implicit Modifier }\n+14(10-20) to maximum Life'
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const result = importCraftState(
      source,
      'Test Focus',
      parsed.item,
      inspectItem(parsed.item, { items: { bases: { 'Test Focus': '测试法器' }, uniques: {} } }),
    )
    expect(result).toMatchObject({
      ok: true,
      value: { implicitLines: ['+14(10-20) to maximum Life'], sourceText: text },
    })
  })
  it('保存实际数值与完整源文本，显式词缀按组对应', () => {
    const result = run()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      baseId: 'Test Focus',
      itemLevel: 46,
      rarity: 'rare',
      affixes: [{ modId: 'mana', lines: ['+47(35-54) to maximum Mana'] }],
      sourceText: raw,
    })
  })
  it.each([
    raw.replace('稀有度: 稀有', '稀有度: 传奇'),
    raw.replace('物品类别: 法器', '物品类别: 咒符'),
    `${raw}\n--------\n被腐化`,
    `${raw}\n--------\n镜像`,
    `${raw}\n--------\n未鉴定`,
    `${raw}\n--------\n未知特殊效果`,
    raw.replace('后缀属性', '破裂后缀属性'),
    raw.replace('魔力上限', '未知属性'),
  ])('只读或未知状态不得变成可制作普通装备', (text) => {
    expect(run(text).ok).toBe(false)
  })
  it('不能把当前装备导入到另一基底，不能静默丢弃未对应固有属性', () => {
    expect(run(raw, 'Other Focus').ok).toBe(false)
    expect(run(`${raw}\n--------\n{ 基底属性 }\n+10 最大未知属性`).ok).toBe(false)
  })
  it('相同词缀内容多个 ID 时不默认取第一项', () => {
    const duplicate = structuredClone(catalog.modifiers[0])
    if (!duplicate) throw new Error('测试数据缺失')
    duplicate.id = 'other-mana'
    catalog.modifiers.push(duplicate)
    try {
      expect(run().ok).toBe(false)
    } finally {
      catalog.modifiers.pop()
    }
  })
})

it.each(['crafted', 'fractured', 'desecrated'])(
  '目录可对应 %s，但删除 metadata 后仍拒绝演练',
  (state) => {
    const parsed = parseItem(`${raw} (${state})`)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, {
      items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
      stats: { entries: [{ id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' }] },
    })
    const base = catalog.bases[0]
    if (!base) throw new Error('缺少测试基底')
    expect(matchCatalogMods(base, catalog.modifiers, inspection.mods)[0]?.status).toBe('matched')
    delete parsed.item.mods[0]?.states
    delete parsed.item.mods[0]?.stats[0]?.states
    expect(importCraftState(catalog, 'Test Focus', parsed.item, inspection)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/特殊词缀.*(?:尚未开放|不一致)/),
    })
    const stat = parsed.item.mods[0]?.stats[0]
    if (!stat) throw new Error('缺少测试属性行')
    stat.raw = '+47(35-54) 魔力上限'
    expect(importCraftState(catalog, 'Test Focus', parsed.item, inspection).ok).toBe(false)
  },
)

it.each([
  `${raw}\n--------\nFractured Item`,
  raw.replace('后缀属性', 'Crafted Suffix Modifier'),
  raw.replace('后缀属性', 'Fractured Suffix Modifier'),
  raw.replace('后缀属性', 'Desecrated Suffix Modifier'),
])('物品旗标及标题来源不能靠删除派生字段绕过', (text) => {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  delete parsed.item.fractured
  delete parsed.item.mods[0]?.states
  const inspection = inspectItem(parsed.item, {
    items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
    stats: { entries: [{ id: 'mana', en: '+# to maximum Mana', text: '+# 魔力上限' }] },
  })
  expect(importCraftState(catalog, 'Test Focus', parsed.item, inspection)).toMatchObject({
    ok: false,
    error: expect.stringMatching(/特殊词缀.*(?:尚未开放|不一致)/),
  })
  expect(inspection.bridgeReasons.join()).toMatch(/特殊词缀/)
})

it('目录身份匹配不吞掉未知尾注', () => {
  const parsed = parseItem(`${raw} (foo) (crafted)`)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, { stats: { entries: [] } })
  const base = catalog.bases[0]
  if (!base) throw new Error('缺少测试基底')
  expect(matchCatalogMods(base, catalog.modifiers, inspection.mods)[0]?.status).toBe('untranslated')
})

it('备注中的状态同名词不伪装为词缀来源', () => {
  expect(run(`${raw}\n--------\nNote: test (crafted)`)).toMatchObject({ ok: true })
})

it('引号内词缀名不推断特殊来源，但未知中文标题仍拒绝', () => {
  expect(run(raw.replace('"测试之"', '"Crafted Essence"'))).toMatchObject({ ok: true })
  expect(run(raw.replace('后缀属性', '工艺后缀属性')).ok).toBe(false)
})
