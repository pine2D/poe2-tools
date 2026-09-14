import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { AlloyCatalog } from './AlloyCatalog'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const table = alloyTestFixture()
function getBase(type: string) {
  const base = catalog.bases.find((entry) => entry.type === type)
  if (!base) throw new Error(`缺少测试基底 ${type}`)
  return base
}
const ring = getBase('Ring')
const wand = getBase('Wand')
const reply = () => Promise.resolve(new Response(JSON.stringify(table)))
const open = () => {
  const details = screen.getByText('合金与保证属性').closest('details')
  if (!details) throw new Error('合金目录缺少展开控件')
  details.open = true
  fireEvent(details, new Event('toggle'))
}
afterEach(cleanup)

it('首次展开只请求本站一次，搜索中文名与属性，切基底不会沿用旧结果', async () => {
  const fetchImpl = vi.fn<typeof fetch>(reply)
  const view = render(<AlloyCatalog catalog={catalog} base={ring} fetchImpl={fetchImpl} />)
  expect(fetchImpl).not.toHaveBeenCalled()
  open()
  await screen.findByText('符文合金')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0]?.[0]).toBe('/craft-data/alloys.json')
  fireEvent.change(screen.getByLabelText('搜索合金与保证属性'), { target: { value: '迅捷' } })
  expect(screen.getByText('Swift Alloy')).toBeDefined()
  expect(screen.queryByText('Runic Alloy')).toBeNull()
  fireEvent.change(screen.getByLabelText('搜索合金与保证属性'), { target: { value: '' } })
  view.rerender(<AlloyCatalog catalog={catalog} base={wand} fetchImpl={fetchImpl} />)
  expect(screen.queryByText('Runic Alloy')).toBeNull()
  expect(screen.getByText('Transcendent Alloy')).toBeDefined()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/合金替换模拟尚未接入/)).toBeDefined()
})

it('台服名称独立显示，译文可搜索，缺失保留提示', async () => {
  const sceptre = getBase('Sceptre')
  render(
    <AlloyCatalog
      catalog={catalog}
      base={sceptre}
      locale="zh-TW"
      fetchImpl={vi.fn(reply)}
      translateLine={(line) => (line.includes('maximum stacks') ? '傀儡大師層數上限測試' : null)}
    />,
  )
  open()
  const localizedName = catalog.localizedNames?.['zh-TW']['Adaptive Alloy']
  if (!localizedName) throw new Error('缺少台服合金测试名称')
  await screen.findByText(localizedName)
  expect(screen.getByText(/当前授权属性快照中未对应/)).toBeDefined()
  fireEvent.change(screen.getByLabelText('搜索合金与保证属性'), { target: { value: '傀儡大師' } })
  expect(screen.getByText("The Runebinder's Alloy")).toBeDefined()
  expect(screen.queryByText('Adaptive Alloy')).toBeNull()
})

it('灰区表缺失或损坏可重试，不阻断主目录', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('', { status: 404 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...table, _meta: {} })))
    .mockImplementation(reply)
  render(<AlloyCatalog catalog={catalog} base={ring} fetchImpl={fetchImpl} />)
  open()
  await screen.findByText(/当前站点未提供合金关系表/)
  fireEvent.click(screen.getByRole('button', { name: '重试合金目录' }))
  await screen.findByText(/合金目录加载失败/)
  fireEvent.click(screen.getByRole('button', { name: '重试合金目录' }))
  await screen.findByText('符文合金')
  await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3))
})
