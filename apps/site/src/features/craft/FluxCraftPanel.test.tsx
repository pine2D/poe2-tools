import { readFileSync } from 'node:fs'
import {
  applyFluxCraft,
  type CraftCatalog,
  enableCraftAffixIdentity,
  FLUXES,
  type FluxCraftOperation,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FluxCraftPanel } from './FluxCraftPanel'

const catalog: CraftCatalog = {
  ...JSON.parse(readFileSync('data/craft/catalog.json', 'utf8')),
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
function initial() {
  const result = enableCraftAffixIdentity(catalog, {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'rare',
    sourceText: null,
    affixes: [
      { modId: 'ColdResist4', lines: ['+21% to Cold Resistance'] },
      { modId: 'LightningResist4', lines: ['+23% to Lightning Resistance'] },
    ],
  })
  if (!result.ok) throw Error(result.error)
  return result.value
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('缺少测试值')
  return value
}
afterEach(cleanup)

it('两条同档转换逐实例编辑，完整预览只提交一次且不改变前态', () => {
  const state = initial(),
    before = structuredClone(state),
    onPreview = vi.fn()
  render(
    <FluxCraftPanel
      catalog={catalog}
      state={state}
      translations={{}}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }))
  const fields = screen.getAllByRole('spinbutton')
  expect(fields).toHaveLength(2)
  fireEvent.change(required(fields[0]), { target: { value: '22' } })
  fireEvent.change(required(fields[1]), { target: { value: '25' } })
  expect(screen.getByText('+21% to Cold Resistance')).toBeDefined()
  expect(screen.getByText('+23% to Lightning Resistance')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览溶剂结果' }))
  expect(onPreview).toHaveBeenCalledTimes(1)
  const operation: FluxCraftOperation = required(onPreview.mock.calls[0])[0]
  expect(operation).toEqual({
    kind: 'flux',
    fluxId: FLUXES[0].id,
    rolls: [
      { affixId: 'a1', modId: 'FireResist4', values: [22] },
      { affixId: 'a2', modId: 'FireResist4', values: [25] },
    ],
  })
  const after = applyFluxCraft(catalog, state, operation)
  expect(after).toMatchObject({
    ok: true,
    value: {
      affixes: [
        { affixId: 'a1', modId: 'FireResist4', lines: ['+22(21-25)% to Fire Resistance'] },
        { affixId: 'a2', modId: 'FireResist4', lines: ['+25(21-25)% to Fire Resistance'] },
      ],
    },
  })
  expect(state).toEqual(before)
})

it('非法值不预览，状态或受控配置改变立即清除旧草稿', () => {
  const state = initial(),
    onPreview = vi.fn()
  const props = { catalog, state, translations: {}, disabled: false, onPreview }
  const view = render(<FluxCraftPanel {...props} configuration={{ fluxId: FLUXES[0].id }} />)
  fireEvent.click(screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }))
  fireEvent.change(required(screen.getAllByRole('spinbutton')[0]), { target: { value: '' } })
  expect((screen.getByRole('button', { name: '预览溶剂结果' }) as HTMLButtonElement).disabled).toBe(
    true,
  )
  view.rerender(
    <FluxCraftPanel {...props} state={{ ...state }} configuration={{ fluxId: FLUXES[0].id }} />,
  )
  expect(screen.queryByRole('button', { name: '预览溶剂结果' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }))
  view.rerender(<FluxCraftPanel {...props} configuration={{ fluxId: FLUXES[3].id }} />)
  expect(screen.queryByRole('button', { name: '预览溶剂结果' })).toBeNull()
  expect(screen.queryByRole('button', { name: '选择溶剂 炽焰溶剂' })).toBeNull()
  expect(screen.getByRole('button', { name: '选择溶剂 虚空溶剂' })).toBeDefined()
  expect(onPreview).not.toHaveBeenCalled()
})

it('缺目录或破裂组合不可选择，限制文案明确是工具尚未核实', () => {
  const state = initial(),
    onPreview = vi.fn()
  const { fluxes: _, ...primary } = catalog
  const view = render(
    <FluxCraftPanel
      catalog={primary}
      state={state}
      translations={{}}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  expect(screen.getAllByText(/请先加载原关系目录/).length).toBeGreaterThan(0)
  expect(
    (screen.getByRole('button', { name: '选择溶剂 炽焰溶剂' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  view.rerender(
    <FluxCraftPanel
      catalog={catalog}
      state={{
        ...state,
        affixes: state.affixes.map((a, i) => (i === 0 ? { ...a, fractured: true } : a)),
      }}
      translations={{}}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  expect(screen.getAllByText(/整体消费尚未核实/).length).toBeGreaterThan(0)
  expect(onPreview).not.toHaveBeenCalled()
})
