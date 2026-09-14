import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  createCraftItemDictionary,
  importCraftState,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const dictionary = createCraftItemDictionary(catalog, {})
const raw =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nQuality (Life Modifiers): +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const change = (name: string, value: string) =>
  fireEvent.change(screen.getByLabelText(name), { target: { value } })
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('编辑品质范围需应用，催化消费后转停止，撤销与保存恢复重新判断', () => {
  const parsed = parseItem(raw)
  if (!parsed.ok) throw Error(parsed.error)
  const input = importCraftState(
    catalog,
    'Gold Ring',
    parsed.item,
    inspectItem(parsed.item, dictionary),
  )
  if (!input.ok) throw Error(input.error)
  render(
    <RehearsalPanel
      catalog={catalog}
      dictionary={dictionary}
      translations={catalog.localizedNames?.['zh-CN'] ?? {}}
      initialState={input.value}
    />,
  )
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'quality')
  expect(screen.getByText('当前品质未知：该来源没有已核对的品质记录。')).toBeDefined()
  change('规则 1 条件 1 品质来源', 'catalyst')
  change('规则 1 条件 1 催化类型', 'Flesh')
  change('规则 1 条件 1 品质上限', '0')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('应用规则 1 条件 1品质范围')
  change('规则 4 动作', 'exalted')
  change('规则 4 预兆', 'catalysing_exaltation')
  expect(screen.getByText(/命中规则 4：崇高石/)).toBeDefined()
  change('预览品质（%）', '0')
  expect(screen.getByText(/命中规则 4：崇高石/)).toBeDefined()
  click('开始指引步骤')
  change('搜索合法词缀', 'FireResist1')
  fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
  click('应用本次结果')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  expect(screen.getByText('当前品质：生命 · 0%')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v55')
  expect(saved.strategy.rules[0].conditions).toEqual([
    { kind: 'quality', source: 'catalyst', catalystId: 'Flesh', min: 0, max: 0 },
  ])
  click('撤销')
  expect(screen.getByText(/命中规则 4：崇高石/)).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  change('规则 1 条件 1 品质下限', '0.5')
  expect(
    (screen.getByRole('button', { name: '应用规则 1 条件 1品质范围' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  click('恢复本机演练')
  expect((screen.getByLabelText('规则 1 条件 1 品质下限') as HTMLInputElement).value).toBe('0')
})
