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
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'talisman'])}`
const flame = id('Rune of Vital Flame')
const amor = id('Legacy of Amor Mandragora')
const spite = id('Legacy of Spiteful Floret')
const animosity = id('Ancient Rune of Animosity')
const initial = {
  baseId: 'Changeling Talisman',
  itemLevel: 86,
  rarity: 'normal' as const,
  affixes: [],
  sourceText: null,
  sockets: [null, null, null],
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

it('混合火伤、共享限量、同孔替换及v108完整未来串联，条件阈值完整展示', () => {
  render(<RehearsalPanel catalog={catalog} translations={{}} initialState={initial} />)
  change('选择镶嵌符文', flame)
  expect(within(screen.getByLabelText('镶嵌草稿')).getByText(/火焰点伤计入本件武器/)).toBeTruthy()
  click('应用镶嵌')
  expect(within(screen.getByLabelText('武器面板估算')).getByText('总武器 DPS：33.125')).toBeTruthy()
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    '15% of Skill Mana Costs Converted to Life Costs',
  )
  change('目标孔位', '1')
  change('选择镶嵌符文', amor)
  click('应用镶嵌')
  change('目标孔位', '2')
  change('选择镶嵌符文', spite)
  expect(screen.getByRole('button', { name: '应用镶嵌' }).hasAttribute('disabled')).toBe(true)
  click('取消镶嵌')
  change('目标孔位', '1')
  change('选择镶嵌符文', spite)
  click('应用镶嵌')
  expect(screen.getByLabelText('当前镶嵌效果').textContent).toContain(
    'Every 5 Rage also grants 5% of Damage taken Recouped as Life',
  )
  expect(within(screen.getByLabelText('武器面板估算')).getByText('总武器 DPS：33.125')).toBeTruthy()
  click('撤销')
  const saved = save()
  expect(saved.rulesVersion).toBe('basic-2026-09-17-v108')
  expect(saved.cursor).toBe(2)
  expect(saved.operations).toHaveLength(3)
  click('恢复本机演练')
  click('重做')
  expect(save().cursor).toBe(3)
  expect(screen.getByLabelText('镶嵌限量提示').textContent).toContain('共享')
})

it('导入已有跨名共享超限孔后显示风险并能替换修复，不修改来源观察', () => {
  const dictionary = createCraftItemDictionary(catalog, {})
  const sockets = [amor, spite]
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
  change('选择镶嵌符文', animosity)
  click('应用镶嵌')
  expect(screen.getByLabelText('镶嵌限量提示').textContent).not.toContain('本件已超限')
  expect(save().initialState.sourceText).toBe(text.value.text)
})
