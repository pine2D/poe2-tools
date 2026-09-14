import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  type CraftCatalog,
  createCraftItemDictionary,
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
const raw =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nQuality (Life Modifiers): +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life'
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it.each(['catalysing_exaltation', 'catalysing_greater_dextral_exaltation'])(
  '%s 沿草稿、取消、应用、消费、撤销与恢复更新当前品质',
  (omen) => {
    const parsed = parseItem(raw)
    if (!parsed.ok) throw new Error('测试文本解析失败')
    const dictionary = createCraftItemDictionary(catalog, {})
    const imported = importCraftState(
      catalog,
      'Gold Ring',
      parsed.item,
      inspectItem(parsed.item, dictionary),
    )
    if (!imported.ok) throw new Error(imported.error)
    render(
      <RehearsalPanel
        catalog={catalog}
        initialState={imported.value}
        dictionary={dictionary}
        translations={catalog.localizedNames?.['zh-CN'] ?? {}}
      />,
    )
    fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
      target: { value: omen },
    })
    expect(screen.getByText(/消耗全部催化品质/)).toBeDefined()
    click('崇高石')
    fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'FireResist1' } })
    fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
    if (omen === 'catalysing_greater_dextral_exaltation') {
      fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'ColdResist1' } })
      fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
    }
    click('展开前后变化')
    expect(screen.getByLabelText('催化品质前后变化').textContent).toContain('20% → 0%')
    expect(screen.getByLabelText('当前催化品质').textContent).toContain('20%')
    click('取消本次结果')
    expect(screen.getByLabelText('当前催化品质').textContent).toContain('20%')
    click('崇高石')
    fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'FireResist1' } })
    fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
    if (omen === 'catalysing_greater_dextral_exaltation') {
      fireEvent.change(screen.getByLabelText('搜索合法词缀'), { target: { value: 'ColdResist1' } })
      fireEvent.click(document.querySelector('.rehearsal-candidates button') as HTMLButtonElement)
    }
    click('应用本次结果')
    expect(screen.getByLabelText('当前催化品质').textContent).toContain('0%')
    expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('0')
    expect(
      within(screen.getByLabelText('催化剂效果预览')).getByText('+19 to maximum Life'),
    ).toBeDefined()
    click('保存演练到本机')
    const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
    expect(saved.rulesVersion).toBe('basic-2026-09-12-v66')
    expect(saved.operations).toHaveLength(1)
    expect(saved.operations[0].omen).toBe(omen)
    if (omen === 'catalysing_greater_dextral_exaltation') {
      expect(saved.operations[0].modIds).toEqual(['FireResist1', 'ColdResist1'])
      expect(screen.getAllByText('强效崇高预兆 × 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('右旋崇高预兆 × 1').length).toBeGreaterThan(0)
    }
    expect(saved.initialState.catalyst.quality).toBe(20)
    expect(screen.getAllByText('催化崇高预兆 × 1').length).toBeGreaterThan(0)
    click('撤销')
    expect(screen.getByLabelText('当前催化品质').textContent).toContain('20%')
    click('恢复本机演练')
    expect(screen.getByLabelText('当前催化品质').textContent).toContain('0%')
    expect((screen.getByLabelText('预览品质（%）') as HTMLInputElement).value).toBe('0')
  },
)
