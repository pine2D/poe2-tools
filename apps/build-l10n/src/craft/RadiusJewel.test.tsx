import { readFileSync } from 'node:fs'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const catalog: CraftCatalog = JSON.parse(readFileSync('data/craft/catalog.json', 'utf8'))
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('实际演练入口显示当前半径，剥离预览和应用显示大到小', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      translations={{}}
      initialState={{
        baseId: 'Time-Lost Sapphire',
        itemLevel: 86,
        rarity: 'magic',
        sourceText:
          'Item Class: Jewels\nRarity: Magic\nTime-Lost Sapphire\n--------\nRadius: Large\n--------\nItem Level: 86\n--------\n{ Prefix Modifier "Grand" }\nUpgrades Radius to Large',
        affixes: [{ modId: 'JewelRadiusLargeSize', lines: ['Upgrades Radius to Large'] }],
      }}
    />,
  )
  const panel = screen.getByRole('region', { name: '珠宝半径' })
  expect(within(panel).getByText('大')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '剥离石' }))
  fireEvent.click(screen.getByRole('button', { name: /选择移除此组/ }))
  expect(within(panel).getByText(/应用后预计：大 → 小/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(within(panel).getByText('小')).toBeDefined()
  expect(within(panel).getByText(/本步变化：大 → 小/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(within(panel).getByText('大')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(within(panel).getByText('小')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.rulesVersion).toBe('basic-2026-09-12-v73')
  expect(saved.operations).toMatchObject([
    { currency: 'annulment', modIds: [], removeModId: 'JewelRadiusLargeSize', removeAffixId: 'a1' },
  ])
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.getByRole('region', { name: '珠宝半径' }).textContent).toContain('小')
})
