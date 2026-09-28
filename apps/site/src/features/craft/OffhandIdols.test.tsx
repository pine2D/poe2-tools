import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftResult,
  type CraftState,
  createCatalogTranslator,
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
const dictionary = createCraftItemDictionary(catalog, {
  items: JSON.parse(readFileSync('data/dict/zh-CN/items.json', 'utf8')),
  stats: JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8')),
})
const id = (name: string, category = 'shield') => `pob2:augment:${JSON.stringify([name, category])}`
const initial: CraftState = {
  baseId: 'Aged Tower Shield',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null, null],
  quality: 20,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function must<T>(result: CraftResult<T>): T {
  if (!result.ok) throw Error(result.error)
  return result.value
}
function save() {
  click('保存演练到本机')
  return must(
    parseTargetCraftProject(
      localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '',
      catalog,
      dictionary,
    ),
  ).project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const block = () => screen.getByLabelText('本件格挡率估算')

it('盾牌本件格挡随Ox变化，Silk条件不计入，取消及v113完整未来可恢复', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('26%')
  change('选择镶嵌符文', id('Ox Idol'))
  expect(block().textContent).toContain('26% → 29%')
  expect(screen.getByLabelText('镶嵌草稿').textContent).not.toContain('不计为本件防御')
  click('取消镶嵌')
  expect(save().operations).toHaveLength(0)
  change('选择镶嵌符文', id('Ox Idol'))
  click('应用镶嵌')
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('29%')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Idol of Silk'))
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('伙伴条件')
  click('应用镶嵌')
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('29%')
  change('目标孔位', '0')
  change('选择镶嵌符文', id('Idol of Greust'))
  click('应用镶嵌')
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('26%')
  click('撤销')
  const project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-18-v113')
  expect(project.cursor).toBe(2)
  expect(project.operations).toHaveLength(3)
  click('恢复本机演练')
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('29%')
  click('重做')
  expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('26%')
})

it.each([
  ['Aegis Buckler', 'buckler', 'Ox Idol', 'Idol of Greust'],
  ['Plumed Focus', 'focus', 'Owl Idol', 'Owl Idol'],
])('中文%s雕像导入可继续镶嵌，部位候选与来源历史保留', (baseId, category, first, next) => {
  const sockets = [id(first, category), null]
  const exported = must(
    exportCraftItemText(catalog, { ...initial, baseId, sockets }, { locale: 'zh-CN', dictionary }),
  )
  const parsed = parseItem(exported.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importIdentifiedCraftState(
      catalog,
      baseId,
      parsed.item,
      inspectItem(parsed.item, dictionary),
      sockets,
      undefined,
      dictionary.stats?.entries,
    ),
  )
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={catalog.localizedNames?.['zh-CN'] ?? {}}
      translateLine={createCatalogTranslator(dictionary.stats?.entries ?? [])}
      dictionary={dictionary}
      initialState={imported}
      importedSockets={sockets}
    />,
  )
  const choices = [...(screen.getByLabelText('选择镶嵌符文') as HTMLSelectElement).options].map(
    (o) => o.value,
  )
  expect(choices).toContain(id(first, category))
  expect(choices).not.toContain(id('Idol of Silk', 'buckler'))
  expect(choices).not.toContain(id('Ox Idol', 'shield'))
  change('目标孔位', '1')
  change('选择镶嵌符文', id(next, category))
  click('应用镶嵌')
  const project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-18-v113')
  expect(project.initialState.sourceText).toBe(exported.text)
  expect(project.initialState.runeSourceLines).toEqual(imported.runeSourceLines)
  expect(project.operations).toHaveLength(1)
  click('恢复本机演练')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    first === 'Owl Idol' ? '冷却' : '偏转',
  )
  if (category === 'buckler')
    expect(within(block()).getByLabelText('当前本件格挡率').textContent).toBe('23%')
  else expect(screen.queryByLabelText('本件格挡率估算')).toBeNull()
})
