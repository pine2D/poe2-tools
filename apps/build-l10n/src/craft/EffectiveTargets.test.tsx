import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type CraftCatalog, importCraftState, inspectItem, parseItem } from '@poe2-tools/item-core'
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
const text =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\nQuality (Life Modifiers): +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life }\n+10(10-19) to maximum Life'
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
it('网页有效生命22目标在基础19后达成，并保存有效口径', () => {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const initial = importCraftState(catalog, 'Gold Ring', parsed.item, {
    ...inspectItem(parsed.item, {}),
    base: { english: parsed.item.nameLines.at(-1)?.raw ?? null, candidates: [] },
  })
  if (!initial.ok) throw new Error(initial.error)
  render(<RehearsalPanel catalog={catalog} initialState={initial.value} translations={{}} />)
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'IncreasedLife1' } })
  click('加入目标 IncreasedLife1')
  click('设置数值条件 IncreasedLife1')
  fireEvent.change(screen.getByLabelText('IncreasedLife1 · 条件口径'), {
    target: { value: 'effective' },
  })
  fireEvent.change(screen.getByLabelText('IncreasedLife1 · 数值 1 最小值'), {
    target: { value: '22' },
  })
  click('保存数值条件 IncreasedLife1')
  const targets = screen.getByRole('region', { name: '制作目标与下一步' })
  expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
  click('演练建议：神圣石')
  fireEvent.change(screen.getByLabelText('Hale · 数值 1'), { target: { value: '19' } })
  click('应用本次结果')
  expect(within(targets).getByText('已达成 1 / 1')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(p.targetDefinitions).toEqual({
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'IncreasedLife1' }],
    alternatives: [],
    values: [
      {
        targetId: 't1',
        modId: 'IncreasedLife1',
        basis: 'effective',
        bounds: [{ index: 0, min: 22 }],
      },
    ],
  })
})
it('固有条件可保存有效火抗36，基础30后显示达成并可恢复', () => {
  const input = text
    .replace('Gold Ring', 'Ruby Ring')
    .replace('Life Modifiers', 'Fire Modifiers')
    .replace('10(6-15)% increased Rarity of Items found', '+20(20-30)% to Fire Resistance')
  const parsed = parseItem(input)
  if (!parsed.ok) throw new Error(parsed.error)
  const initial = importCraftState(catalog, 'Ruby Ring', parsed.item, {
    ...inspectItem(parsed.item, {}),
    base: { english: parsed.item.nameLines.at(-1)?.raw ?? null, candidates: [] },
  })
  if (!initial.ok) throw new Error(initial.error)
  render(<RehearsalPanel catalog={catalog} initialState={initial.value} translations={{}} />)
  fireEvent.change(screen.getByLabelText('固有属性 1 · 条件口径'), {
    target: { value: 'effective' },
  })
  fireEvent.change(screen.getByLabelText('固有属性 1 · 数值 1 下限'), { target: { value: '36' } })
  click('保存固有属性 1 条件')
  expect(screen.getByText('固有目标未达成')).toBeDefined()
  click('演练建议：神圣石')
  fireEvent.change(screen.getByLabelText('固有属性 · 数值 1'), { target: { value: '30' } })
  click('应用本次结果')
  expect(screen.getByText('固有目标已达成')).toBeDefined()
  click('保存演练到本机')
  const p = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(p.rulesVersion).toBe('basic-2026-09-12-v74')
  expect(p.targetDefinitions).toEqual({
    nextTargetId: 1,
    targets: [],
    alternatives: [],
    values: [],
  })
  expect(p.targetImplicitValues[0]).toEqual({
    lineIndex: 0,
    basis: 'effective',
    bounds: [{ index: 0, min: 36 }],
  })
  click('撤销')
  expect(screen.getByText('固有目标未达成')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('固有目标已达成')).toBeDefined()
})
