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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
const source: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = { ...source, modifiers: [] }
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'sceptre'])}`
const initial = {
  baseId: 'Rattling Sceptre',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  sockets: [] as (string | null)[],
  quality: 0,
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
  if (!parsed.ok) throw Error(parsed.error)
  return parsed.value.project
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('权杖打孔、取消、镶嵌和完整未来恢复串联，说明作用对象与待验收边界', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  expect(screen.getByText(/权杖没有本地攻击面板/)).toBeTruthy()
  expect(screen.getByText(/权杖打孔与腐化加孔尚待游戏内复核/)).toBeTruthy()
  click('巧匠石：添加一个孔')
  click('取消打孔')
  expect(save().operations).toHaveLength(0)
  click('巧匠石：添加一个孔')
  click('应用打孔')
  change('选择镶嵌符文', id('Snake Idol'))
  click('取消镶嵌')
  expect(save().operations).toHaveLength(1)
  change('选择镶嵌符文', id('Snake Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Allies in your Presence have 10% increased Attack Speed',
  )
  change('选择镶嵌符文', id('Boar Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Allies in your Presence Regenerate 0.5% of your Maximum Life per second',
  )
  expect(screen.queryByText(/总武器 DPS：/)).toBeNull()
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v109')
  expect(saved.cursor).toBe(2)
  expect(saved.operations).toHaveLength(3)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(3)
})

it('权杖已有重复限量材料可替换修复，新增重复会被拒绝', () => {
  const dictionary = createCraftItemDictionary(catalog, {})
  const sockets = [id('Rabbit Idol'), id('Rabbit Idol')]
  const text = exportCraftItemText(
    catalog,
    { ...initial, sockets, implicitLines: ['Grants Skill: Level 12 Skeletal Warrior Minion'] },
    { dictionary },
  )
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
      importedSockets={sockets}
      initialState={imported.value}
    />,
  )
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('本件已超限')
  change('选择镶嵌符文', id('Snake Idol'))
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).not.toContain('本件已超限')
  change('选择镶嵌符文', id('Rabbit Idol'))
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  const saved = save()
  expect(saved.operations).toHaveLength(1)
  expect(saved.initialState.sourceText).toBe(text.value.text)
})
