import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftState,
  createCraftItemDictionary,
  importCraftState,
  inspectItem,
  parseItem,
  parseTargetCraftProject,
  runeforgingCatalogSignature,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const start: CraftState = {
  baseId: 'Rusted Cuirass',
  itemLevel: 86,
  rarity: 'normal',
  affixes: [],
  sourceText: null,
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const saved = () => JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')

it('尚未执行的锻造指引保存完整目录签名和 v82 版本', () => {
  render(<RehearsalPanel catalog={catalog} initialState={start} translations={{}} />)
  click('启用条件指引示例')
  fireEvent.change(screen.getByLabelText('规则 2 动作'), { target: { value: 'runeforge' } })
  click('保存演练到本机')
  expect(saved().operations).toHaveLength(0)
  expect(saved().rulesVersion).toBe('basic-2026-09-16-v82')
  expect(saved().runeforgingCatalogSignature).toBe(runeforgingCatalogSignature(catalog))
  expect(parseTargetCraftProject(JSON.stringify(saved()), catalog).ok).toBe(true)
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 2 动作') as HTMLSelectElement).value).toBe('runeforge')
})

it('空白防具起点锻造预览取消不计费，应用撤销及完整未来项目恢复', () => {
  render(<RehearsalPanel catalog={catalog} initialState={start} translations={{}} />)
  click('预览锻造结果')
  expect(screen.getByLabelText('锻造待应用结果')).toBeTruthy()
  click('取消锻造结果')
  click('保存演练到本机')
  expect(saved().operations).toHaveLength(0)
  click('预览锻造结果')
  click('应用锻造结果')
  expect(screen.getByText('维金 × 20')).toBeTruthy()
  click('保存演练到本机')
  expect(saved().rulesVersion).toBe('basic-2026-09-16-v82')
  expect(saved().runeforgingCatalogSignature).toBe(runeforgingCatalogSignature(catalog))
  expect(parseTargetCraftProject(JSON.stringify(saved()), catalog).ok).toBe(true)
  click('撤销')
  click('保存演练到本机')
  expect(saved().cursor).toBe(0)
  expect(saved().operations).toEqual([
    { kind: 'runeforge', fromBaseId: 'Rusted Cuirass', toBaseId: 'Runeforged Rusted Cuirass' },
  ])
  click('重做')
  expect(screen.getByText('维金 × 20')).toBeTruthy()
  click('恢复本机演练')
  expect(screen.getByText('演练项目已恢复。')).toBeTruthy()
  expect(screen.queryByText('维金 × 20')).toBeNull()
  click('重做')
  expect(screen.getByText('维金 × 20')).toBeTruthy()
})

it('可选目录到达不重置已有演练历史', () => {
  const { runeforging: _table, ...primary } = catalog
  const view = render(<RehearsalPanel catalog={primary} initialState={start} translations={{}} />)
  click('蜕变石')
  const choice = within(screen.getByLabelText('本次指定结果'))
    .getAllByRole('button')
    .find((button) => button.textContent?.includes(' · '))
  if (!choice) throw Error('缺少蜕变结果')
  fireEvent.click(choice)
  click('应用本次结果')
  click('保存演练到本机')
  const previous = saved().operations
  const initial = saved().initialState
  view.rerender(<RehearsalPanel catalog={catalog} initialState={start} translations={{}} />)
  click('预览锻造结果')
  click('应用锻造结果')
  click('保存演练到本机')
  expect(saved().initialState).toEqual(initial)
  expect(saved().operations).toHaveLength(2)
  expect(saved().operations[0]).toEqual(previous[0])
})

it('中文导入保留起点原文，锻造材料数量参与报价', () => {
  const source =
    '物品类别: 胸甲\n稀有度: 普通\n生锈胸甲\n--------\n护甲: 20\n--------\n物品等级: 86'
  const dictionary = createCraftItemDictionary(catalog, {
    items: { bases: { 'Rusted Cuirass': '生锈胸甲' }, uniques: {} },
  })
  const parsed = parseItem(source)
  if (!parsed.ok) throw Error(parsed.error)
  const imported = importCraftState(
    catalog,
    'Rusted Cuirass',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!imported.ok) throw Error(imported.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={imported.value}
      translations={{}}
      dictionary={dictionary}
    />,
  )
  click('预览锻造结果')
  click('应用锻造结果')
  fireEvent.click(screen.getByText('填写材料单价与起点成本'))
  fireEvent.change(screen.getByLabelText('维金单价'), { target: { value: '2' } })
  click('应用报价')
  click('保存演练到本机')
  expect(saved().initialState.sourceText).toBe(source)
  expect(saved().pricing.prices['currency:verisium']).toBe(2)
  expect(parseTargetCraftProject(JSON.stringify(saved()), catalog, dictionary).ok).toBe(true)
})
