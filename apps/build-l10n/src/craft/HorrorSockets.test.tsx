import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  type CraftState,
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
const iron = 'pob2:augment:["Iron Rune","armour"]'
const lesser = 'pob2:augment:["Lesser Iron Rune","armour"]'
const rawState: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'rare',
  quality: 20,
  sourceText: null,
  sockets: [iron, lesser],
  affixes: [{ modId: 'IncreasedLife1', lines: ['+15 to maximum Life'] }],
}
const output = exportCraftItemText(catalog, rawState)
if (!output.ok) throw new Error(output.error)
const parsed = parseItem(output.value.text)
if (!parsed.ok) throw new Error(parsed.error)
const input = importCraftState(
  catalog,
  rawState.baseId,
  parsed.item,
  inspectItem(parsed.item, createCraftItemDictionary(catalog, {})),
  rawState.sockets,
)
if (!input.ok) throw new Error(input.error)
const initialState = input.value
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

it('精华草稿比较同孔增效，应用/撤销/恢复一致，替换候选也含增效', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      importedSockets={[iron, lesser]}
      translations={{ 'Essence of Horror': '恐惧精华' }}
    />,
  )
  click('选择精华 恐惧精华')
  fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
  click('预览精华结果')
  const defences = () => within(screen.getByLabelText('防御面板估算'))
  expect(defences().getByText('153 → 173（+20）')).toBeDefined()
  click('展开前后变化')
  expect(
    screen.getAllByText('25% increased Armour, Evasion and Energy Shield').length,
  ).toBeGreaterThan(0)
  click('应用精华结果')
  expect(defences().getAllByText('词缀提高 0% + 符文提高 47%')).toHaveLength(2)
  expect(screen.getByText(/已计入恐惧精华的 60%/)).toBeDefined()
  expect(
    screen.getByRole('option', {
      name: 'Iron Rune · 25% increased Armour, Evasion and Energy Shield',
    }),
  ).toBeDefined()
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: lesser } })
  expect(
    within(screen.getByLabelText('镶嵌草稿')).getByText(
      '22% increased Armour, Evasion and Energy Shield',
    ),
  ).toBeDefined()
  click('取消镶嵌')
  click('保存演练到本机')
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations).toHaveLength(1)
  click('撤销')
  expect(defences().getAllByText('词缀提高 0% + 符文提高 30%')).toHaveLength(2)
  expect(screen.queryByText(/已计入恐惧精华的 60%/)).toBeNull()
  click('恢复本机演练')
  expect(defences().getAllByText('词缀提高 0% + 符文提高 47%')).toHaveLength(2)
  expect(screen.getByText('恐惧精华 × 1')).toBeDefined()
})
