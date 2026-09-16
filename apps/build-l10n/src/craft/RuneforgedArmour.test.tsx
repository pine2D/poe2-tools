import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  alloys: JSON.parse(readFileSync('data/craft/alloys.json', 'utf8')),
}
const dictionary = createCraftItemDictionary(catalog, {
  items: JSON.parse(readFileSync('data/dict/zh-CN/items.json', 'utf8')),
  stats: JSON.parse(readFileSync('data/dict/zh-CN/stats.json', 'utf8')),
})
const initial: CraftState = {
  baseId: 'Runeforged Adherent Cuffs',
  itemLevel: 86,
  rarity: 'rare',
  quality: 20,
  sockets: [],
  sourceText: null,
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15(10-19) to maximum Life'] }],
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
function ward() {
  const article = screen.getByRole('heading', { name: '符文结界' }).closest('article')
  if (!article) throw Error('缺少结界面板')
  return within(article)
}
function save() {
  click('保存演练到本机')
  const text = localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? ''
  if (!text)
    throw Error(
      within(screen.getByLabelText('演练项目')).getByRole('status').textContent ?? '未保存',
    )
  const parsed = parseTargetCraftProject(text, catalog, dictionary)
  if (!parsed.ok) throw Error(parsed.error)
  return parsed.value
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('锻造基底显示结界并保存未执行Ward条件为v81', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={{ ...initial, rarity: 'normal', affixes: [] }}
      translations={{}}
      dictionary={dictionary}
    />,
  )
  expect(ward().getByText('161')).toBeDefined()
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'item-property')
  change('规则 1 条件 1 面板指标', 'Ward')
  expect(screen.getByText('当前估算：161')).toBeDefined()
  change('规则 1 条件 1 面板下限', '161')
  click('应用规则 1 条件 1面板范围')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  const saved = save()
  expect(saved.project.rulesVersion).toBe('basic-2026-09-16-v81')
  expect(saved.project.strategy?.rules[0]?.conditions).toEqual([
    { kind: 'item-property', property: 'Ward', min: 161 },
  ])
  click('恢复本机演练')
  expect(ward().getByText('161')).toBeDefined()
})

it('中文导入的锻造装备施加本地结界合金，取消与撤销恢复保持完整历史', () => {
  const output = exportCraftItemText(catalog, initial, { locale: 'zh-CN', dictionary })
  if (!output.ok) throw Error(output.error)
  const parsed = parseItem(output.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const input = importCraftState(
    catalog,
    initial.baseId,
    parsed.item,
    inspectItem(parsed.item, dictionary),
    [],
    undefined,
    dictionary.stats?.entries,
  )
  if (!input.ok) throw Error(input.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={input.value}
      importedSockets={[]}
      translations={{}}
      dictionary={dictionary}
    />,
  )
  expect(ward().getByText('161')).toBeDefined()
  click('选择合金 君王合金')
  change('合金移除结果', 'a1')
  click('预览合金结果')
  click('取消合金结果')
  expect(save().project.operations).toHaveLength(0)
  click('选择合金 君王合金')
  change('合金移除结果', 'a1')
  click('预览合金结果')
  click('应用合金结果')
  expect(ward().queryByText('161')).toBeNull()
  const completed = save()
  expect(completed.project.rulesVersion).toBe('basic-2026-09-16-v81')
  expect(completed.project.operations).toHaveLength(1)
  expect(completed.states[1]?.affixes[0]?.modId).toBe('AlloyLocalWardIncreasePercent1')
  click('撤销')
  expect(ward().getByText('161')).toBeDefined()
  expect(save().project.cursor).toBe(0)
  click('恢复本机演练')
  click('重做')
  expect(save().states).toEqual(completed.states)
})
