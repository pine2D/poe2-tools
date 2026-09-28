import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogPanel } from './CatalogPanel'

const primary = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table = JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8'))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('未选基底可按需加载供恢复使用，父目录共享可信结果，展开查询不重复请求', async () => {
  const fetchImpl = vi.fn<typeof fetch>(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/catalog.json')
            ? primary
            : String(url).endsWith('/fluxes.json')
              ? table
              : null,
        ),
        { status: String(url).endsWith('/alloys.json') ? 404 : 200 },
      ),
  )
  let latest: CraftCatalog | undefined
  render(
    <CatalogPanel
      translations={{}}
      fetchImpl={fetchImpl}
      onCatalogReady={(catalog) => {
        latest = catalog
      }}
    />,
  )
  await screen.findByRole('button', { name: '加载溶剂关系' })
  expect(screen.getByRole('button', { name: '恢复本机演练' })).toBeDefined()
  expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/fluxes.json'))).toHaveLength(
    0,
  )
  fireEvent.click(screen.getByRole('button', { name: '加载溶剂关系' }))
  await waitFor(() => expect(latest?.fluxes?.rows).toHaveLength(15))
  expect(screen.getByText('溶剂关系已加载，可恢复包含转换历史的项目。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('搜索基底'), { target: { value: 'Gold Ring' } })
  const gold = await screen.findByRole('button', { name: /Gold Ring/ })
  fireEvent.click(gold)
  const details = screen.getByText('溶剂与抗性转换').closest('details')
  if (!details) throw Error('缺少溶剂目录')
  details.open = true
  fireEvent(details, new Event('toggle'))
  expect(screen.getByLabelText('搜索溶剂与转换属性')).toBeDefined()
  expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/fluxes.json'))).toHaveLength(
    1,
  )
})

it('可选表缺失不阻断项目恢复入口，显式重试后才重新请求', async () => {
  let missing = true
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/catalog.json')) return new Response(JSON.stringify(primary))
    if (String(url).endsWith('/fluxes.json') && !missing) return new Response(JSON.stringify(table))
    return new Response('', { status: 404 })
  })
  render(<CatalogPanel translations={{}} fetchImpl={fetchImpl} />)
  fireEvent.click(await screen.findByRole('button', { name: '加载溶剂关系' }))
  await screen.findByText('当前站点未提供溶剂关系表，可继续使用其他制作功能。')
  expect(screen.getByRole('button', { name: '恢复本机演练' })).toBeDefined()
  missing = false
  fireEvent.click(screen.getByRole('button', { name: '重载溶剂关系' }))
  await screen.findByText('溶剂关系已加载，可恢复包含转换历史的项目。')
  expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/fluxes.json'))).toHaveLength(
    2,
  )
})

it('已有演练加载共享关系表后，操作历史与游标保持且工作台获得溶剂入口', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/catalog.json')) return new Response(JSON.stringify(primary))
    if (String(url).endsWith('/fluxes.json')) return new Response(JSON.stringify(table))
    return new Response('', { status: 404 })
  })
  render(
    <CatalogPanel
      translations={{}}
      fetchImpl={fetchImpl}
      initialBaseId="Gold Ring"
      initialItemLevel={86}
    />,
  )
  fireEvent.click(await screen.findByRole('button', { name: '从空白基底开始' }))
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'ColdResist4' } })
  const candidate = screen
    .getAllByText('ColdResist4')
    .map((node) => node.closest('button.rehearsal-candidate'))
    .find((node) => node !== null)
  if (!candidate) throw Error('缺少普通冰抗候选')
  fireEvent.click(candidate)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const before = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(before.cursor).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: '加载溶剂关系' }))
  await screen.findByText('溶剂关系已加载，可恢复包含转换历史的项目。')
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const after = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(after.initialState).toEqual(before.initialState)
  expect(after.operations).toEqual(before.operations)
  expect(after.cursor).toBe(before.cursor)
  expect(
    (screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }) as HTMLButtonElement).disabled,
  ).toBe(false)
})
