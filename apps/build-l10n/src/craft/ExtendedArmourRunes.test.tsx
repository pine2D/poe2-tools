import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
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
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const id = (name: string) => `pob2:augment:${JSON.stringify([name, 'armour'])}`
const dictionary = createCraftItemDictionary(catalog)
const seed: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'rare',
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
  sourceText: null,
  quality: 20,
  sockets: [null, null],
}
const exported = exportCraftItemText(catalog, seed, { locale: 'en', dictionary })
if (!exported.ok) throw Error(exported.error)
const parsed = parseItem(exported.value.text)
if (!parsed.ok) throw Error(parsed.error)
const imported = importIdentifiedCraftState(
  catalog,
  seed.baseId,
  parsed.item,
  inspectItem(parsed.item, dictionary),
  seed.sockets,
)
if (!imported.ok) throw Error(imported.error)
const start = imported.value
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
function save() {
  click('保存演练到本机')
  const text = localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? ''
  const parsed = parseTargetCraftProject(text, catalog, dictionary)
  if (!parsed.ok) throw Error(parsed.error)
  return parsed.value.project
}
function horror() {
  click('选择精华 Essence of Horror')
  fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
  click('预览精华结果')
  click('应用精华结果')
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})
it('重生符文按内部精度增效，覆盖的未来历史恢复不丢失小数效果', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={start}
      dictionary={dictionary}
      importedSockets={[null, null]}
      translations={{}}
    />,
  )
  change('选择镶嵌符文', id('Rebirth Rune'))
  expect(screen.getByText(/重生符文按来源内部精度增效/)).toBeTruthy()
  click('应用镶嵌')
  horror()
  expect(
    within(screen.getByLabelText('当前镶嵌效果')).getByText(
      'Regenerate 0.63% of maximum Life per second',
    ),
  ).toBeTruthy()
  expect(save().rulesVersion).toBe('basic-2026-09-16-v84')
  change('选择镶嵌符文', id('Greater Rebirth Rune'))
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText(
      'Regenerate 0.72% of maximum Life per second',
    ),
  ).toBeTruthy()
  click('取消镶嵌')
  expect(save().operations).toHaveLength(2)
  change('选择镶嵌符文', id('Greater Rebirth Rune'))
  click('应用镶嵌')
  click('撤销')
  const future = save()
  expect(future.cursor).toBe(2)
  expect(future.operations).toHaveLength(3)
  click('重做')
  click('恢复本机演练')
  expect(save()).toEqual(future)
  click('重做')
  expect(
    within(screen.getByLabelText('当前镶嵌效果')).getByText(
      'Regenerate 0.72% of maximum Life per second',
    ),
  ).toBeTruthy()
})
it('结界提高、锻造和恐惧共存保留v84及配方签名，条件读取236后更新288', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={start}
      dictionary={dictionary}
      importedSockets={[null, null]}
      translations={{}}
    />,
  )
  change('选择镶嵌符文', id('Perfect Ward Rune'))
  click('应用镶嵌')
  change('目标孔位', '1')
  change('选择镶嵌符文', id('Warding Rune of Reinforcement'))
  expect(screen.getByText(/结界提高符文与本地结界提高相加/)).toBeTruthy()
  click('应用镶嵌')
  click('预览锻造结果')
  click('应用锻造结果')
  expect(within(screen.getByLabelText('防御面板估算')).getByText('236')).toBeTruthy()
  click('启用条件指引示例')
  change('规则 1 条件 1', 'item-property')
  change('规则 1 条件 1 面板指标', 'Ward')
  change('规则 1 条件 1 面板下限', '236')
  click('应用规则 1 条件 1面板范围')
  expect(screen.getByText('命中规则 1：停止。')).toBeTruthy()
  horror()
  expect(within(screen.getByLabelText('防御面板估算')).getByText('288')).toBeTruthy()
  const p = save()
  expect(p.rulesVersion).toBe('basic-2026-09-16-v84')
  expect(p.runeforgingCatalogSignature).toBeTruthy()
  click('撤销')
  click('恢复本机演练')
  expect(save()).toEqual(p)
})
