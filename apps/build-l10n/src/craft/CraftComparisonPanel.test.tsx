import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CraftComparisonPanel } from './CraftComparisonPanel'

afterEach(cleanup)

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [
    {
      id: 'ring',
      name: 'Ring',
      type: 'Ring',
      tags: ['default'],
      requirements: {},
      properties: {},
      implicit: '+(5-10) to Strength',
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'life',
      name: 'Healthy',
      group: 'life',
      kind: 'prefix',
      level: 1,
      lines: ['+(10-20) to maximum Life', 'Grants Level 12 Skill'],
      statOrder: [],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
}
const before: CraftState = {
  baseId: 'ring',
  itemLevel: 70,
  rarity: 'rare',
  sourceText: null,
  affixes: [{ modId: 'life', lines: ['+12 to maximum Life', 'Grants Level 12 Skill'] }],
}
const after: CraftState = {
  ...before,
  affixes: [{ modId: 'life', lines: ['+18 to maximum Life', 'Grants Level 12 Skill'] }],
}

describe('CraftComparisonPanel', () => {
  it('按变化组展示中文与英文，前后区域有可访问名称并保留整组常量行', () => {
    render(
      <CraftComparisonPanel
        catalog={catalog}
        before={before}
        after={after}
        translateLine={(line) =>
          line.includes('Life') ? line.replace('to maximum Life', '最大生命') : null
        }
      />,
    )
    const panel = screen.getByRole('region', { name: '操作前后变化' })
    expect(within(panel).getByText('数值变化')).toBeDefined()
    const previous = within(panel).getByRole('region', { name: 'Healthy · 操作前' })
    const next = within(panel).getByRole('region', { name: 'Healthy · 操作后' })
    expect(within(previous).getByText('+12 最大生命')).toBeDefined()
    expect(within(previous).getByText('+12 to maximum Life').getAttribute('lang')).toBe('en')
    expect(within(next).getByText('+18 最大生命')).toBeDefined()
    expect(within(previous).getByText('Grants Level 12 Skill')).toBeDefined()
    expect(within(next).getByText('Grants Level 12 Skill')).toBeDefined()
    expect(within(panel).getByText('数值 1：12 → 18')).toBeDefined()
  })

  it('新增与移除用文字区分，空侧明确无此词缀', () => {
    const empty = { ...before, affixes: [], rarity: 'normal' as const }
    const view = render(<CraftComparisonPanel catalog={catalog} before={empty} after={before} />)
    expect(screen.getByText('新增')).toBeDefined()
    expect(screen.getByText('稀有度：普通 → 稀有')).toBeDefined()
    expect(screen.getByText('无此词缀')).toBeDefined()
    view.rerender(<CraftComparisonPanel catalog={catalog} before={before} after={empty} />)
    expect(screen.getByText('移除')).toBeDefined()
    expect(screen.getByText('无此词缀')).toBeDefined()
  })

  it('固有属性变化保留未知值提示，不把未知值显示成零', () => {
    render(
      <CraftComparisonPanel
        catalog={catalog}
        before={before}
        after={{ ...before, implicitLines: ['+7 to Strength'] }}
      />,
    )
    expect(screen.getByText('固有属性')).toBeDefined()
    expect(screen.getByText('数值 1：未知 → 7')).toBeDefined()
    expect(screen.getByRole('region', { name: '固有属性 · 操作前' })).toBeDefined()
  })

  it('无语义变化清楚说明，不显示空前后区域', () => {
    render(<CraftComparisonPanel catalog={catalog} before={before} after={before} />)
    expect(screen.getByText('没有可识别的属性变化。')).toBeDefined()
    expect(screen.queryByRole('region', { name: /操作前$/ })).toBeNull()
  })

  it('非法起点显示错误，不保留上一份对比', () => {
    const view = render(<CraftComparisonPanel catalog={catalog} before={before} after={after} />)
    view.rerender(
      <CraftComparisonPanel
        catalog={catalog}
        before={before}
        after={{ ...after, itemLevel: 71 }}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('相同基底')
    expect(screen.queryByText('+18 to maximum Life')).toBeNull()
  })
})
