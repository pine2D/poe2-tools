import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftEntry } from './CraftEntry'

afterEach(cleanup)

it('搜索起点不按目录上限生成孔，显式设置已有空孔后才能镶嵌', () => {
  const base = {
    id: 'Test Helmet',
    name: 'Test Helmet',
    type: 'Helmet',
    tags: ['default'],
    requirements: {},
    properties: {},
    implicit: null,
    implicitTags: [],
    sourceQuality: null,
    socketLimit: 3,
    hidden: false,
    runeforged: false,
  }
  const catalog: CraftCatalog = {
    bases: [base],
    modifiers: [],
    augments: [],
    _meta: {
      schemaVersion: 2,
      tier: 'primary',
      sourceCommit: 'a'.repeat(40),
      gameVersion: null,
      generatedAt: '',
      weightStatus: 'unknown',
      excludedBases: [],
      sources: [
        {
          path: 'src/Data/ModRunes.lua',
          url: 'https://example.test/runes',
          sha256: 'b'.repeat(64),
        },
      ],
    },
  }
  render(
    <CraftEntry
      catalog={catalog}
      base={base}
      itemLevel={1}
      imported={undefined}
      translations={{}}
      translateLine={undefined}
      dictionary={undefined}
      onRestore={vi.fn()}
    />,
  )
  expect((screen.getByLabelText('起点已有空孔数') as HTMLSelectElement).value).toBe('0')
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByText(/当前装备没有已设定的孔/)).toBeDefined()
  fireEvent.change(screen.getByLabelText('起点已有空孔数'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '从空白基底开始' }))
  expect(screen.getByText('孔位 1 · 空孔')).toBeDefined()
  expect(screen.getByText('孔位 2 · 空孔')).toBeDefined()
  expect(screen.queryByText('孔位 3 · 空孔')).toBeNull()
})
