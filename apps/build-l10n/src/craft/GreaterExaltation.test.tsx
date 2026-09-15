import { exportCraftItemText } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (r: ReturnType<typeof planTargetDefinitionRoutes>) => void,
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
const translations = {
  'Omen of Greater Exaltation': '强效崇高预兆',
  'Omen of Sinistral Exaltation': '左旋崇高预兆',
}
function setup() {
  const catalog = boneCatalog()
  const state = boneState(['prefix1', 'suffix1'])
  delete state.sockets
  const text = exportCraftItemText(catalog, state)
  if (!text.ok) throw Error(text.error)
  state.sourceText = text.value.text
  render(<RehearsalPanel catalog={catalog} initialState={state} translations={translations} />)
}
it('双组草稿不能提前应用，撤销选择、三项费用及项目恢复同步', () => {
  setup()
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
    target: { value: 'greater_sinistral_exaltation' },
  })
  fireEvent.click(screen.getByRole('button', { name: '崇高石' }))
  fireEvent.click(screen.getByRole('button', { name: /^prefix2 ·/ }))
  expect((screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  fireEvent.click(screen.getByRole('button', { name: /^prefix3 ·/ }))
  expect(screen.getByText('已选择 2/2')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销上一个选择' }))
  expect(screen.getByText('已选择 1/2')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: /^prefix3 ·/ }))
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  for (const name of ['崇高石', '强效崇高预兆', '左旋崇高预兆'])
    expect(screen.getByText(`${name} × 1`)).toBeDefined()
  expect(screen.getByRole('heading', { name: '前缀 3/3' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('强效崇高预兆 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByText('强效崇高预兆 × 1')).toBeDefined()
  expect(
    JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}').operations[0].omen,
  ).toBe('greater_sinistral_exaltation')
})
it('组合路线分别展示两枚预兆预计材料并可应用', async () => {
  setup()
  for (const id of ['prefix2', 'prefix3']) {
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
  }
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const buttons = await screen.findAllByRole('button', { name: '预览路线第一步' })
  const button = buttons[0]
  if (!button) throw Error('没有路线')
  const article = button.closest('article')
  if (!article) throw Error('没有路线容器')
  expect(within(article).getByText(/预计材料：.*强效崇高预兆 × 1、左旋崇高预兆 × 1/)).toBeDefined()
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('已达成 2 / 2')).toBeDefined()
})
