import { readFileSync } from 'node:fs'
import { type CraftCatalog, type CraftState, FLUXES } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftStrategyActionEditor, strategyActionLabel } from './CraftStrategyActionEditor'
import { CraftStrategyResults } from './CraftStrategyResults'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
const state: CraftState = {
  baseId: 'Gold Ring',
  itemLevel: 86,
  rarity: 'rare',
  sourceText: null,
  nextAffixId: 3,
  affixes: [
    { affixId: 'a1', modId: 'ColdResist4', lines: ['+21% to Cold Resistance'] },
    { affixId: 'a2', modId: 'LightningResist4', lines: ['+23% to Lightning Resistance'] },
  ],
}
afterEach(cleanup)

it('规则可选准确Flux材料并显示本地化动作名', () => {
  const onChange = vi.fn()
  const props = {
    number: 1,
    catalog,
    state,
    translations: {},
    omenLabel: (id: string) => id,
    onChange,
  }
  const view = render(<CraftStrategyActionEditor {...props} action={{ kind: 'stop' }} />)
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'flux' } })
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'flux', fluxId: FLUXES[0].id })
  view.rerender(
    <CraftStrategyActionEditor {...props} action={{ kind: 'flux', fluxId: FLUXES[0].id }} />,
  )
  fireEvent.change(screen.getByLabelText('规则 1 溶剂'), { target: { value: FLUXES[1].id } })
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'flux', fluxId: FLUXES[1].id })
  expect(
    strategyActionLabel(
      { kind: 'flux', fluxId: FLUXES[0].id },
      catalog,
      { 'Blazing Flux': '测试炽焰溶剂' },
      (id) => id,
    ),
  ).toBe('测试炽焰溶剂')
})

it('受控结果只用指定材料，分别保留两条实例；切换动作清草稿且取消不预览', () => {
  const onPreview = vi.fn(),
    onCancel = vi.fn()
  const props = {
    catalog,
    state,
    definitions: { nextTargetId: 1, targets: [], alternatives: [], values: [] },
    translations: {},
    fractureLabel: '破裂',
    onPreview,
    onCancel,
  }
  const view = render(
    <CraftStrategyResults {...props} action={{ kind: 'flux', fluxId: FLUXES[0].id }} />,
  )
  expect(screen.getAllByRole('button', { name: /^选择溶剂 / })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }))
  const fields = screen.getAllByRole('spinbutton')
  const first = fields[0],
    second = fields[1]
  if (!first || !second) throw new Error('缺少两条实例数值')
  fireEvent.change(first, { target: { value: '22' } })
  fireEvent.change(second, { target: { value: '25' } })
  fireEvent.click(screen.getByRole('button', { name: '预览溶剂结果' }))
  expect(onPreview).toHaveBeenCalledExactlyOnceWith({
    kind: 'flux',
    fluxId: FLUXES[0].id,
    rolls: [
      { affixId: 'a1', modId: 'FireResist4', values: [22] },
      { affixId: 'a2', modId: 'FireResist4', values: [25] },
    ],
  })
  view.rerender(<CraftStrategyResults {...props} action={{ kind: 'flux', fluxId: FLUXES[1].id }} />)
  expect(screen.queryByRole('button', { name: '预览溶剂结果' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '取消指引结果选择' }))
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onPreview).toHaveBeenCalledTimes(1)
})
