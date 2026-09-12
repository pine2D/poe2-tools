import {
  type CatalogBase,
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  createCatalogTranslator,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const focus: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
  type: 'Focus',
  tags: ['default', 'focus', 'armour'],
  requirements: {},
  properties: { EnergyShield: 42 },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  bases: [focus],
  augments: [
    {
      id: 'iron',
      name: 'Iron Rune',
      category: 'armour',
      type: 'Rune',
      localMod: true,
      lines: ['16% increased Armour, Evasion and Energy Shield'],
      statOrder: [1],
      tradeHashes: { '1': ['16% increased Armour, Evasion and Energy Shield'] },
      levelReq: 15,
    },
    {
      id: 'fire',
      name: 'Desert Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+14% to Fire Resistance'],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 15,
    },
  ],
  modifiers: [
    {
      id: 'FlatES',
      name: 'Test',
      kind: 'prefix',
      group: 'LocalEnergyShield',
      level: 1,
      lines: ['+(20-30) to maximum Energy Shield'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '',
    weightStatus: 'unknown',
    excludedBases: [],
    sources: [
      { path: 'src/Data/ModRunes.lua', url: 'https://example.test/runes', sha256: 'b'.repeat(64) },
    ],
  },
}
const dictionary = {
  items: { bases: { 'Test Focus': '测试法器' }, uniques: {} },
  stats: {
    entries: [
      {
        id: 'explicit.stat_1',
        en: '#% increased Armour, Evasion and Energy Shield',
        text: '护甲、闪避和能量护盾提高 #%',
      },
      { id: 'explicit.stat_2', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' },
    ],
  },
}
function setup(base = focus, source?: string) {
  const parsed = source === undefined ? null : parseItem(source)
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspection = item ? inspectItem(item, dictionary) : undefined
  render(
    <CraftEntry
      catalog={{ ...catalog, bases: [base] }}
      base={base}
      itemLevel={40}
      imported={
        item && inspection
          ? {
              baseId: base.id,
              item,
              mods: inspection.mods,
              runes: inspection.runes,
              comparisonOnly: inspection.comparisonOnly,
            }
          : undefined
      }
      translations={{ 'Iron Rune': '钢铁符文', 'Desert Rune': '沙漠符文' }}
      translateLine={createCatalogTranslator(dictionary.stats.entries)}
      dictionary={dictionary}
      onRestore={vi.fn()}
    />,
  )
}
const select = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const panel = () => within(screen.getByLabelText('防御面板估算'))
function save() {
  click('保存演练到本机')
  return JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it.each([
  ['Focus', { EnergyShield: 42 }, ['focus'], '42', '49'],
  ['Shield', { Armour: 100, BlockChance: 26 }, ['shield'], '100', '116'],
  ['Shield', { Evasion: 100, BlockChance: 20 }, ['buckler'], '100', '116'],
  ['Buckler', { Evasion: 100, BlockChance: 20 }, ['buckler'], '100', '116'],
] as const)(
  '%s 搜索起点打孔、镶嵌、替换、撤销与保存恢复',
  (type, properties, tags, before, after) => {
    setup({ ...focus, type, properties, tags: ['default', ...tags] })
    expect((screen.getByLabelText('起点已有空孔数') as HTMLSelectElement).value).toBe('0')
    click('从空白基底开始')
    expect(panel().getByText(before)).toBeDefined()
    expect(panel().queryByText('格挡')).toBeNull()
    click('巧匠石：添加一个孔')
    click('应用打孔')
    expect(
      (screen.getByRole('button', { name: '巧匠石：添加一个孔' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    select('选择镶嵌符文', 'iron')
    click('应用镶嵌')
    expect(panel().getByText(after)).toBeDefined()
    select('选择镶嵌符文', 'fire')
    click('应用镶嵌')
    expect(panel().getByText(before)).toBeDefined()
    const saved = save()
    expect(saved.rulesVersion).toBe(CRAFT_RULES_VERSION)
    expect(saved.initialState.sockets).toEqual([])
    expect(saved.operations).toHaveLength(3)
    expect(screen.getByText('巧匠石 × 1')).toBeDefined()
    click('撤销')
    expect(panel().getByText(after)).toBeDefined()
    click('恢复本机演练')
    expect(panel().getByText(before)).toBeDefined()
  },
)

it('中文法器缺少品质和孔位先保持未知；核对零孔后保留词缀制作', () => {
  setup(
    focus,
    '物品类别: 法器\n稀有度: 稀有\n测试 辉光\n测试法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "测试的" (等阶：6) }\n+25(20-30) 能量护盾上限',
  )
  expect((screen.getByLabelText('导入装备品质') as HTMLSelectElement).value).toBe('')
  expect((screen.getByLabelText('导入装备孔数') as HTMLSelectElement).value).toBe('')
  click('从当前装备开始')
  expect(panel().queryByText('67')).toBeNull()
  select('导入装备品质', '0')
  select('导入装备孔数', '0')
  click('按已核对孔位开始')
  expect(panel().getByText('67')).toBeDefined()
  click('巧匠石：添加一个孔')
  click('应用打孔')
  select('选择镶嵌符文', 'iron')
  expect(panel().getByText('67 → 78（+11）')).toBeDefined()
  click('应用镶嵌')
  const saved = save()
  expect(saved.importedQuality).toBe(0)
  expect(saved.importedSockets).toEqual([])
  expect(saved.initialState.affixes).toEqual([
    { modId: 'FlatES', lines: ['+25(20-30) to maximum Energy Shield'] },
  ])
  click('恢复本机演练')
  expect(panel().getByText('78')).toBeDefined()
})

it('法器已有两孔保留原文来源，核对钢铁总和且禁止继续普通打孔', () => {
  setup(
    focus,
    '物品类别: 法器\n稀有度: 普通\n测试法器\n--------\n品质: +0%\n--------\n插槽: S S\n--------\n物品等级: 40\n--------\n护甲、闪避和能量护盾提高 32% (rune)',
  )
  select('核对孔位 1', 'iron')
  select('核对孔位 2', 'fire')
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  select('核对孔位 2', 'iron')
  click('按已核对孔位开始')
  expect(panel().getByText('55')).toBeDefined()
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  expect(
    (screen.getByRole('button', { name: '巧匠石：添加一个孔' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  select('选择镶嵌符文', 'fire')
  expect(panel().getByText('55 → 49（-6）')).toBeDefined()
  click('应用镶嵌')
  const saved = save()
  expect(saved.importedSockets).toEqual(['iron', 'iron'])
  expect(saved.initialState.runeSourceLines).toEqual([
    '32% increased Armour, Evasion and Energy Shield',
  ])
  click('恢复本机演练')
  expect(panel().getByText('49')).toBeDefined()
})
