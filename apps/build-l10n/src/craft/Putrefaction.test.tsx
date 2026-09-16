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

it('腐烂预兆取消不消费，未来步骤保存后可恢复并完成六槽揭示', () => {
  const catalog = boneCatalog()
  for (const kind of ['prefix', 'suffix'] as const) {
    const template = catalog.modifiers.find((mod) => mod.id === `${kind}4`)
    if (!template) throw Error('缺少合成词缀')
    catalog.modifiers.push({
      ...template,
      id: `${kind}5`,
      name: `${kind}5`,
      group: `${kind}5`,
      lines: [`${kind}5 (1-10)`],
    })
  }
  const initial = boneState(['prefix1', 'suffix1'])
  delete initial.sockets
  const text = exportCraftItemText(catalog, initial)
  if (!text.ok) throw Error(text.error)
  initial.sourceText = text.value.text
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initial}
      translations={{ 'Omen of Putrefaction': '腐烂预兆' }}
    />,
  )
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('使用腐烂预兆'))
  fireEvent.click(screen.getByRole('button', { name: '预览腐烂预兆结果' }))
  fireEvent.click(screen.getByRole('button', { name: '取消骨骼步骤' }))
  expect(screen.queryByText('腐烂预兆 × 1')).toBeNull()
  fireEvent.change(screen.getByLabelText('骨骼材料'), { target: { value: 'preserved_rib' } })
  fireEvent.click(screen.getByLabelText('使用腐烂预兆'))
  fireEvent.click(screen.getByRole('button', { name: '预览腐烂预兆结果' }))
  fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
  expect(document.activeElement).toBe(
    screen.getByRole('region', { name: '骨骼与揭示' }).parentElement,
  )
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
  expect(screen.getByText('剩余隐藏槽位：前缀 3，后缀 3。')).toBeDefined()
  expect(screen.getByRole('heading', { name: '前缀 3/3' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 3/3' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(
    localStorage.getItem(REHEARSAL_PROJECT_KEY),
    screen
      .queryAllByRole('alert')
      .map((node) => node.textContent)
      .join(';'),
  ).not.toBeNull()
  const future = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(future.rulesVersion).toBe('basic-2026-09-16-v91')
  expect(future.cursor).toBe(0)
  expect(future.operations[0].kind).toBe('putrefy')
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  for (const kind of ['prefix', 'suffix']) {
    for (let index = 1; index <= 3; index++) {
      for (let option = index; option <= index + 2; option++)
        fireEvent.click(screen.getByLabelText(`候选 ${kind}${option}`))
      fireEvent.click(screen.getByRole('button', { name: '预览三项候选' }))
      fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
      fireEvent.click(screen.getByRole('button', { name: `选择揭示 ${kind}${index}` }))
      fireEvent.click(screen.getByRole('button', { name: '预览揭示结果' }))
      fireEvent.click(screen.getByRole('button', { name: '应用骨骼步骤' }))
    }
  }
  expect(screen.queryByText(/^剩余隐藏槽位/)).toBeNull()
  expect(screen.getByText('腐烂预兆 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-16-v91')
  expect(saved.operations).toHaveLength(13)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByRole('heading', { name: '前缀 3/3' })).toBeDefined()
  expect(screen.getByRole('heading', { name: '后缀 3/3' })).toBeDefined()
})
