import { readFileSync } from 'node:fs'
import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftStrategyActionEditor, strategyActionLabel } from './CraftStrategyActionEditor'
import { CraftStrategyResults } from './CraftStrategyResults'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  runeforging: JSON.parse(readFileSync('data/craft/runeforging.json', 'utf8')),
}
const state: CraftState = {
  baseId: 'Rusted Cuirass',
  itemLevel: 86,
  rarity: 'normal',
  sourceText: null,
  affixes: [],
}
afterEach(cleanup)
it('可配置锻造动作并展示实际材料与已锻造拒绝原因', () => {
  const onChange = vi.fn()
  const props = {
    catalog,
    state,
    translations: {},
    number: 1,
    omenLabel: (id: string) => id,
    onChange,
  }
  const view = render(<CraftStrategyActionEditor {...props} action={{ kind: 'stop' }} />)
  fireEvent.change(screen.getByLabelText('规则 1 动作'), { target: { value: 'runeforge' } })
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'runeforge' })
  view.rerender(<CraftStrategyActionEditor {...props} action={{ kind: 'runeforge' }} />)
  expect(screen.getByText(/Verisium × 20/)).toBeTruthy()
  expect(strategyActionLabel({ kind: 'runeforge' }, catalog, {}, (id) => id)).toBe('防具锻造')
  view.rerender(
    <CraftStrategyActionEditor
      {...props}
      state={{ ...state, baseId: 'Runeforged Rusted Cuirass' }}
      action={{ kind: 'runeforge' }}
    />,
  )
  expect(screen.queryByText(/Verisium × 20/)).toBeNull()
})
it('指引结果复用锻造预览及取消入口', () => {
  const onPreview = vi.fn(),
    onCancel = vi.fn()
  render(
    <CraftStrategyResults
      action={{ kind: 'runeforge' }}
      catalog={catalog}
      state={state}
      definitions={{ nextTargetId: 1, targets: [], alternatives: [], values: [] }}
      translations={{}}
      fractureLabel="破裂"
      onPreview={onPreview}
      onCancel={onCancel}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '预览锻造结果' }))
  expect(onPreview).toHaveBeenCalledExactlyOnceWith({
    kind: 'runeforge',
    fromBaseId: 'Rusted Cuirass',
    toBaseId: 'Runeforged Rusted Cuirass',
  })
  fireEvent.click(screen.getByRole('button', { name: '取消指引结果选择' }))
  expect(onCancel).toHaveBeenCalledOnce()
})
