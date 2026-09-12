import { describe, expect, it } from 'vitest'
import type { CraftCatalog } from './catalog'
import { exportCraftItemText } from './craftItemText'
import { type ItemDictionary, inspectItem, knownExplicitHeader } from './export'
import { parseItem } from './parse'
import type { CraftState } from './rehearsal'
import { importCraftState } from './rehearsalImport'

it.each(['zh-CN', 'zh-TW'] as const)(
  '三语出口 %s 保留混合数值、反向范围及完整技能并可回读',
  (locale) => {
    const traditional = locale === 'zh-TW'
    const data = structuredClone(catalog)
    first(data.bases).implicit = 'Grants Skill: Level (1-20) Skeletal Warrior Minion'
    const input = {
      ...state,
      quality: 20,
      implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'],
    }
    const dict: ItemDictionary = {
      items: { bases: { 'Runed Focus': traditional ? '符文法器臺' : '符文法器中' }, uniques: {} },
      stats: {
        entries: [
          {
            id: 'mana',
            en: '+# to maximum Mana',
            text: traditional ? '+# 最大魔力' : '+# 最大魔力中',
          },
          {
            id: 'speed',
            en: '#% increased Cast Speed',
            text: traditional ? '施法速度增加 #%' : '施法速度提高 #%',
          },
          { id: 'life', en: '# to maximum Life', text: traditional ? '# 最大生命' : '# 生命上限' },
          {
            id: 'skill.test',
            en: 'Grants Skill: Level # Skeletal Warrior Minion',
            text: traditional ? '賦予技能: 等級 # 骷髏戰士' : '获得技能: 等级 # 魔侍武士',
          },
        ],
      },
    }
    const before = JSON.stringify({ data, input, dict })
    const result = exportCraftItemText(data, input, { locale, dictionary: dict })
    if (!result.ok) throw new Error(result.error)
    expect(result.value.text).toContain(traditional ? '物品種類: Foci' : '物品类别: Foci')
    expect(result.value.text).toContain(
      traditional ? '稀有度: 稀有\n製作演練' : '稀有度: 稀有\n制作演练',
    )
    expect(result.value.text).toContain(
      traditional
        ? '賦予技能: 等級 12 骷髏戰士（最高等級 13）'
        : '获得技能: 等级 12 魔侍武士（最高等级 13）',
    )
    expect(result.value.text).toContain(
      traditional ? '施法速度增加 1.5% (crafted)' : '施法速度提高 1.5% (crafted)',
    )
    const parsed = parseItem(result.value.text)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.item.locale).toBe(locale)
    const restored = importCraftState(
      data,
      input.baseId,
      parsed.item,
      inspectItem(parsed.item, dict),
    )
    expect(restored).toMatchObject({
      ok: true,
      value: { affixes: input.affixes, implicitLines: input.implicitLines, quality: 20 },
    })
    expect(JSON.stringify({ data, input, dict })).toBe(before)
  },
)

it('反向占位顺序、方向范围、固定小数与未定值原样可逆', () => {
  const data = structuredClone(catalog)
  first(data.modifiers).lines = ['Lose (21-23) Life to gain (1.1-2.5) Mana at Level 20']
  const line = 'Lose 22(23-21) Life to gain 1.5 Mana at Level 20'
  const dict = {
    stats: {
      entries: [
        {
          id: 'swap',
          en: 'Lose # Life to gain # Mana at Level 20',
          text: '20 级时获得 # 魔力，消耗 # 生命',
          order: [1, 0],
        },
      ],
    },
  }
  for (const actual of [line, first(data.modifiers).lines[0] as string]) {
    const result = exportCraftItemText(
      data,
      { ...state, affixes: [{ modId: 'mana', lines: [actual] }] },
      { locale: 'zh-CN', dictionary: dict },
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.text).toContain(
      actual === line
        ? '20 级时获得 1.5 魔力，消耗 22(23-21) 生命'
        : '20 级时获得 (1.1-2.5) 魔力，消耗 (21-23) 生命',
    )
    expect(result.value.warnings.some((w) => w.includes('未定值'))).toBe(actual !== line)
  }
})

it.each(['missing', 'forward', 'reverse', 'injection'] as const)(
  '缺失或不安全译文 %s 保留英文并警告',
  (mode) => {
    const entries =
      mode === 'missing'
        ? []
        : [
            {
              id: 'one',
              en: '+# to maximum Mana',
              text: mode === 'injection' ? 'Note: #\nCorrupted' : '# 魔力',
            },
          ]
    if (mode === 'forward')
      entries.push({ id: 'two', en: '+# to maximum Mana', text: '# 魔力异名' })
    if (mode === 'reverse') entries.push({ id: 'two', en: '+# to maximum Life', text: '# 魔力' })
    const result = exportCraftItemText(catalog, state, {
      locale: 'zh-CN',
      dictionary: { stats: { entries } },
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.value.text).toContain('+47 to maximum Mana')
    expect(result.value.text).not.toContain('Corrupted')
    expect(result.value.warnings.join()).toContain('+47 to maximum Mana')
  },
)

it('基底逆查歧义退回英文，技能无等级依照整行模板翻译，未知技能保留并说明', () => {
  const data = structuredClone(catalog)
  first(data.bases).implicit = 'Grants Skill: Parry'
  const dict = {
    items: { bases: { 'Runed Focus': '同名法器', Other: '同名法器' }, uniques: {} },
    stats: {
      entries: [
        { id: 'skill.parry', en: 'Grants Skill: Level # Parry', text: '获得技能: 等级 # 招架' },
      ],
    },
  }
  const known = exportCraftItemText(
    data,
    { ...state, affixes: [] },
    { locale: 'zh-CN', dictionary: dict },
  )
  if (!known.ok) throw new Error(known.error)
  expect(known.value.text).toContain('Runed Focus')
  expect(known.value.text).toContain('获得技能: 招架')
  expect(known.value.warnings.join()).toContain('基底')
  const unknown = exportCraftItemText(
    data,
    { ...state, affixes: [] },
    { locale: 'zh-TW', dictionary: {} },
  )
  if (!unknown.ok) throw new Error(unknown.error)
  expect(unknown.value.text).toContain('Grants Skill: Parry')
  expect(unknown.value.warnings.join()).toContain('回读')
})

it('拒绝非法导出选项，默认英文不变', () => {
  for (const options of [null, [], { locale: 'ja' }, { locale: null }])
    expect(exportCraftItemText(catalog, state, options as never).ok).toBe(false)
  expect(exportCraftItemText(catalog, state, { locale: 'en', dictionary: {} })).toEqual(
    exportCraftItemText(catalog, state),
  )
})

it('词缀和当前符文使用 trade hash 消歧，固有属性独立翻译且可回读', () => {
  const data = structuredClone(catalog)
  first(data.bases).implicit = '+5 to maximum Mana'
  first(data.modifiers).tradeHashes = { '1': ['+(35-54) to maximum Mana'] }
  data._meta.sources = [{ path: 'src/Data/ModRunes.lua', url: 'test', sha256: 'a'.repeat(64) }]
  data.augments = [
    {
      id: 'cold',
      name: 'Glacial Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+12% to Cold Resistance'],
      statOrder: [1],
      tradeHashes: { '3': ['+12% to Cold Resistance'] },
      levelReq: 1,
    },
  ]
  const dict = {
    items: { bases: { 'Runed Focus': '符文法器' }, uniques: {} },
    stats: {
      entries: [
        { id: 'explicit.stat_1', en: '+# to maximum Mana', text: '最大魔力 +#' },
        { id: 'sanctum.stat_2', en: '+# to maximum Mana', text: '试炼魔力 +#' },
        { id: 'explicit.stat_3', en: '+#% to Cold Resistance', text: '冰霜抗性 +#%' },
        { id: 'sanctum.stat_4', en: '+#% to Cold Resistance', text: '试炼冰霜抗性 +#%' },
      ],
    },
  }
  const input = { ...state, affixes: [first(state.affixes)], sockets: ['cold'], quality: 0 }
  const out = exportCraftItemText(data, input, { locale: 'zh-CN', dictionary: dict })
  if (!out.ok) throw new Error(out.error)
  expect(out.value.text).toContain('最大魔力 +47')
  expect(out.value.text).toContain('冰霜抗性 +12% (rune)')
  // 固有属性没有 hash 身份，正向多义时仍保留原文，不借用显式词缀上下文。
  expect(out.value.text).toContain('+5 to maximum Mana')
  expect(out.value.warnings.join()).toContain('+5 to maximum Mana')
  const parsed = parseItem(out.value.text)
  if (!parsed.ok) throw new Error(parsed.error)
  const restored = importCraftState(
    data,
    input.baseId,
    parsed.item,
    inspectItem(parsed.item, dict),
    input.sockets,
  )
  expect(restored).toMatchObject({
    ok: true,
    value: { affixes: input.affixes, sockets: ['cold'], quality: 0 },
  })
})

it.each(['Note：注入', 'Corrupted', '坏名\n--------', '{ Prefix Modifier }'])(
  '拒绝基底译名结构 %s 而保留英文',
  (name) => {
    const out = exportCraftItemText(catalog, state, {
      locale: 'zh-CN',
      dictionary: { items: { bases: { 'Runed Focus': name }, uniques: {} } },
    })
    if (!out.ok) throw new Error(out.error)
    expect(out.value.text).toContain('Runed Focus')
    expect(out.value.text).not.toContain(name)
    expect(out.value.warnings.join()).toContain('基底译名包含')
  },
)

it('技能正向与反向歧义不丢原等级和最高等级', () => {
  const data = structuredClone(catalog)
  first(data.bases).implicit = 'Grants Skill: Level (1-20) Skeletal Warrior Minion'
  const line = 'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)'
  const entry = {
    id: 'skill.first',
    en: 'Grants Skill: Level # Skeletal Warrior Minion',
    text: '获得技能: 等级 # 魔侍武士',
  }
  for (const other of [
    { id: 'skill.second', en: entry.en, text: '获得技能: 等级 # 骷髅战士' },
    { id: 'skill.second', en: 'Grants Skill: Level # Other Skill', text: entry.text },
  ]) {
    const out = exportCraftItemText(
      data,
      { ...state, implicitLines: [line] },
      { locale: 'zh-CN', dictionary: { stats: { entries: [entry, other] } } },
    )
    if (!out.ok) throw new Error(out.error)
    expect(out.value.text).toContain(line)
    expect(out.value.warnings.join()).toContain('回读')
  }
})

function first<T>(values: T[]): T {
  const value = values[0]
  if (value === undefined) throw new Error('测试数据缺失')
  return value
}

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
      id: 'focus-variant',
      name: 'Runed Focus',
      type: 'Focus',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: 2,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'mana',
      kind: 'suffix',
      name: 'Intelligence',
      group: 'mana',
      level: 23,
      lines: ['+(35-54) to maximum Mana'],
      statOrder: [1],
      tags: ['mana'],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
    {
      id: 'hybrid',
      kind: 'prefix',
      name: 'Hybrid',
      group: 'hybrid',
      level: 1,
      lines: ['(1.1-2.5)% increased Cast Speed', '-(2-5) to maximum Life'],
      statOrder: [1, 2],
      tags: ['caster', 'life'],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
}
const state: CraftState = {
  baseId: 'focus-variant',
  itemLevel: 80,
  rarity: 'rare',
  sourceText: 'Private Random Name\nEnergy Shield: 999\nNote: @private',
  affixes: [
    { modId: 'mana', lines: ['+47 to maximum Mana'] },
    { modId: 'hybrid', lines: ['1.5% increased Cast Speed', '-3 to maximum Life'], crafted: true },
  ],
}
const dictionary = {
  items: { bases: { 'Runed Focus': '符文法器' }, uniques: {} },
  stats: {
    entries: [
      { id: 'explicit.stat_3291658075', en: '+# to maximum Mana', text: '+# 魔力' },
      { id: 'speed', en: '#% increased Cast Speed', text: '#% 速度' },
      { id: 'life', en: '# to maximum Life', text: '# 生命' },
    ],
  },
}
function exported(input = state, data = catalog) {
  const result = exportCraftItemText(data, input)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('演练装备英文文本', () => {
  it('导出当前混合组、工艺、小数、负值并通过完整管线回读', () => {
    const before = JSON.stringify({ catalog, state })
    const { text } = exported()
    expect(text).toContain('Rarity: Rare\nCrafting Simulation\nRuned Focus')
    expect(text).toContain('{ Suffix Modifier "Intelligence" — mana }\n+47 to maximum Mana')
    expect(text).toContain(
      '{ Prefix Modifier "Hybrid" — caster, life }\n1.5% increased Cast Speed (crafted)\n-3 to maximum Life (crafted)',
    )
    expect(text).not.toMatch(/Tier|Private|999|@private|focus-variant/)
    expect(JSON.stringify({ catalog, state })).toBe(before)
    const parsed = parseItem(text)
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, dictionary)
    expect(inspection.bridgeText).toBeNull()
    expect(importCraftState(catalog, state.baseId, parsed.item, inspection)).toMatchObject({
      ok: true,
      value: { baseId: state.baseId, itemLevel: 80, affixes: state.affixes },
    })
  })
  it('允许无 Tier 普通命名头，拒绝畸形结构', () => {
    expect(knownExplicitHeader('{ Prefix Modifier "Test" — mana }')).toBe(true)
    for (const header of [
      '{ Prefix Modifier "Test" (Tier: x) }',
      '{ Prefix Modifier "Test" (Tier: ) }',
      '{ Prefix Modifier "Test" junk }',
      '{ Fractured Prefix Modifier "Test" }',
      '{ Prefix Modifier "Te{st" }',
      '{ Prefix Modifier "Test" — mana } junk',
    ])
      expect(knownExplicitHeader(header)).toBe(false)
  })
})

it.each(['normal', 'magic', 'rare'] as const)('保留 %s 身份，不猜名称组合', (rarity) => {
  const text = exported({
    ...state,
    rarity,
    affixes: rarity === 'normal' ? [] : [first(state.affixes)],
  }).text
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.item.rarity).toBe(rarity)
  expect(parsed.item.nameLines.map((line) => line.raw)).toEqual(
    rarity === 'rare' ? ['Crafting Simulation', 'Runed Focus'] : ['Runed Focus'],
  )
})
it.each([undefined, 0, 20])('品质 %s 不从旧面板推断', (quality) => {
  const { text, warnings } = exported({ ...state, ...(quality === undefined ? {} : { quality }) })
  expect(text.includes('Quality:')).toBe(quality !== undefined)
  if (quality !== undefined) expect(text).toContain(`Quality: +${quality}%`)
  expect(warnings.some((warning) => warning.includes('品质未知'))).toBe(quality === undefined)
})
it('区分未定范围和已带范围的实际值', () => {
  expect(
    exported({
      ...state,
      affixes: [{ modId: 'mana', lines: ['+(35-54) to maximum Mana'] }],
    }).warnings.join(),
  ).toContain('未定值')
  const result = exported({
    ...state,
    affixes: [{ modId: 'mana', lines: ['+47(35-54) to maximum Mana'] }],
  })
  expect(result.text).toContain('+47(35-54) to maximum Mana')
  expect(result.warnings.join()).not.toContain('未定值')
})
it('多个固有属性与授予技能独立成组并保留 Max Level', () => {
  const data = structuredClone(catalog)
  first(data.bases).type = 'Sceptre'
  first(data.bases).implicit =
    '+(10-20) to Spirit\n+5 to maximum Mana\nGrants Skill: Level (1-20) Skeletal Warrior Minion'
  const implicitLines = [
    '+15 to Spirit',
    '+5 to maximum Mana',
    'Grants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
  ]
  const result = exported({ ...state, affixes: [], implicitLines }, data)
  expect(result.text).toContain('Item Class: Sceptres')
  expect(result.text).toContain(
    '{ Implicit Modifier }\n+15 to Spirit\n+5 to maximum Mana\n--------\nGrants Skill: Level 12 Skeletal Warrior Minion (Max Level 13)',
  )
  const parsed = parseItem(result.text)
  if (!parsed.ok) throw new Error(parsed.error)
  expect(
    importCraftState(data, state.baseId, parsed.item, inspectItem(parsed.item, dictionary)),
  ).toMatchObject({ ok: true, value: { implicitLines } })
})
it('未知、零孔和多个已知空孔不混同', () => {
  expect(exported().warnings.join()).toContain('孔位未知')
  const zero = exported({ ...state, sockets: [] })
  expect(zero.text).not.toContain('Sockets:')
  expect(zero.warnings.join()).toContain('零孔')
  expect(exported({ ...state, sockets: [null, null] }).text).toContain('Sockets: S S')
})
it('当前符文效果跟随替换，不复制旧 runeSourceLines，并要求回读核对孔位', () => {
  const data = structuredClone(catalog)
  data._meta.sources = [{ path: 'src/Data/ModRunes.lua', url: 'test', sha256: 'a'.repeat(64) }]
  data.augments = [
    {
      id: 'cold',
      name: 'Glacial Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+12% to Cold Resistance'],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 1,
    },
  ]
  const input = {
    ...state,
    sourceText:
      'Item Class: Foci\nRarity: Rare\nOld Name\nRuned Focus\n--------\nItem Level: 80\n--------\n+12% to Fire Resistance (rune)',
    sockets: ['cold', 'cold'],
    runeSourceLines: ['+12% to Fire Resistance'],
  }
  const text = exported(input, data).text
  expect(text).not.toContain('Fire Resistance')
  expect(text.match(/\+12% to Cold Resistance \(rune\)/g)).toHaveLength(2)
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, dictionary)
  expect(importCraftState(data, state.baseId, parsed.item, inspection).ok).toBe(false)
  expect(
    importCraftState(data, state.baseId, parsed.item, inspection, input.sockets),
  ).toMatchObject({ ok: true, value: { sockets: ['cold', 'cold'] } })
})
it('同文词缀仍有歧义时不因导出名称猜 ID', () => {
  const data = structuredClone(catalog)
  data.modifiers.push({ ...first(data.modifiers), id: 'mana-other' })
  const parsed = parseItem(exported(state, data).text)
  if (!parsed.ok) throw new Error(parsed.error)
  expect(
    importCraftState(data, state.baseId, parsed.item, inspectItem(parsed.item, dictionary)).ok,
  ).toBe(false)
})
it('复用状态门禁拒绝非法物等、稀有度、咒符、词缀和孔位', () => {
  for (const patch of [
    { itemLevel: 0 },
    { rarity: 'unique' },
    { quality: 31 },
    { sockets: ['unknown'] },
    { affixes: [{ modId: 'bad', lines: [] }] },
  ])
    expect(exportCraftItemText(catalog, { ...state, ...patch } as CraftState).ok).toBe(false)
  const data = structuredClone(catalog)
  first(data.bases).type = 'Charm'
  expect(exportCraftItemText(data, state).ok).toBe(false)
})
it.each(['\nNote: secret', '{malformed}', 'Note: secret', '--------'])(
  '拒绝目录属性结构注入 %s',
  (line) => {
    const data = structuredClone(catalog)
    first(data.modifiers).lines = [line]
    expect(
      exportCraftItemText(data, { ...state, affixes: [{ modId: 'mana', lines: [line] }] }).ok,
    ).toBe(false)
  },
)
it.each(['\nNote: secret', '{malformed}', '"escape'])('拒绝基底、名称和标签注入 %s', (text) => {
  for (const field of ['base', 'name', 'tags']) {
    const data = structuredClone(catalog)
    if (field === 'base') first(data.bases).name = text
    if (field === 'name') first(data.modifiers).name = text
    if (field === 'tags') first(data.modifiers).tags = [text]
    expect(exportCraftItemText(data, state).ok).toBe(false)
  }
})
it('保留无等级技能且不提示不适用的等级警告', () => {
  const data = structuredClone(catalog)
  first(data.bases).implicit = 'Grants Skill: Parry'
  const result = exported({ ...state, affixes: [] }, data)
  expect(result.text).toContain('Grants Skill: Parry')
  expect(result.warnings.join()).not.toContain('技能等级未明确')
})

it.each([
  'Properties:',
  'Quality: +20%',
  'Energy Shield: 999',
  'Note： secret',
  'Corrupted',
  'Mirrored',
  'Unidentified',
  'Fractured Item',
  'Grants Skill: Parry',
  '需求： 等级 80',
  '描述：注入',
  'Sockets： S',
])('拒绝能逃逸词缀组的结构行 %s', (line) => {
  const data = structuredClone(catalog)
  first(data.modifiers).lines = [line]
  expect(
    exportCraftItemText(data, { ...state, affixes: [{ modId: 'mana', lines: [line] }] }).ok,
  ).toBe(false)
})
it.each([
  '--------',
  'Corrupted',
  'Mirrored',
  'Fractured Item',
  'Item Class: Foci',
  'Note：secret',
])('基底名称不能注入分隔/状态/标签 %s', (name) => {
  const data = structuredClone(catalog)
  first(data.bases).name = name
  expect(exportCraftItemText(data, state).ok).toBe(false)
})
