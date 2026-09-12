import {
  type CatalogAugment,
  type CraftCatalog,
  createCatalogTranslator,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const base = {
  id: 'Test Coat',
  name: 'Test Coat',
  type: 'Body Armour',
  tags: ['default'],
  requirements: {},
  properties: { Armour: 45 },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 4,
  hidden: false,
  runeforged: false,
}
const augment = (id: string, name: string, value: number, localMod: boolean): CatalogAugment => ({
  id,
  name,
  category: 'armour',
  type: 'Rune',
  localMod,
  lines: [
    localMod
      ? `${value}% increased Armour, Evasion and Energy Shield`
      : `+${value}% to Fire Resistance`,
  ],
  statOrder: [1],
  tradeHashes: localMod ? { '1': [`${value}% increased Armour, Evasion and Energy Shield`] } : {},
  levelReq: id === 'perfect' ? 50 : 0,
  bonded: { lines: ['+20 to maximum Life'], statOrder: [2] },
})
const catalog: CraftCatalog = {
  bases: [base],
  augments: [
    augment('iron', 'Lesser Iron Rune', 14, true),
    augment('perfect', 'Perfect Iron Rune', 20, true),
    augment('fire', 'Lesser Desert Rune', 10, false),
  ],
  modifiers: [
    {
      id: 'Flat',
      name: 'Flat',
      group: 'LocalPhysicalDamageReductionRating',
      lines: ['+(10-20) to Armour'],
    },
    {
      id: 'Inc',
      name: 'Inc',
      group: 'LocalPhysicalDamageReductionRatingPercent',
      lines: ['(50-60)% increased Armour'],
    },
  ].map((mod) => ({
    ...mod,
    kind: 'prefix',
    level: 1,
    statOrder: [1],
    tags: [],
    addsTags: [],
    eligibility: [{ tag: 'default', value: 1 }],
    tradeHashes: {},
  })),
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
  items: { bases: { 'Test Coat': '测试胸甲' }, uniques: {} },
  stats: {
    entries: [
      {
        id: 'explicit.stat_1',
        en: '#% increased Armour, Evasion and Energy Shield',
        text: '护甲、闪避和能量护盾提高 #%',
      },
      {
        id: 'sanctum.stat_2',
        en: '#% increased Armour, Evasion and Energy Shield',
        text: '三防值提高 #%',
      },
    ],
  },
}
function setup(source?: string) {
  const parsed = source === undefined ? null : parseItem(source)
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspected = item ? inspectItem(item, dictionary) : undefined
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={12}
      imported={
        item && inspected
          ? {
              baseId: base.id,
              item,
              mods: inspected.mods,
              runes: inspected.runes,
              comparisonOnly: false,
            }
          : undefined
      }
      translations={{
        'Lesser Iron Rune': '次级钢铁符文',
        'Perfect Iron Rune': '完美钢铁符文',
        'Lesser Desert Rune': '次级沙漠符文',
      }}
      translateLine={createCatalogTranslator(dictionary.stats.entries)}
      dictionary={dictionary}
      onRestore={vi.fn()}
    />,
  )
}
function panel() {
  return within(screen.getByLabelText('防御面板估算'))
}
function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
function click(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}
function save() {
  click('保存演练到本机')
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY)
  expect(text).not.toBeNull()
  return JSON.parse(text ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('同英文多译文按符文身份消歧，候选、草稿、当前孔位均显示正确中文', () => {
  setup()
  select('起点已有空孔数', '1')
  click('从空白基底开始')
  expect(
    screen.getByRole('option', { name: '次级钢铁符文 · 护甲、闪避和能量护盾提高 14%' }),
  ).toBeDefined()
  select('选择镶嵌符文', 'iron')
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText('护甲、闪避和能量护盾提高 14%'),
  ).toBeDefined()
  click('应用镶嵌')
  expect(
    within(screen.getByLabelText('当前镶嵌效果')).getByText('护甲、闪避和能量护盾提高 14%'),
  ).toBeDefined()
})

it('本地词缀、两孔钢铁符文与品质独立计算；覆盖、撤销、保存恢复一致', () => {
  setup()
  select('起点已有品质', '20')
  select('起点已有空孔数', '2')
  click('从空白基底开始')
  click('蜕变石')
  fireEvent.click(screen.getByRole('button', { name: /Flat · Flat/ }))
  click('应用本次结果')
  click('富豪石')
  fireEvent.click(screen.getByRole('button', { name: /Inc · Inc/ }))
  click('应用本次结果')
  expect(panel().getByText('99')).toBeDefined()
  select('选择镶嵌符文', 'iron')
  expect(panel().getByText('99 → 108（+9）')).toBeDefined()
  click('应用镶嵌')
  select('目标孔位', '1')
  select('选择镶嵌符文', 'perfect')
  expect(panel().getByText('108 → 121（+13）')).toBeDefined()
  click('应用镶嵌')
  expect(panel().getByText('词缀提高 50% + 符文提高 34%')).toBeDefined()
  expect(screen.queryByText('+20 to maximum Life')).toBeNull()
  select('目标孔位', '0')
  select('选择镶嵌符文', 'fire')
  expect(panel().getByText('121 → 112（-9）')).toBeDefined()
  click('应用镶嵌')
  expect(panel().getByText('112')).toBeDefined()
  const saved = save()
  expect(saved.operations).toHaveLength(5)
  expect(saved.initialState.sockets).toEqual([null, null])
  click('撤销')
  expect(panel().getByText('121')).toBeDefined()
  click('恢复本机演练')
  expect(panel().getByText('112')).toBeDefined()
  expect(screen.getByText('次级沙漠符文 × 1')).toBeDefined()
  expect(screen.getByText('完美钢铁符文 × 1')).toBeDefined()
})

it('中文原文合计28%需与两个孔逐项核对，替换后来源不重复计入', () => {
  setup(
    '物品类别: 胸甲\n稀有度: 普通\n测试胸甲\n--------\n品质: +20%\n--------\n插槽: S S\n--------\n物品等级: 12\n--------\n护甲、闪避和能量护盾提高 28% (rune)',
  )
  select('核对孔位 1', 'iron')
  select('核对孔位 2', 'fire')
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  select('核对孔位 2', 'iron')
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  click('按已核对孔位开始')
  expect(panel().getByText('69')).toBeDefined()
  expect(screen.getByText('尚未消耗通货')).toBeDefined()
  select('选择镶嵌符文', 'fire')
  expect(panel().getByText('69 → 62（-7）')).toBeDefined()
  click('应用镶嵌')
  const saved = save()
  expect(saved.initialState.runeSourceLines).toEqual([
    '28% increased Armour, Evasion and Energy Shield',
  ])
  expect(saved.importedSockets).toEqual(['iron', 'iron'])
  expect(saved.operations).toEqual([{ kind: 'socket', socketIndex: 0, augmentId: 'fire' }])
  click('恢复本机演练')
  expect(panel().getByText('62')).toBeDefined()
  expect(panel().getByText('词缀提高 0% + 符文提高 14%')).toBeDefined()
})
