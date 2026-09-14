import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  exportCraftItemText,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
const select = (name: string, category = 'weapon') =>
  change('选择镶嵌符文', `pob2:augment:${JSON.stringify([`Soul Core of ${name}`, category])}`)
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('需求转换魂核不显示钢铁防御提示，实际替换钢铁时仍提示损失', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Adherent Cuffs',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [null],
      }}
    />,
  )
  select('Atmohua', 'armour')
  expect(screen.queryByText(/钢铁符文与普通本地防御提高相加/)).toBeNull()
  click('应用镶嵌')
  select('Cholotl', 'armour')
  expect(screen.queryByText(/失去这个孔的钢铁符文/)).toBeNull()
  click('取消镶嵌')
  change('选择镶嵌符文', 'pob2:augment:["Iron Rune","armour"]')
  expect(screen.getByText(/钢铁符文与普通本地防御提高相加/)).toBeDefined()
  click('应用镶嵌')
  select('Atmohua', 'armour')
  expect(screen.getByText(/失去这个孔的钢铁符文/)).toBeDefined()
})

it('魂核攻速驱动停止条件，覆盖取消、费用、撤销和项目恢复贯通', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        sourceText: null,
        affixes: [],
        sockets: [null, null],
      }}
    />,
  )
  const panel = () => within(screen.getByLabelText('武器面板估算'))
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'item-property')
  change('规则 1 条件 1 面板下限', '11.5')
  click('应用规则 1 条件 1面板范围')
  select('Quipolatl')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：11.34')).toBeDefined()
  change('目标孔位', '1')
  select('Quipolatl')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：11.88')).toBeDefined()
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  select('Tacati')
  click('取消镶嵌')
  expect(panel().getByText('物理 DPS：11.88')).toBeDefined()
  select('Tacati')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：11.34')).toBeDefined()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  expect(panel().getByText(/词缀提高 0%，镶嵌物提高 5%/)).toBeDefined()
  expect(
    screen.getByText(`${catalog.localizedNames?.['zh-CN']?.['Soul Core of Quipolatl']} × 2`),
  ).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v66')
  expect(saved.operations).toHaveLength(3)
  click('撤销')
  expect(panel().getByText('物理 DPS：11.88')).toBeDefined()
  click('恢复本机演练')
  expect(panel().getByText('物理 DPS：11.34')).toBeDefined()
})

it('手套魂核与恐惧增效、替换及历史恢复共用实际效果', () => {
  const output = exportCraftItemText(catalog, {
    baseId: 'Adherent Cuffs',
    itemLevel: 86,
    rarity: 'rare',
    quality: 20,
    sourceText: null,
    affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
    sockets: [null, null],
  })
  if (!output.ok) throw Error(output.error)
  const parsed = parseItem(output.value.text)
  if (!parsed.ok) throw Error(parsed.error)
  const input = importCraftState(
    catalog,
    'Adherent Cuffs',
    parsed.item,
    inspectItem(parsed.item, createCraftItemDictionary(catalog, {})),
    [null, null],
  )
  if (!input.ok) throw Error(input.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{ 'Essence of Horror': '恐惧精华' }}
      initialState={input.value}
      importedSockets={[null, null]}
    />,
  )
  const effects = () => within(screen.getByLabelText('当前镶嵌效果'))
  select('Tacati', 'armour')
  click('应用镶嵌')
  change('目标孔位', '1')
  select('Citaqualotl', 'armour')
  click('应用镶嵌')
  expect(effects().getByText('+13% to Chaos Resistance')).toBeDefined()
  click('选择精华 恐惧精华')
  fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
  click('预览精华结果')
  click('应用精华结果')
  expect(effects().getByText('+20% to Chaos Resistance')).toBeDefined()
  expect(effects().getByText('+9% to all Elemental Resistances')).toBeDefined()
  change('目标孔位', '0')
  select('Azcapa', 'gloves')
  click('应用镶嵌')
  expect(
    effects().getByText('16% increased Quantity of Gold Dropped by Slain Enemies'),
  ).toBeDefined()
  click('保存演练到本机')
  click('撤销')
  expect(effects().getByText('+20% to Chaos Resistance')).toBeDefined()
  click('撤销')
  expect(effects().getByText('+13% to Chaos Resistance')).toBeDefined()
  click('恢复本机演练')
  expect(
    effects().getByText('16% increased Quantity of Gold Dropped by Slain Enemies'),
  ).toBeDefined()
})
