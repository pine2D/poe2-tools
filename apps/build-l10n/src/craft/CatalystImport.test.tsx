import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type CraftCatalog, inspectItem, parseItem } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { CraftEntry } from './CraftEntry'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const base = catalog.bases.find((entry) => entry.id === 'Gold Ring')
if (!base) throw new Error('缺少测试基底')
const text =
  'Item Class: Rings\nRarity: Rare\nTest Ring\nGold Ring\n--------\n品质（待核对类型）: +20%\n--------\nItem Level: 86\n--------\n{ Implicit Modifier }\n10(6-15)% increased Rarity of Items found\n--------\n{ Prefix Modifier "Hale" — Life — 20% Increased }\n+19(10-19) to maximum Life'
afterEach(() => {
  cleanup()
  localStorage.clear()
})
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

it('中文未知品质先核对类型和基础值，制作、撤销及恢复保留品质', () => {
  const parsed = parseItem(text)
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {})
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={{ baseId: base.id, item: parsed.item, ...inspection }}
      translations={catalog.localizedNames?.['zh-CN'] ?? {}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={() => {}}
    />,
  )
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  fireEvent.change(screen.getByLabelText('核对催化品质类型'), { target: { value: 'Flesh' } })
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
  fireEvent.click(screen.getByLabelText('已核对类型，且原文数值为高级基础值'))
  click('从当前装备开始')
  expect(screen.getByLabelText('当前催化品质').textContent).toContain('生命 · 20%')
  expect(screen.getByText('+22 to maximum Life')).toBeDefined()
  click('神圣石')
  fireEvent.change(screen.getByLabelText('Hale · 数值 1'), { target: { value: '10' } })
  click('应用本次结果')
  expect(screen.getByText('+12 to maximum Life')).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.initialState.catalyst).toEqual({ id: 'Flesh', quality: 20, declared: true })
  expect(saved.scalabilitySourceHash).toMatch(/^[a-f0-9]{64}$/)
  click('撤销')
  expect(screen.getByText('+22 to maximum Life')).toBeDefined()
  click('恢复本机演练')
  expect(screen.getByText('+12 to maximum Life')).toBeDefined()
  expect(within(screen.getByLabelText('当前催化品质')).getByText(/生命 · 20%/)).toBeDefined()
})

it('搜索起点可声明已有催化品质，空品质输入不被当成零', () => {
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={86}
      imported={undefined}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={() => {}}
    />,
  )
  fireEvent.change(screen.getByLabelText('起点催化品质类型'), { target: { value: 'Flesh' } })
  fireEvent.change(screen.getByLabelText('起点催化品质（%）'), { target: { value: '' } })
  expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
  fireEvent.change(screen.getByLabelText('起点催化品质（%）'), { target: { value: '10' } })
  click('从空白基底开始')
  expect(screen.getByLabelText('当前催化品质').textContent).toContain('生命 · 10%')
  click('保存演练到本机')
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').initialState.catalyst,
  ).toEqual({ id: 'Flesh', quality: 10, declared: true })
})
