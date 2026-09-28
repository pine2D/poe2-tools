import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
  importIdentifiedCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const source: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = { ...source, modifiers: [] }
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'gloves'])}`
const desert = 'pob2:augment:["Desert Rune","armour"]'
const initial = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  sockets: [null, null],
  quality: 20,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  const parsed = parseTargetCraftProject(
    localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
    catalog,
  )
  if (!parsed.ok)
    throw Error(
      parsed.error +
        ' ' +
        screen
          .queryAllByRole('status')
          .map((n) => n.textContent)
          .join(' '),
    )
  return parsed.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('雕像和防具符文混合、共享限量、取消及覆盖的完整未来可恢复', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  change('选择镶嵌符文', id('Carved Majesty'))
  expect(within(screen.getByLabelText('镶嵌草稿')).getByText(/远古增幅物共用一枚限量/)).toBeTruthy()
  click('取消镶嵌')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', id('Carved Majesty'))
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('远古增幅物（共享限量）')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Carved Mischief'))
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  change('选择镶嵌符文', desert)
  click('应用镶嵌')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Companions gain Onslaught for 4 seconds on Hitting your Marked targets',
  )
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain('+14% to Fire Resistance')
  change('目标孔位', '0')
  change('选择镶嵌符文', id('Carved Tenacity'))
  click('应用镶嵌')
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v110')
  expect(saved.cursor).toBe(2)
  expect(saved.operations).toHaveLength(3)
  click('恢复本机演练')
  click('重做')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Enemies you Critically Hit get 100% reduced Life Regeneration Rate for 4 seconds',
  )
  expect(save().cursor).toBe(3)
})

it('跨名共享超限的导入可修复，保留原始观察与零起点费用', () => {
  const dictionary = createCraftItemDictionary(catalog, {})
  const sockets = [id('Carved Majesty'), id('Carved Mischief')]
  const text = exportCraftItemText(catalog, { ...initial, sockets }, { dictionary })
  if (!text.ok) throw Error(text.error)
  const parsed = parseItem(text.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importIdentifiedCraftState(
    catalog,
    initial.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    sockets,
    undefined,
    dictionary.stats?.entries,
  )
  if (!imported.ok) throw Error(imported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      dictionary={dictionary}
      initialState={imported.value}
      importedSockets={sockets}
    />,
  )
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('本件已超限')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', id('Snake Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).not.toContain('本件已超限')
  const saved = save()
  expect(saved.initialState.sourceText).toBe(text.value.text)
  expect(saved.operations).toHaveLength(1)
})
