import { readFileSync } from 'node:fs'
import {
  alloyCatalogSignature,
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseCraftProject,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { alloyTestFixture } from '../../../../packages/item-core/src/alloyTestFixture'
import { AlloyCraftPanel } from './AlloyCraftPanel'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog = { ...primary, alloys: alloyTestFixture() }
const source: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  affixes: [
    { modId: 'IncreasedLife1', lines: ['+19(10-19) to maximum Life'] },
    { modId: 'FireResist1', lines: ['+9(6-10)% to Fire Resistance'] },
  ],
}
function imported() {
  const text = exportCraftItemText(catalog, source)
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const state = importCraftState(
    catalog,
    source.baseId,
    parsed.item,
    inspectItem(parsed.item, createCraftItemDictionary(catalog, {})),
  )
  if (!state.ok) throw Error(state.error)
  return state.value
}
const click = (name: string) => {
  const button = screen.getByRole('button', { name })
  button.focus()
  fireEvent.click(button)
}

it('合金取消不计费，应用后保存完整未来历史与签名，撤销重做及恢复一致', () => {
  render(<RehearsalPanel catalog={catalog} initialState={imported()} translations={{}} />)
  click('选择合金 符文合金')
  fireEvent.change(screen.getByLabelText('合金移除结果'), { target: { value: 'IncreasedLife1' } })
  click('预览合金结果')
  expect(screen.getByRole('region', { name: '合金待应用结果' })).toBe(document.activeElement)
  click('取消合金结果')
  expect(document.activeElement?.textContent).toBe('合金制作')
  expect(screen.queryByText('符文合金 × 1')).toBeNull()
  click('选择合金 符文合金')
  fireEvent.change(screen.getByLabelText('合金移除结果'), { target: { value: 'IncreasedLife1' } })
  click('预览合金结果')
  click('应用合金结果')
  expect(screen.getByText('符文合金 × 1')).toBeDefined()
  click('撤销')
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.cursor).toBe(0)
  expect(saved.operations).toHaveLength(1)
  expect(saved.alloyCatalogSignature).toBe(alloyCatalogSignature(catalog))
  expect(parseCraftProject(JSON.stringify(saved), catalog).ok).toBe(true)
  expect(screen.queryByText('符文合金 × 1')).toBeNull()
  click('重做')
  expect(screen.getByText('符文合金 × 1')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('演练项目已恢复。')).toBeDefined()
})

it('目标风险与物等限制可读，材料切换不会沿用非法移除对象', () => {
  const preview = vi.fn()
  const props = {
    catalog,
    state: source,
    translations: {},
    disabled: false,
    onPreview: preview,
    targetModIds: ['FireResist1'],
  }
  const view = render(<AlloyCraftPanel {...props} />)
  click('选择合金 符文合金')
  expect(screen.getByText('可能移除已有目标：FireResist1')).toBeDefined()
  fireEvent.change(screen.getByLabelText('合金移除结果'), { target: { value: 'FireResist1' } })
  expect(screen.getByText('本次将移除已有目标：FireResist1')).toBeDefined()
  click('选择合金 君王合金')
  expect((screen.getByLabelText('合金移除结果') as HTMLSelectElement).value).toBe('')
  expect((screen.getByRole('button', { name: '预览合金结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  view.rerender(<AlloyCraftPanel {...props} state={{ ...source, itemLevel: 12 }} />)
  expect(screen.getAllByText(/低物等交互尚未验证/).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: '预览合金结果' })).toBeNull()
  expect(preview).not.toHaveBeenCalled()
})

it('只填火抗有效值即可预览君王建议，应用与保存恢复保留原目标口径', () => {
  render(<RehearsalPanel catalog={catalog} initialState={imported()} translations={{}} />)
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'FireResist1' } })
  click('加入目标 FireResist1')
  click('设置数值条件 FireResist1')
  fireEvent.change(screen.getByLabelText('FireResist1 · 条件口径'), {
    target: { value: 'effective' },
  })
  fireEvent.change(screen.getByLabelText('FireResist1 · 数值 1 最小值'), {
    target: { value: '11' },
  })
  click('保存数值条件 FireResist1')
  const advice = screen.getByRole('region', { name: '合金目标建议' })
  expect(within(advice).getAllByText('君王合金').length).toBeGreaterThan(0)
  expect(
    within(advice).getAllByText('应用后达成 1 组目标；新增达成 1 组。').length,
  ).toBeGreaterThan(0)
  fireEvent.click(
    within(advice).getAllByRole('button', { name: '演练此合金结果' })[0] as HTMLButtonElement,
  )
  expect(screen.getByRole('region', { name: '合金待应用结果' })).toBeDefined()
  expect(screen.queryByText('君王合金 × 1')).toBeNull()
  click('应用合金结果')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  expect(screen.getByText('君王合金 × 1')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.targetModIds).toEqual(['FireResist1'])
  expect(saved.targetValues[0].basis).toBe('effective')
  expect(saved.alloyCatalogSignature).toBe(alloyCatalogSignature(catalog))
  expect(saved.scalabilitySourceHash).toBeTruthy()
  click('撤销')
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
})
