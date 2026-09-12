import { type CatalogBase, type CraftCatalog, inspectItem, parseItem } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const base = {
  id: 'Test Coat',
  name: 'Test Coat',
  type: 'Bow',
  tags: ['default', 'weapon', 'twohand'],
  requirements: {},
  properties: { PhysicalMin: 10, PhysicalMax: 20, AttackRateBase: 1.5, CritChanceBase: 5 },
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
      category: 'weapon',
      type: 'Rune',
      localMod: true,
      lines: ['Adds 7 to 11 Fire Damage'],
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
      group: 'LocalPhysicalDamage',
      level: 1,
      lines: ['Adds (5-8) to (10-15) Physical Damage'],
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
function setup(source?: string, selectedBase: CatalogBase = base) {
  const parsed =
    source === undefined
      ? null
      : parseItem(`Item Class: Bows\nRarity: Normal\nTest Coat\n--------\nItem Level: 12${source}`)
  if (parsed && !parsed.ok) throw new Error(parsed.error)
  const item = parsed?.ok ? parsed.item : undefined
  const inspected = item ? inspectItem(item, {}) : undefined
  return render(
    <CraftEntry
      catalog={{ ...catalog, bases: [selectedBase] }}
      base={selectedBase}
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

it('武器品质、镶嵌预览取消应用撤销及保存恢复派生正确面板', () => {
  setup()
  expect((screen.getByLabelText('起点已有品质') as HTMLSelectElement).value).toBe('0')
  fireEvent.change(screen.getByLabelText('起点已有品质'), { target: { value: '20' } })
  fireEvent.change(screen.getByLabelText('起点已有空孔数'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  const panel = () => within(screen.getByLabelText('武器面板估算'))
  expect(panel().getByText('总武器 DPS：27')).toBeDefined()
  expect(screen.queryByLabelText('防御面板估算')).toBeNull()
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: 'TestFireRune' } })
  expect(panel().getByText('27 → 40.5（+13.5）')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '取消镶嵌' }))
  expect(panel().getByText('总武器 DPS：27')).toBeDefined()
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: 'TestFireRune' } })
  fireEvent.click(screen.getByRole('button', { name: '应用镶嵌' }))
  expect(panel().getByText('总武器 DPS：40.5')).toBeDefined()
  expect(save().initialState.quality).toBe(20)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(panel().getByText('总武器 DPS：27')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(panel().getByText('总武器 DPS：40.5')).toBeDefined()
})
it('导入缺品质提示人工核对而非默认值', () => {
  setup('')
  expect((screen.getByLabelText('导入装备品质') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  expect(screen.getByLabelText('武器面板估算').textContent).toContain('品质未知')
})

it('通货草稿、应用撤销重做显示本地物理变化', () => {
  setup()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(screen.getByRole('button', { name: /TestArmour/ }))
  const panel = () => within(screen.getByLabelText('武器面板估算'))
  expect(panel().getAllByText('22.5 → 33.75（+11.25）')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(panel().getByText('总武器 DPS：33.75')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(panel().getByText('总武器 DPS：22.5')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(panel().getByText('总武器 DPS：33.75')).toBeDefined()
})
it('含原文攻击面板的武器可核对孔位进入且不把原文数值重计', () => {
  setup(
    '\n--------\nPhysical Damage: 999-999 (augmented)\nElemental Damage: 100-200, 300-400\nCritical Hit Chance: 99%\nAttacks per Second: 9\nQuality: +20%',
  )
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: '按已核对孔位开始' }))
  expect(within(screen.getByLabelText('武器面板估算')).getByText('总武器 DPS：27')).toBeDefined()
  expect(save().initialState.sourceText).toContain('Physical Damage: 999-999 (augmented)')
})

it('特殊品质防具仍走既有防御说明', () => {
  setup(undefined, {
    ...base,
    type: 'Body Armour',
    tags: ['default'],
    implicit: 'Quality has no effect',
  })
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByLabelText('防御面板估算')).toBeDefined()
  expect(screen.queryByLabelText('武器面板估算')).toBeNull()
})
