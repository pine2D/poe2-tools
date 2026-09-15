import { type CraftCatalog, type CraftState, DESECRATION_SOURCE } from '@poe2-tools/item-core'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CraftComparisonPanel } from './CraftComparisonPanel'

const emptyDefinitions = { nextTargetId: 1, targets: [], alternatives: [], values: [] }

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
const desecrationCatalog: CraftCatalog = {
  ...catalog,
  _meta: {
    ...catalog._meta,
    sourceCommit: DESECRATION_SOURCE.commit,
    sources: [DESECRATION_SOURCE],
  },
}

describe('CraftComparisonPanel', () => {
  it('破裂目标按稳定目标ID关联实际词缀，并在同一实例核对数值', () => {
    const definitions = {
      nextTargetId: 8,
      targets: [{ targetId: 't7', modId: 'life' }],
      alternatives: [],
      values: [{ targetId: 't7', modId: 'life', bounds: [{ index: 0, min: 15 }] }],
      fracturedTargetId: 't7',
    }
    const props = { catalog, definitions, before }
    const view = render(
      <CraftComparisonPanel
        {...props}
        after={{ ...after, affixes: after.affixes.map((affix) => ({ ...affix, fractured: true })) }}
      />,
    )
    expect(screen.getByText('破裂目标：未达成 → 已达成')).toBeDefined()
    view.rerender(
      <CraftComparisonPanel
        {...props}
        after={{
          ...before,
          affixes: before.affixes.map((affix) => ({ ...affix, fractured: true })),
        }}
      />,
    )
    expect(screen.getByText('破裂目标：未达成 → 未达成')).toBeDefined()
  })
  it('按变化组展示中文与英文，前后区域有可访问名称并保留整组常量行', () => {
    render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
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
    const view = render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={catalog}
        before={empty}
        after={before}
      />,
    )
    expect(screen.getByText('新增')).toBeDefined()
    expect(screen.getByText('稀有度：普通 → 稀有')).toBeDefined()
    expect(screen.getByText('无此词缀')).toBeDefined()
    view.rerender(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={catalog}
        before={before}
        after={empty}
      />,
    )
    expect(screen.getByText('移除')).toBeDefined()
    expect(screen.getByText('无此词缀')).toBeDefined()
  })

  it('固有属性变化保留未知值提示，不把未知值显示成零', () => {
    render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
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
    render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={catalog}
        before={before}
        after={before}
      />,
    )
    expect(screen.getByText('没有可识别的属性变化。')).toBeDefined()
    expect(screen.queryByRole('region', { name: /操作前$/ })).toBeNull()
  })

  it('非法起点显示错误，不保留上一份对比', () => {
    const view = render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={catalog}
        before={before}
        after={after}
      />,
    )
    view.rerender(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={catalog}
        before={before}
        after={{ ...after, itemLevel: 71 }}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('相同基底')
    expect(screen.queryByText('+18 to maximum Life')).toBeNull()
  })

  it('同一实例换类型展示两侧名称和文本，连续预览保持实例节点且不显示跨类型差值', () => {
    const firstMod = catalog.modifiers[0]
    if (!firstMod) throw new Error('缺少测试词缀')
    const transformedCatalog: CraftCatalog = {
      ...desecrationCatalog,
      modifiers: [
        firstMod,
        {
          ...firstMod,
          id: 'mana',
          name: 'Resourceful',
          group: 'mana',
          lines: ['+(10-20) to maximum Mana'],
        },
      ],
    }
    const identifiedBefore: CraftState = {
      ...before,
      nextAffixId: 2,
      affixes: before.affixes.map((affix) => ({ ...affix, affixId: 'a1' })),
    }
    const identifiedAfter: CraftState = {
      ...after,
      nextAffixId: 2,
      affixes: after.affixes.map((affix) => ({ ...affix, affixId: 'a1' })),
    }
    const view = render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={transformedCatalog}
        before={identifiedBefore}
        after={identifiedAfter}
      />,
    )
    const instanceArticle = screen.getByRole('heading', { name: 'Healthy' }).closest('article')
    view.rerender(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={transformedCatalog}
        before={identifiedBefore}
        after={{
          ...identifiedAfter,
          affixes: [
            { modId: 'mana', affixId: 'a1', lines: ['+18 to maximum Mana'], desecrated: true },
          ],
        }}
      />,
    )
    const title = screen.getByRole('heading', { name: 'Healthy → Resourceful' })
    expect(title.closest('article')).toBe(instanceArticle)
    expect(screen.getByText('词缀转换')).toBeDefined()
    expect(screen.getByText('亵渎来源：普通 → 亵渎')).toBeDefined()
    expect(
      within(screen.getByRole('region', { name: 'Healthy → Resourceful · 操作前' })).getByText(
        '+12 to maximum Life',
      ),
    ).toBeDefined()
    expect(
      within(screen.getByRole('region', { name: 'Healthy → Resourceful · 操作后' })).getByText(
        '+18 to maximum Mana',
      ),
    ).toBeDefined()
    expect(screen.queryByText(/数值 1：/)).toBeNull()
    expect(screen.queryByText('新增')).toBeNull()
    expect(screen.queryByText('移除')).toBeNull()
  })

  it('同类型旧实例移除和新实例加入分开展示，来源徽标各自对应所属实例', () => {
    render(
      <CraftComparisonPanel
        definitions={emptyDefinitions}
        catalog={desecrationCatalog}
        before={{
          ...before,
          nextAffixId: 2,
          affixes: before.affixes.map((affix) => ({ ...affix, affixId: 'a1', desecrated: true })),
        }}
        after={{
          ...after,
          nextAffixId: 3,
          affixes: after.affixes.map((affix) => ({ ...affix, affixId: 'a2', crafted: true })),
        }}
      />,
    )
    const removed = screen.getByText('移除').closest('article')
    const added = screen.getByText('新增').closest('article')
    if (!removed || !added) throw new Error('缺少独立实例对照')
    expect(within(removed).getByText('亵渎')).toBeDefined()
    expect(within(removed).queryByText('工艺')).toBeNull()
    expect(within(added).getByText('工艺')).toBeDefined()
    expect(within(added).queryByText('亵渎')).toBeNull()
    expect(within(removed).getByText('+12 to maximum Life')).toBeDefined()
    expect(within(added).getByText('+18 to maximum Life')).toBeDefined()
    expect(screen.queryByText('数值变化')).toBeNull()
  })
})
