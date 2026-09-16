import { exportCraftItemText } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { boneCatalog, boneState } from '../../../../packages/item-core/src/boneTestFixture'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('未揭示时可预览双后缀崇高，取消不消费，应用后保存完整未来与撤销恢复', () => {
  const catalog = boneCatalog()
  const template = catalog.modifiers[0]
  if (!template) throw Error('缺少合成词缀')
  catalog.modifiers.push({
    ...template,
    id: 'prefix5',
    group: 'prefix5',
    name: 'prefix5',
    lines: ['prefix5 (1-10)'],
  })
  const initial = boneState(['prefix1', 'prefix2', 'suffix1'])
  delete initial.sockets
  const text = exportCraftItemText(catalog, initial)
  if (!text.ok) throw Error(text.error)
  initial.sourceText = text.value.text
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial}
      translations={{ 'Omen of Greater Exaltation': '强效崇高预兆' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('占用前缀'))
  fireEvent.click(screen.getByRole('button', { name: '预览骨骼结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect((screen.getByRole('button', { name: '崇高石' }) as HTMLButtonElement).disabled).toBe(false)
  expect((screen.getByRole('button', { name: '剥离石' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByLabelText('通货层级') as HTMLSelectElement).disabled).toBe(false)
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
    target: { value: 'greater_exaltation' },
  })
  fireEvent.click(screen.getByRole('button', { name: '崇高石' }))
  fireEvent.click(screen.getByRole('button', { name: /^suffix2 ·/ }))
  expect((screen.getByLabelText('通货层级') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
  expect(screen.queryByText('强效崇高预兆 × 1')).toBeNull()
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '崇高石' }))
  fireEvent.click(screen.getByRole('button', { name: /^suffix2 ·/ }))
  fireEvent.click(screen.getByRole('button', { name: /^suffix3 ·/ }))
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
  expect(screen.getByText('强效崇高预兆 × 1')).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 3/3' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v90')
  expect(saved.cursor).toBe(1)
  expect(saved.operations).toHaveLength(2)
  expect(screen.queryByText('强效崇高预兆 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByRole('heading', { name: '后缀 3/3' })).toBeDefined()
  expect(screen.getByText('未揭示亵渎前缀')).toBeDefined()
})
