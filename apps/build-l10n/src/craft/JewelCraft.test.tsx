import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { jewelFixture } from '../../../../packages/item-core/src/jewelTestFixture'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planTargetDefinitionRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planTargetDefinitionRoutes>,
      callback: (result: ReturnType<typeof planTargetDefinitionRoutes>) => void,
    ) => {
      callback(planTargetDefinitionRoutes(...args))
      return () => {}
    },
  }
})
afterEach(cleanup)
it('空白珠宝通过目标路线到四词缀，界面容量、满位拒绝与费用同步', async () => {
  const { catalog, state } = jewelFixture()
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={{ ...state, rarity: 'normal' }}
      translations={{}}
    />,
  )
  for (const id of ['prefix1', 'prefix2', 'suffix1', 'suffix2']) {
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
  }
  fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
  const preview = await screen.findAllByRole('button', { name: '预览路线第一步' })
  fireEvent.click(preview[0] as HTMLElement)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByRole('heading', { name: '前缀 2/2' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 2/2' })).toBeDefined()
  expect(screen.getByText('点金石 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '崇高石' }))
  expect(screen.getByText('稀有装备词缀已满。')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('点金石 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByRole('heading', { name: '前缀 2/2' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(
    JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}').jewelSourceHash,
  ).toBe(catalog._meta.sources.at(-1)?.sha256)
})
