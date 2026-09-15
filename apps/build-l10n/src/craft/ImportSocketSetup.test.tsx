import { type CraftCatalog, inspectItem, parseItem } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const base = {
  id: 'Test Helmet',
  name: 'Test Helmet',
  type: 'Helmet',
  tags: ['default'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: 3,
  hidden: false,
  runeforged: false,
}
const rune = {
  id: 'test-fire',
  name: 'Lesser Desert Rune',
  category: 'armour',
  type: 'Rune' as const,
  localMod: false,
  lines: ['+10% to Fire Resistance'],
  statOrder: [1],
  tradeHashes: {},
  levelReq: 0,
}
const catalog: CraftCatalog = {
  bases: [base],
  modifiers: [],
  augments: [rune],
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
function setup(extra = '', rarity = 'Normal') {
  const text = `Item Class: Helmets\nRarity: ${rarity}\nTest Helmet\n--------\nItem Level: 12${extra}`
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {})
  return render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={12}
      imported={{
        baseId: base.id,
        item: parsed.item,
        mods: inspection.mods,
        runes: inspection.runes,
        comparisonOnly: inspection.comparisonOnly,
      }}
      translations={{ 'Lesser Desert Rune': '次级沙漠符文' }}
      translateLine={undefined}
      dictionary={{ items: { bases: { 'Test Helmet': '测试头盔' }, uniques: {} } }}
      onRestore={vi.fn()}
    />,
  )
}

it('腐化导入允许额外第三孔，搜索起点仍只允许两个未腐化已有孔', () => {
  setup('\n--------\nSockets: S S S\n--------\nCorrupted')
  expect((screen.getByLabelText('起点已有空孔数') as HTMLSelectElement).options).toHaveLength(3)
  expect(screen.queryByText('孔数超过当前支持范围，暂时只能对照。')).toBeNull()
  for (let index = 1; index <= 3; index++) {
    fireEvent.change(screen.getByLabelText(`核对孔位 ${index}`), { target: { value: 'empty' } })
  }
  fireEvent.click(screen.getByRole('button', { name: '按已核对孔位开始' }))
  expect(screen.getByRole('region', { name: '腐化状态' })).toBeDefined()
  expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(true)
})

it('原文符文总和必须匹配，保存原始效果且初始两枚符文不重复计费', () => {
  setup('\n--------\nSockets: S S\n--------\n+20% to Fire Resistance (rune)')
  fireEvent.change(screen.getByLabelText('核对孔位 1'), { target: { value: rune.id } })
  fireEvent.change(screen.getByLabelText('核对孔位 2'), { target: { value: 'empty' } })
  const begin = screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement
  expect(begin.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('核对孔位 2'), { target: { value: rune.id } })
  expect(begin.disabled).toBe(false)
  fireEvent.click(begin)
  expect(screen.getByText(/原文符文效果已核对/)).toBeDefined()
  expect(screen.getByText('孔位 1 · 次级沙漠符文')).toBeDefined()
  expect(screen.getByText('孔位 2 · 次级沙漠符文')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.initialState.runeSourceLines).toEqual(['+20% to Fire Resistance'])
  expect(saved.operations).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText(/原文符文效果已核对/)).toBeDefined()
})

it('缺行默认未知，明确零孔后可打孔并保存声明，普通起点恢复后清除声明', () => {
  setup()
  expect((screen.getByLabelText('导入装备孔数') as HTMLSelectElement).value).toBe('')
  const begin = screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement
  expect(begin.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '0' } })
  fireEvent.click(begin)
  expect(screen.getByText(/孔位由用户核对/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '巧匠石：添加一个孔' }))
  fireEvent.click(screen.getByRole('button', { name: '应用打孔' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.importedSockets).toEqual([])
  expect(saved.initialState.sockets).toEqual([])
  expect(saved.operations).toEqual([{ kind: 'artificer' }])
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.queryByText(/孔位由用户核对/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText(/孔位由用户核对/)).toBeDefined()
  expect(screen.getByText('孔位 1 · 空孔')).toBeDefined()
})

it('原文 S 只固定数量，每孔显式核对，初始符文不计入花费', () => {
  setup('\n--------\nSockets: S S')
  expect(screen.getByText(/原文记录了 2 个孔/)).toBeDefined()
  const begin = screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement
  expect(begin.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('核对孔位 1'), { target: { value: rune.id } })
  expect(begin.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('核对孔位 2'), { target: { value: 'empty' } })
  fireEvent.click(begin)
  expect(screen.getByText('孔位 1 · 次级沙漠符文')).toBeDefined()
  expect(
    within(screen.getByRole('region', { name: '已消耗材料' })).queryByText(/次级沙漠符文 × 1/),
  ).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.importedSockets).toEqual([rune.id, null])
  expect(saved.initialState.sockets).toEqual([rune.id, null])
  expect(saved.operations).toEqual([])
})

it('重新编辑孔数会清空旧孔内选择，重置核对不改变已开始的演练', () => {
  setup()
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '1' } })
  fireEvent.change(screen.getByLabelText('核对孔位 1'), { target: { value: rune.id } })
  fireEvent.click(screen.getByRole('button', { name: '按已核对孔位开始' }))
  fireEvent.click(screen.getByRole('button', { name: '重置孔位核对' }))
  expect(screen.getByText('孔位 1 · 次级沙漠符文')).toBeDefined()
  fireEvent.change(screen.getByLabelText('导入装备孔数'), { target: { value: '1' } })
  expect((screen.getByLabelText('核对孔位 1') as HTMLSelectElement).value).toBe('')
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

it('传奇不能显示孔位核对入口，未知结构也不能通过手工声明绕过', () => {
  const first = setup('\n--------\nSockets: S', 'Unique')
  expect(screen.queryByRole('button', { name: '按已核对孔位开始' })).toBeNull()
  first.unmount()
  setup('\n--------\nSockets: S\n--------\nUnmodelled effect')
  fireEvent.change(screen.getByLabelText('核对孔位 1'), { target: { value: 'empty' } })
  expect(
    (screen.getByRole('button', { name: '按已核对孔位开始' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
