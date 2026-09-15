import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { CraftCatalog } from '@poe2-tools/item-core'
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
const select = (name: string) => change('选择镶嵌符文', `pob2:augment:["${name}","weapon"]`)
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('物理符文驱动面板停止条件，替换取消不改值，费用与撤销恢复一致', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Crude Bow',
        itemLevel: 86,
        rarity: 'normal',
        quality: 20,
        affixes: [],
        sockets: [null, null],
        sourceText: null,
      }}
    />,
  )
  const panel = () => within(screen.getByLabelText('武器面板估算'))
  expect(panel().getByText('物理 DPS：10.8')).toBeDefined()
  click('启用条件指引示例')
  fireEvent.click(screen.getByText('编辑条件规则（4 条）'))
  change('规则 1 条件 1', 'item-property')
  change('规则 1 条件 1 面板下限', '24')
  click('应用规则 1 条件 1面板范围')
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  select('Tempered Rune')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：21.6')).toBeDefined()
  change('目标孔位', '1')
  select('Iron Rune')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：25.2')).toBeDefined()
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  change('目标孔位', '0')
  select('Body Rune')
  click('取消镶嵌')
  expect(panel().getByText('物理 DPS：25.2')).toBeDefined()
  select('Body Rune')
  click('应用镶嵌')
  expect(panel().getByText('物理 DPS：12.6')).toBeDefined()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
  for (const name of ['Tempered Rune', 'Iron Rune', 'Body Rune'])
    expect(
      screen.getByText(`${catalog.localizedNames?.['zh-CN']?.[name] ?? name} × 1`),
    ).toBeDefined()
  click('保存演练到本机')
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v71')
  expect(saved.operations).toHaveLength(3)
  click('撤销')
  expect(panel().getByText('物理 DPS：25.2')).toBeDefined()
  expect(screen.getByText('命中规则 1：停止。')).toBeDefined()
  click('恢复本机演练')
  expect(panel().getByText('物理 DPS：12.6')).toBeDefined()
  expect(screen.getByText('命中规则 2：蜕变石')).toBeDefined()
})
