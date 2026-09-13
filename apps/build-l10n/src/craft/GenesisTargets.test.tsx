import { inspectItem, parseItem } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { boneCatalog } from '../../../../packages/item-core/src/boneTestFixture'
import { CraftEntry } from './CraftEntry'

afterEach(cleanup)

function start(imported: boolean, ordinary = false) {
  const catalog = boneCatalog('Ring')
  const base = catalog.bases[0]
  const mod = catalog.modifiers[0]
  if (!base || !mod) throw new Error('合成目录缺失')
  base.tags.push('genesis_tree_minion')
  mod.eligibility = [
    { tag: 'genesis_tree_minion', value: 1 },
    { tag: 'default', value: ordinary ? 1 : 0 },
  ]
  const parsed = parseItem(
    [
      'Item Class: Rings',
      'Rarity: Rare',
      'Test Ring',
      base.name,
      '--------',
      'Item Level: 64',
      '--------',
      '{ Prefix Modifier "prefix1" (Tier: 1) }',
      'prefix1 5(1-10)',
    ].join('\n'),
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const inspection = inspectItem(parsed.item, {})
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={64}
      imported={
        imported ? { baseId: base.id, item: parsed.item, mods: inspection.mods } : undefined
      }
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  fireEvent.click(
    screen.getByRole('button', { name: imported ? '从当前装备开始' : '从空白基底开始' }),
  )
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索目标词缀' }), {
    target: { value: 'prefix1' },
  })
  const results = screen.getByRole('region', { name: '目标词缀搜索结果' })
  if (ordinary) expect(within(results).queryByText('Genesis Tree 专属 · 支持已有属性')).toBeNull()
  else expect(within(results).getByText('Genesis Tree 专属 · 支持已有属性')).toBeDefined()
  fireEvent.click(within(results).getByRole('button', { name: '加入目标 prefix1' }))
}

it('已有 Genesis 属性可设数值目标、预览神圣风险并应用和撤销', () => {
  start(true)
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 prefix1' }))
  fireEvent.change(screen.getByLabelText('prefix1 · 数值 1 最小值'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数值条件 prefix1' }))
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
  expect(screen.getByText(/神圣同时重掷显式与固有范围/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '演练建议：神圣石' }))
  fireEvent.change(screen.getByLabelText('prefix1 · 数值 1'), { target: { value: '9' } })
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('已达成 1 / 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('已达成 0 / 1')).toBeDefined()
})

it('缺失 Genesis 目标仍可查看候选，但明确尚不支持新增', () => {
  start(false)
  expect(screen.getByText(/此 Genesis Tree 专属目标尚不支持新增/)).toBeDefined()
  expect(screen.queryByRole('button', { name: '演练建议：神圣石' })).toBeNull()
})

it('兼有普通生成资格的属性不标为 Genesis 专属', () => {
  start(false, true)
  expect(screen.queryByText(/此 Genesis Tree 专属目标尚不支持新增/)).toBeNull()
})
