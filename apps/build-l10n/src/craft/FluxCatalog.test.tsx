import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FluxCatalog } from './FluxCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table = JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
function getBase(type: string) {
  const base = catalog.bases.find((entry) => entry.type === type)
  if (!base) throw new Error(`缺少测试基底 ${type}`)
  return base
}
const ring = getBase('Ring')
const shield = getBase('Shield')
const jewel = getBase('Jewel')
const reply = () => Promise.resolve(new Response(JSON.stringify(table)))
function open() {
  const details = screen.getByText('溶剂与抗性转换').closest('details')
  if (!details) throw new Error('溶剂目录缺少展开控件')
  details.open = true
  fireEvent(details, new Event('toggle'))
}
afterEach(cleanup)

it('展开后才请求同源表，材料与属性可用中英文搜索，查询不提供执行按钮', async () => {
  const fetchImpl = vi.fn<typeof fetch>(reply)
  render(
    <FluxCatalog
      catalog={catalog}
      base={ring}
      fetchImpl={fetchImpl}
      translateLine={(line) => (line.includes('Cold Resistance') ? '冰霜抗性测试' : null)}
    />,
  )
  expect(fetchImpl).not.toHaveBeenCalled()
  open()
  await screen.findByLabelText('搜索溶剂与转换属性')
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/craft-data/fluxes.json'])
  expect(
    screen.getByText('转换关系用于查询；具体演练资格以当前装备的溶剂制作面板为准。'),
  ).toBeDefined()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  const search = screen.getByLabelText('搜索溶剂与转换属性')
  fireEvent.change(search, { target: { value: '炽焰 冰霜抗性测试' } })
  expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Blazing Flux').length).toBeGreaterThan(0)
  expect(screen.queryByText('Void Flux')).toBeNull()
  expect(screen.getAllByText('冰霜 → 火焰').length).toBeGreaterThan(0)
  fireEvent.change(search, { target: { value: 'Void Chaos Resistance' } })
  expect(screen.getAllByText('Void Flux').length).toBeGreaterThan(0)
  expect(screen.queryByText('Blazing Flux')).toBeNull()
  expect(screen.queryByText(/混沌 →/)).toBeNull()
})

it('台服沿独立译名搜索，不借用国服名称', async () => {
  render(<FluxCatalog catalog={catalog} base={ring} locale="zh-TW" fetchImpl={vi.fn(reply)} />)
  open()
  await screen.findByLabelText('搜索溶剂与转换属性')
  fireEvent.change(screen.getByLabelText('搜索溶剂与转换属性'), { target: { value: '烈火熔劑' } })
  expect(screen.getAllByText('Blazing Flux').length).toBeGreaterThan(0)
  expect(screen.queryByText('炽焰溶剂')).toBeNull()
  expect(screen.queryByText('Void Flux')).toBeNull()
})

it('同文最大抗性按基底域隔离，基底切换即更新且不重新下载', async () => {
  const fetchImpl = vi.fn<typeof fetch>(reply)
  const view = render(<FluxCatalog catalog={catalog} base={shield} fetchImpl={fetchImpl} />)
  open()
  await screen.findByLabelText('搜索溶剂与转换属性')
  const search = screen.getByLabelText('搜索溶剂与转换属性')
  fireEvent.change(search, { target: { value: 'Void +1% Maximum' } })
  const equipmentRows = screen.getAllByRole('article')
  expect(equipmentRows).toHaveLength(3)
  for (const row of equipmentRows) {
    expect(within(row).getAllByText('词缀等级 68')).toHaveLength(2)
    expect(within(row).queryByText('词缀等级 1')).toBeNull()
  }
  view.rerender(<FluxCatalog catalog={catalog} base={jewel} fetchImpl={fetchImpl} />)
  const jewelRows = screen.getAllByRole('article')
  expect(jewelRows).toHaveLength(3)
  for (const row of jewelRows) {
    expect(within(row).getAllByText('词缀等级 1')).toHaveLength(2)
    expect(within(row).queryByText('词缀等级 68')).toBeNull()
  }
  view.rerender(<FluxCatalog catalog={catalog} base={getBase('Charm')} fetchImpl={fetchImpl} />)
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

it('缺失的目标属性保持未解析，其他已解析关系仍可查询', async () => {
  const incomplete = structuredClone(table)
  incomplete.rows[0].members.chaos.modId = null
  render(
    <FluxCatalog
      catalog={catalog}
      base={ring}
      fetchImpl={vi.fn(async () => new Response(JSON.stringify(incomplete)))}
    />,
  )
  open()
  await screen.findByLabelText('搜索溶剂与转换属性')
  fireEvent.change(screen.getByLabelText('搜索溶剂与转换属性'), {
    target: { value: 'Void (6-10)' },
  })
  expect(screen.getAllByText('目标属性缺失')).toHaveLength(3)
  expect(screen.queryByText('已解析')).toBeNull()
  fireEvent.change(screen.getByLabelText('搜索溶剂与转换属性'), {
    target: { value: 'Blazing (6-10)' },
  })
  expect(screen.getAllByText('已解析')).toHaveLength(2)
})

it('404 与坏表均可重试，不阻断旁边的工具', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...table, _meta: {} })))
    .mockImplementation(reply)
  render(
    <>
      <button type="button">其他工具</button>
      <FluxCatalog catalog={catalog} base={ring} fetchImpl={fetchImpl} />
    </>,
  )
  open()
  await screen.findByText(/当前站点未提供溶剂关系表/)
  expect(screen.getByRole('button', { name: '其他工具' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重试溶剂目录' }))
  await screen.findByText(/溶剂目录加载失败/)
  fireEvent.click(screen.getByRole('button', { name: '重试溶剂目录' }))
  await screen.findByLabelText('搜索溶剂与转换属性')
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
  expect(screen.queryByRole('button', { name: '重试溶剂目录' })).toBeNull()
})
