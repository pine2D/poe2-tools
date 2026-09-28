import { readFileSync } from 'node:fs'
import {
  type CraftCatalog,
  type CraftTargetDefinitions,
  createCraftState,
  enableCraftAffixIdentity,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftTargets } from './CraftTargets'

vi.mock('./targetRoutesWorkerClient', () => ({ requestTargetRoutes: () => () => {} }))
afterEach(cleanup)
const primary: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const catalog: CraftCatalog = {
  ...primary,
  fluxes: JSON.parse(readFileSync('data/craft/fluxes.json', 'utf8')),
}
it('搜索已有抗性可新增另一独立目标，原普通来源不会开放重复', () => {
  const input = createCraftState(catalog, {
    baseId: 'Gold Ring',
    itemLevel: 86,
    rarity: 'normal',
    affixes: [],
    sourceText: null,
  })
  if (!input.ok) throw Error(input.error)
  const state = enableCraftAffixIdentity(catalog, input.value)
  if (!state.ok) throw Error(state.error)
  const definitions: CraftTargetDefinitions = {
    nextTargetId: 2,
    targets: [{ targetId: 't1', modId: 'FireResist4' }],
    alternatives: [],
    values: [],
  }
  const onEdit = vi.fn()
  const props = {
    catalog,
    state: state.value,
    definitions,
    onEdit,
    onStart: vi.fn(),
    onStartEssence: vi.fn(),
    onStartPreparation: vi.fn(),
    onPreviewRoute: vi.fn(),
    translations: {},
    busy: false,
  }
  const view = render(<CraftTargets {...props} />)
  fireEvent.change(screen.getByPlaceholderText('输入中文属性、英文名称或词缀组'), {
    target: { value: 'FireResist4' },
  })
  const add = screen.getByRole('button', { name: '加入目标 FireResist4' }) as HTMLButtonElement
  expect(add.disabled).toBe(false)
  fireEvent.click(add)
  expect(onEdit).toHaveBeenCalledWith({ kind: 'add', modId: 'FireResist4' })
  view.rerender(<CraftTargets {...props} catalog={primary} />)
  expect(
    (screen.getByRole('button', { name: '加入目标 FireResist4' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})
