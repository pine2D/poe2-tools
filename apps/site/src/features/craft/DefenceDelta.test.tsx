import { readFileSync } from 'node:fs'
import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DefencePanel } from './DefencePanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
const before: CraftState = {
  baseId: 'Adherent Cuffs',
  itemLevel: 86,
  rarity: 'normal',
  quality: 0,
  sockets: [],
  affixes: [],
  sourceText: null,
}
const after: CraftState = { ...before, baseId: 'Runeforged Adherent Cuffs' }
afterEach(cleanup)
it('成功估算的前后状态展示新增与消失的防御项', () => {
  const view = render(
    <DefencePanel catalog={catalog} current={after} before={before} after={after} preview />,
  )
  expect(screen.getByText('0 → 134（+134）')).toBeTruthy()
  view.rerender(
    <DefencePanel catalog={catalog} current={before} before={after} after={before} preview />,
  )
  expect(screen.getByText('134 → 0（-134）')).toBeTruthy()
})
it('未知品质造成的估算失败不能按零计算差值', () => {
  const { quality: _quality, ...unknown } = before
  render(<DefencePanel catalog={catalog} current={after} before={unknown} after={after} preview />)
  expect(screen.queryByText('0 → 134（+134）')).toBeNull()
  expect(screen.getByText(/前值无法估算/)).toBeTruthy()
})
