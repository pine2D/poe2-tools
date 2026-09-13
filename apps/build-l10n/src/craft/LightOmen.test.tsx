import {
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { RehearsalPanel } from './RehearsalPanel'
import { TargetRoutesPanel } from './TargetRoutesPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planCraftTargetRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planCraftTargetRoutes>,
      callback: (result: ReturnType<typeof planCraftTargetRoutes>) => void,
    ) => {
      callback(planCraftTargetRoutes(...args))
      return () => {}
    },
  }
})
afterEach(cleanup)

it('允许牺牲亵渎目标时，光明首步显示确定损失而非随机移除警告', async () => {
  const { catalog, state } = fixture()
  const affix = state.affixes[2]
  if (!affix) throw Error('fixture')
  affix.modId = 'suffix1'
  affix.lines = ['suffix1 5']
  render(
    <TargetRoutesPanel
      catalog={catalog}
      state={state}
      ids={['prefix1', 'suffix1', 'exclusive1']}
      values={[]}
      alternatives={[]}
      busy={false}
      translations={{ 'Omen of Light': '光明预兆' }}
      onPreview={() => {}}
    />,
  )
  fireEvent.click(screen.getByLabelText('保留当前已达成目标'))
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  await screen.findAllByText(/光明预兆 × 1/)
  const first = screen.getAllByRole('article')[0]?.querySelector('li')
  if (!first) throw Error('缺少首步')
  expect(first.textContent).toContain('光明预兆')
  expect(first.textContent).toContain('指定结果丢失目标')
  expect(first.textContent).not.toContain('随机移除池')
})

function fixture() {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'prefix2', 'exclusive2', 'suffix2'])
  const affix = state.affixes[2]
  if (!affix) throw Error('fixture')
  affix.desecrated = true
  return { catalog, state }
}

it('中文光明只提供亵渎组，应用和撤销同步来源、历史和两项费用', () => {
  const { catalog, state } = fixture()
  const exported = exportCraftItemText(catalog, state)
  if (!exported.ok) throw Error(exported.error)
  const parsed = parseItem(exported.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const dictionary = { items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} } }
  const initial = importCraftState(
    catalog,
    'Synthetic Base',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!initial.ok) throw Error(initial.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial.value}
      translations={{ 'Omen of Light': '光明预兆' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), { target: { value: 'light' } })
  expect(screen.getByText(/移除后可重新施加骨骼/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '剥离石' }))
  const removal = screen.getByRole('region', { name: '选择要移除的词缀' })
  expect(within(removal).getAllByRole('button', { name: /移除.*组/ })).toHaveLength(1)
  expect(within(removal).queryByText('prefix1')).toBeNull()
  fireEvent.click(within(removal).getByRole('button', { name: /移除.*组/ }))
  expect(screen.queryByText('光明预兆 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('光明预兆 × 1')).toBeDefined()
  expect(screen.getByText('剥离石 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('光明预兆 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('光明预兆 × 1')).toBeDefined()
})

it('重新亵渎路线显示光明规则、材料并预览真实剥离步骤', async () => {
  const { catalog, state } = fixture()
  const preview = vi.fn()
  render(
    <TargetRoutesPanel
      catalog={catalog}
      state={state}
      ids={['prefix1', 'suffix2', 'exclusive1']}
      values={[]}
      alternatives={[]}
      busy={false}
      translations={{ 'Omen of Light': '光明预兆' }}
      onPreview={preview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  expect((await screen.findAllByText(/光明预兆 × 1/)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(/移除后可重新施加骨骼/).length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByRole('button', { name: '预览路线第一步' })[0] as HTMLElement)
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({ currency: 'annulment', omen: 'light', removeModId: 'exclusive2' }),
  )
})
