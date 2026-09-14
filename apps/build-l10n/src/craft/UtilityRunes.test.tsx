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
const iron = 'pob2:augment:["Body Rune","armour"]'
const lesser = 'pob2:augment:["Perfect Inspiration Rune","armour"]'
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

it('新增符文从导入到恐惧增效、覆盖、费用及历史恢复一致', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      importedSockets={[iron, lesser]}
      translations={{ 'Essence of Horror': '恐惧精华' }}
    />,
  )
  const effects = () => within(screen.getByLabelText('当前镶嵌效果'))
  expect(effects().getByText('+45 to maximum Life')).toBeDefined()
  click('选择精华 恐惧精华')
  fireEvent.click(screen.getByRole('radio', { name: /IncreasedLife1/ }))
  click('预览精华结果')
  click('应用精华结果')
  expect(effects().getByText('+72 to maximum Life')).toBeDefined()
  expect(effects().getByText('33% increased Mana Regeneration Rate')).toBeDefined()
  const mana = 'pob2:augment:["Mind Rune","armour"]'
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: mana } })
  expect(within(screen.getByLabelText('镶嵌草稿')).getByText('+48 to maximum Mana')).toBeDefined()
  click('取消镶嵌')
  expect(effects().getByText('+72 to maximum Life')).toBeDefined()
  fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: mana } })
  click('应用镶嵌')
  expect(effects().getByText('+48 to maximum Mana')).toBeDefined()
  click('保存演练到本机')
  const project = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(project.rulesVersion).toBe('basic-2026-09-12-v57')
  expect(project.operations).toHaveLength(2)
  expect(project.initialState.runeSourceLines).toEqual([
    '+45 to maximum Life',
    '21% increased Mana Regeneration Rate',
  ])
  expect(screen.getByText(`${catalog.localizedNames?.['zh-CN']?.['Mind Rune']} × 1`)).toBeDefined()
  click('撤销')
  expect(effects().getByText('+72 to maximum Life')).toBeDefined()
  click('撤销')
  expect(effects().getByText('21% increased Mana Regeneration Rate')).toBeDefined()
  click('恢复本机演练')
  expect(effects().getByText('+48 to maximum Mana')).toBeDefined()
  expect(effects().getByText('33% increased Mana Regeneration Rate')).toBeDefined()
  expect(screen.getByText('恐惧精华 × 1')).toBeDefined()
})
