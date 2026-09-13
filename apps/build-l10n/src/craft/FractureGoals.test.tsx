import {
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

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
afterEach(() => {
  cleanup()
  localStorage.clear()
})
function start() {
  const catalog = boneCatalog('Ring')
  const dictionary = { items: { bases: { 'Synthetic Base': 'Synthetic Base' }, uniques: {} } }
  const source = exportCraftItemText(
    catalog,
    boneState(['prefix1', 'prefix2', 'suffix1', 'suffix2']),
  )
  if (!source.ok) throw new Error(source.error)
  const parsed = parseItem(source.value.text)
  if (!parsed.ok) throw new Error(parsed.error)
  const imported = importCraftState(
    catalog,
    'Synthetic Base',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!imported.ok) throw new Error(imported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={imported.value}
      translations={{ 'Fracturing Orb': '破溃宝珠' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'prefix1' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 prefix1' }))
}

it('已有数值目标增加破裂要求后未达成，保存恢复并应用破裂才完成', () => {
  start()
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  expect(screen.getByText('此组身份与数值条件已满足，可演练锁定。')).toBeDefined()
  expect(screen.queryByText('此组已达成目标，可演练锁定。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').targetFracturedModId).toBe(
    'prefix1',
  )
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect((screen.getByLabelText('要求破裂 prefix1') as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '预览破裂 prefix1' }))
  expect(screen.getByText('破裂目标：未达成 → 已达成')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用破裂步骤' }))
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
})

it('破裂目标改变清理草稿，删除目标同步清除项目要求', () => {
  start()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  expect(screen.queryByLabelText('本次指定结果')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '移除目标 prefix1' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')).not.toHaveProperty(
    'targetFracturedModId',
  )
})

it('破裂要求可切换到另一组，保留已选择的全部普通目标', () => {
  start()
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'suffix1' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 suffix1' }))
  fireEvent.click(screen.getByLabelText('要求破裂 suffix1'))
  expect((screen.getByLabelText('要求破裂 prefix1') as HTMLInputElement).checked).toBe(false)
  expect((screen.getByLabelText('要求破裂 suffix1') as HTMLInputElement).checked).toBe(true)
  expect(screen.getByText('已达成 1 / 2')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')).toMatchObject({
    targetModIds: ['prefix1', 'suffix1'],
    targetFracturedModId: 'suffix1',
  })
})

it('路线展示真实破裂材料和随机候选，预览首步不消费', async () => {
  start()
  fireEvent.click(screen.getByLabelText('要求破裂 prefix1'))
  const region = screen.getByLabelText('多步示例路线')
  fireEvent.click(within(region).getByRole('button', { name: '生成多步示例路线' }))
  expect(await within(region).findByText(/破溃宝珠 × 1/)).toBeDefined()
  expect(within(region).getAllByText(/游戏随机锁定/).length).toBeGreaterThan(0)
  fireEvent.click(
    within(region).getAllByRole('button', { name: /预览路线第一步/ })[0] as HTMLElement,
  )
  expect(screen.getByLabelText('破裂待应用结果')).toBeDefined()
  expect(screen.queryByText('破溃宝珠 × 1')).toBeNull()
})
