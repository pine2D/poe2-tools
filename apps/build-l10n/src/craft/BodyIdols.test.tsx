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
const id = (name: string, category = 'body armour') =>
  `pob2:augment:${JSON.stringify([name, category])}`
const initial: CraftState = {
  baseId: "Adherent's Raiment",
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
  sockets: [null, null, null],
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
const resistance = (name: string) =>
  within(screen.getByLabelText('装备抗性合计'))
    .getByRole('heading', { name: `${name}（%）` })
    .closest('article')
    ?.querySelector('strong')?.textContent
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('胸甲雕像绑定由Fox开启和移除，普通符文不激活，取消与完整未来可恢复', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  change('选择镶嵌符文', id('Panther Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('孔位 1 绑定效果').textContent).toContain('未激活')
  expect(resistance('混沌抗性')).toBe('0%')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Fox Idol'))
  expect(screen.getByLabelText('镶嵌草稿').textContent).toContain('包括本枚')
  click('取消镶嵌')
  expect(save().operations).toHaveLength(1)
  expect(resistance('混沌抗性')).toBe('0%')
  change('选择镶嵌符文', id('Fox Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('孔位 1 绑定效果').textContent).toContain('已激活')
  expect(screen.getByLabelText('孔位 2 绑定效果').textContent).toContain('已激活')
  expect(resistance('混沌抗性')).toBe('8%')
  change('目标孔位', '2')
  change('选择镶嵌符文', id('Desert Rune', 'armour'))
  click('应用镶嵌')
  expect(screen.queryByLabelText('孔位 3 绑定效果')).toBeNull()
  expect(resistance('火焰抗性')).toBe('14%')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Rabbit Idol'))
  click('应用镶嵌')
  expect(resistance('混沌抗性')).toBe('0%')
  expect(screen.getByLabelText('孔位 1 绑定效果').textContent).toContain('未激活')
  click('撤销')
  const project = save()
  expect(project.rulesVersion).toBe('basic-2026-09-17-v112')
  expect(project.operations).toHaveLength(4)
  expect(project.cursor).toBe(3)
  click('恢复本机演练')
  expect(resistance('混沌抗性')).toBe('8%')
  click('重做')
  expect(resistance('混沌抗性')).toBe('0%')
  expect(save().cursor).toBe(4)
})

it('中文多行条件与绑定观察导入后可替换，原文不随后续Fox移除而变化', () => {
  const sockets = [id('Carved Cunning'), id('Fox Idol'), id('Desert Rune', 'armour')]
  const exported = must(
    exportCraftItemText(catalog, { ...initial, sockets }, { locale: 'zh-CN', dictionary }),
  )
  expect(exported.text).toContain('Bonded:')
  expect(exported.text).not.toContain('Prevent +5% of Damage')
  const parsed = parseItem(exported.text)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = must(
    importIdentifiedCraftState(
      catalog,
      initial.baseId,
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
  expect(save().operations).toHaveLength(0)
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    '若你近期没有偏转击中，避免 +5% 的偏转击中伤害',
  )
  expect(screen.getByLabelText('孔位 1 绑定效果').textContent).toContain('已激活')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Stoat Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('孔位 1 绑定效果').textContent).toContain('未激活')
  const saved = save()
  expect(saved.initialState.sourceText).toBe(exported.text)
  expect(saved.initialState.runeSourceLines).toEqual(imported.runeSourceLines)
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v112')
})
