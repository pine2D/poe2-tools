import { inspectItem, parseItem, parseTargetCraftProject } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  beltCatalog,
  beltSource,
  required,
} from '../../../../packages/item-core/src/beltTestFixture'
import { CatalogPanel } from './CatalogPanel'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (value: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return () => {}
    },
  }
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function start(itemLevel = 30, fixed = false) {
  const catalog = beltCatalog(fixed)
  return render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={itemLevel}
      imported={undefined}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
}
it('搜索30级两栏起点、神圣范围、保存撤销和恢复使用同一槽状态', () => {
  start()
  fireEvent.change(screen.getByLabelText('起点咒符栏数'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByText('咒符栏：2；可重掷范围：1–2。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  const slot = screen.getByLabelText('固有属性 · 数值 1') as HTMLInputElement
  expect(slot.max).toBe('2')
  fireEvent.change(slot, { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('咒符栏：1；可重掷范围：1–2。')).toBeDefined()
  expect(screen.getByText('神圣石 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.initialState.implicitLines[0]).toBe('Has 2(1-2) Charm Slot')
  expect(project.operations[0].implicitValues[0]).toBe(1)
  expect(parseTargetCraftProject(JSON.stringify(project), beltCatalog()).ok).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('咒符栏：2；可重掷范围：1–2。')).toBeDefined()
  expect(screen.queryByText('神圣石 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('咒符栏：1；可重掷范围：1–2。')).toBeDefined()
})

it('目录物等和基底切换重置起点与旧历史，只显示合法栏数', async () => {
  const catalog = beltCatalog()
  catalog._meta.excludedDesecratedMods = []
  const second = { ...required(catalog.bases[0]), id: 'Second Belt', name: 'Second Belt' }
  catalog.bases.push(second)
  render(
    <CatalogPanel
      translations={{}}
      initialBaseId="Synthetic Base"
      initialItemLevel={60}
      fetchImpl={vi.fn<typeof fetch>(
        async () => ({ ok: true, json: async () => catalog }) as Response,
      )}
    />,
  )
  const select = await screen.findByLabelText('起点咒符栏数')
  expect(within(select).getAllByRole('option')).toHaveLength(3)
  fireEvent.change(select, { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByText('咒符栏：3；可重掷范围：1–3。')).toBeDefined()
  fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '29' } })
  expect(screen.queryByLabelText('通货演练')).toBeNull()
  expect(within(screen.getByLabelText('起点咒符栏数')).getAllByRole('option')).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '30' } })
  const next = screen.getByLabelText('起点咒符栏数') as HTMLSelectElement
  expect(next.value).toBe('1')
  expect(within(next).getAllByRole('option')).toHaveLength(2)
  fireEvent.change(next, { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: /Second Belt/ }))
  expect((screen.getByLabelText('起点咒符栏数') as HTMLSelectElement).value).toBe('1')
})

function startImported(slot = '2(1-2)', rare = false) {
  const source = beltSource('zh-CN', slot, 80)
  const parsed = parseItem(
    source.item.rawText.replace('稀有度: 普通', rare ? '稀有度: 稀有' : '稀有度: 普通'),
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, source.dictionary)
  const catalog = beltCatalog()
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={80}
      imported={{
        baseId: 'Synthetic Base',
        item: parsed.item,
        mods: inspection.mods,
        skills: inspection.skills,
        runes: inspection.runes,
      }}
      translations={{}}
      translateLine={undefined}
      dictionary={source.dictionary}
      onRestore={vi.fn()}
    />,
  )
}
it('中文旧cap2导入不读取搜索声明，神圣控件仍限制2', () => {
  startImported()
  fireEvent.change(screen.getByLabelText('起点咒符栏数'), { target: { value: '3' } })
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  expect(screen.getByText('咒符栏：2；可重掷范围：1–2。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect((screen.getByLabelText('固有属性 · 数值 1') as HTMLInputElement).max).toBe('2')
  fireEvent.change(screen.getByLabelText('固有属性 · 数值 1'), { target: { value: '3' } })
  expect((screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
})
it('plain未知范围明确禁用神圣，骨骼可继续并保存完整原文', () => {
  startImported('2', true)
  fireEvent.click(screen.getByRole('button', { name: '从当前装备开始' }))
  expect(screen.getByText(/咒符栏：2；原文未提供范围/)).toBeDefined()
  expect((screen.getByRole('button', { name: '神圣石' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_collarbone' } })
  fireEvent.click(screen.getByLabelText('占用后缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.initialState.implicitLines[0]).toBe('Has 2 Charm Slot')
  expect(saved.initialState.sourceText).toContain('具有 2 个咒符栏')
  expect(saved.operations[0].kind).toBe('desecrate')
  expect(
    parseTargetCraftProject(
      JSON.stringify(saved),
      beltCatalog(),
      beltSource('zh-CN', '2', 80).dictionary,
    ).ok,
  ).toBe(true)
  for (const id of ['suffix1', 'exclusive1', 'exclusive2'])
    fireEvent.click(screen.getByLabelText(`候选 ${id}`))
  fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  fireEvent.click(screen.getByRole('button', { name: '选择揭示 exclusive1' }))
  fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(screen.getByText(/咒符栏：2；原文未提供范围/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('未揭示亵渎后缀')).toBeDefined()
})
it('固定1栏高物等不出现搜索选项，神圣只重掷其他固有', () => {
  start(80, true)
  expect(screen.queryByLabelText('起点咒符栏数')).toBeNull()
  expect(screen.getByText('起点咒符栏：固定 1 栏，不随物品等级增加。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByText('咒符栏：固定 1 栏，不随物品等级增加。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect(within(screen.getByLabelText('固有属性数值')).getAllByRole('spinbutton')).toHaveLength(1)
  expect((screen.getByLabelText('固有属性 · 数值 1') as HTMLInputElement).max).toBe('20')
})

it('传奇腰带不开放槽声明或制作入口', () => {
  const catalog = beltCatalog()
  const source = beltSource('zh-CN')
  const parsed = parseItem(source.item.rawText.replace('稀有度: 普通', '稀有度: 传奇'))
  if (!parsed.ok) throw new Error(parsed.error)
  render(
    <CraftEntry
      catalog={catalog}
      base={required(catalog.bases[0])}
      itemLevel={80}
      imported={{
        baseId: 'Synthetic Base',
        item: parsed.item,
        mods: inspectItem(parsed.item, source.dictionary).mods,
      }}
      translations={{}}
      translateLine={undefined}
      dictionary={source.dictionary}
      onRestore={vi.fn()}
    />,
  )
  expect(screen.queryByLabelText('起点咒符栏数')).toBeNull()
  expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
})
