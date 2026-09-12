import { type CraftCatalog, inspectItem, parseItem } from '@poe2-tools/item-core'
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
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  bases: [base],
  augments: [
    {
      id: 'TestFireRune',
      name: 'Lesser Desert Rune',
      category: 'armour',
      type: 'Rune',
      localMod: false,
      lines: ['+10% to Fire Resistance'],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 0,
    },
  ],
  modifiers: [
    {
      id: 'TestArmour',
      name: 'Test armour',
      kind: 'prefix',
      group: 'LocalPhysicalDamageReductionRating',
      level: 1,
      lines: ['+(10-20) to Armour'],
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
      {
        path: 'src/Data/ModRunes.lua',
        url: 'https://example.test/runes',
        sha256: 'b'.repeat(64),
      },
    ],
  },
}
function setup(source?: string) {
  const parsed =
    source === undefined
      ? null
      : parseItem(
          `Item Class: Body Armours\nRarity: Normal\nTest Coat\n--------\nItem Level: 12${source}`,
        )
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspected = item ? inspectItem(item, {}) : undefined
  return render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={12}
      imported={
        item && inspected
          ? { baseId: base.id, item, mods: inspected.mods, comparisonOnly: false }
          : undefined
      }
      translations={{}}
      translateLine={undefined}
      dictionary={{ items: { bases: { 'Test Coat': '测试胸甲' }, uniques: {} } }}
      onRestore={vi.fn()}
    />,
  )
}
function save() {
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY)
  expect(text).not.toBeNull()
  return JSON.parse(text ?? '{}')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('搜索默认零品质，明确起点品质后估算；预览、应用和撤销沿用同一起点', () => {
  setup()
  expect((screen.getByLabelText('起点已有品质') as HTMLSelectElement).value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('45')).toBeDefined()
  fireEvent.change(screen.getByLabelText('起点已有品质'), { target: { value: '10' } })
  expect(within(screen.getByLabelText('防御面板估算')).getByText('45')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('50')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(screen.getByRole('button', { name: /TestArmour/ }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('50 → 61（+11）')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('61')).toBeDefined()
  expect(save().initialState.quality).toBe(10)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('50')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('61')).toBeDefined()
})

it('导入缺少品质不推定零，品质和孔位声明一起保存且恢复后不会遗留到另一项目', () => {
  setup('')
  expect((screen.getByLabelText('导入装备品质') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  expect(screen.getByText('品质未知；请核对起点品质后重新开始。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('导入装备品质'), { target: { value: '10' } })
  expect((screen.getByLabelText('导入装备品质') as HTMLSelectElement).value).toBe('10')
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '0' } })
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
    screen.getByLabelText('核对导入孔位').textContent,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '按已核对孔位开始' }))
  expect(within(screen.getByLabelText('防御面板估算')).getByText('50')).toBeDefined()
  const saved = save()
  expect(saved.importedQuality).toBe(10)
  expect(saved.importedSockets).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.queryByText('品质来源：用户核对导入装备，起点已有 10%。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('品质来源：用户核对导入装备，起点已有 10%。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  const blank = save()
  expect(blank.importedQuality).toBeUndefined()
  expect(blank.initialState.quality).toBe(0)
})

it('明确原文品质只读展示，不混用搜索起点；未知孔位时显示估算限制', () => {
  setup('\n--------\nQuality: +15% (augmented)')
  expect(screen.queryByLabelText('导入装备品质')).toBeNull()
  expect(screen.getByText('原文品质：15%。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('起点已有品质'), { target: { value: '30' } })
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  expect(screen.getByText('品质来源：复制原文，15%。')).toBeDefined()
  expect(within(screen.getByLabelText('防御面板估算')).queryByText('52')).toBeNull()
  const saved = save()
  expect(saved.initialState.quality).toBe(15)
  expect(saved.importedQuality).toBeUndefined()
})
