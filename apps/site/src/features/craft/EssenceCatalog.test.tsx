import type { CatalogBase, CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EssenceCatalog } from './EssenceCatalog'

const base: CatalogBase = {
  id: 'Test Focus',
  name: 'Test Focus',
  type: 'Focus',
  tags: ['focus'],
  requirements: {},
  properties: {},
  implicit: null,
  implicitTags: [],
  sourceQuality: null,
  socketLimit: null,
  hidden: false,
  runeforged: false,
}
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [],
    excludedBases: [],
  },
  bases: [base],
  modifiers: [
    {
      id: 'EssenceShield',
      name: 'Protective',
      kind: 'prefix',
      group: 'LocalShield',
      level: 99,
      lines: ['+(20-30) to maximum Energy Shield'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 0 }],
      tradeHashes: {},
    },
  ],
  essences: [
    {
      id: 'Metadata/Items/Currency/TestEssence',
      name: 'Test Essence',
      type: 'Test',
      tierLevel: 88,
      mods: { Focus: 'EssenceShield' },
    },
    {
      id: 'Metadata/Items/Currency/UnknownEssence',
      name: 'Unknown Essence',
      type: 'Unknown',
      tierLevel: 88,
      mods: { Focus: 'UnresolvedEffectDisplay', Helmet: 'HelmetEffectDisplay' },
    },
  ],
  localizedNames: {
    'zh-CN': { 'Test Essence': '测试精华' },
    'zh-TW': { 'Test Essence': '測試精髓' },
  },
}
const translateLine = (line: string) =>
  line === '+(20-30) to maximum Energy Shield' ? '+(20-30) 最大能量护盾' : null

afterEach(cleanup)

it.each([
  ['EssenceDisplayAttributes3', '属性候选'],
  ['EssenceDisplayDefences3', '防御结果'],
  ['EssenceGrantedPassive', '随机核心天赋'],
])('未解析的 %s 给出具体工具限制，仍可按来源编号检索', (modId, reason) => {
  const unresolvedCatalog = {
    ...catalog,
    essences: [
      {
        id: 'test-unresolved',
        name: 'Test unresolved',
        type: 'Test',
        tierLevel: 1,
        mods: { Focus: modId },
      },
    ],
  }
  render(<EssenceCatalog catalog={unresolvedCatalog} base={base} />)
  fireEvent.change(screen.getByLabelText('搜索精华与保证属性'), { target: { value: modId } })
  expect(screen.getByText(new RegExp(reason)).textContent).toContain('当前目录')
  expect(screen.getByText(modId)).toBeDefined()
  expect(screen.queryByRole('button')).toBeNull()
})

it('默认折叠，展示中文和英文映射，不把来源等级显示为操作门槛', () => {
  render(<EssenceCatalog catalog={catalog} base={base} translateLine={translateLine} />)
  expect(screen.getByText('精华与保证属性').closest('details')?.open).toBe(false)
  fireEvent.click(screen.getByText('精华与保证属性'))
  expect(screen.getByText('测试精华')).toBeDefined()
  expect(screen.getByText('Test Essence')).toBeDefined()
  expect(screen.getByText('+(20-30) 最大能量护盾')).toBeDefined()
  expect(screen.getByText('+(20-30) to maximum Energy Shield')).toBeDefined()
  expect(screen.getByText('前缀 · 冲突组 LocalShield')).toBeDefined()
  expect(screen.getByText(/精华升级与稀有替换已接入，具体可用性以演练区为准/)).toBeDefined()
  expect(screen.queryByText(/需求等级|88|99/)).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
})

it.each(['测试精华', 'TEST ESSENCE', '最大能量护盾', 'maximum Energy Shield', 'essenceshield'])(
  '按材料与效果的中英文或 modId 搜索：%s',
  (query) => {
    render(<EssenceCatalog catalog={catalog} base={base} translateLine={translateLine} />)
    fireEvent.click(screen.getByText('精华与保证属性'))
    fireEvent.change(screen.getByLabelText('搜索精华与保证属性'), { target: { value: query } })
    expect(screen.getByText('Test Essence')).toBeDefined()
    expect(screen.queryByText('Unknown Essence')).toBeNull()
  },
)

it('未解析效果保留 modId，并说明不能模拟', () => {
  render(<EssenceCatalog catalog={catalog} base={base} />)
  fireEvent.click(screen.getByText('精华与保证属性'))
  fireEvent.change(screen.getByLabelText('搜索精华与保证属性'), {
    target: { value: 'UnresolvedEffectDisplay' },
  })
  expect(screen.getByText('UnresolvedEffectDisplay')).toBeDefined()
  expect(screen.getByText('此效果尚未解析，不能据此模拟。')).toBeDefined()
  expect(screen.queryByText('Test Essence')).toBeNull()
})

it('使用独立台服名称，并随当前基底更新类别映射', () => {
  const view = render(<EssenceCatalog catalog={catalog} base={base} locale="zh-TW" />)
  fireEvent.click(screen.getByText('精华与保证属性'))
  expect(screen.getByText('測試精髓')).toBeDefined()
  expect(screen.queryByText('测试精华')).toBeNull()
  view.rerender(
    <EssenceCatalog catalog={catalog} base={{ ...base, type: 'Helmet' }} locale="zh-TW" />,
  )
  expect(screen.getByText('HelmetEffectDisplay')).toBeDefined()
  expect(screen.queryByText('UnresolvedEffectDisplay')).toBeNull()
  expect(screen.queryByText('Test Essence')).toBeNull()
  view.rerender(<EssenceCatalog catalog={catalog} base={{ ...base, type: 'Charm' }} />)
  expect(screen.getByText('此装备类别暂无精华映射。')).toBeDefined()
  expect(screen.queryByRole('button')).toBeNull()
})

it('没有匹配搜索结果时显示明确空状态', () => {
  render(<EssenceCatalog catalog={catalog} base={base} />)
  fireEvent.click(screen.getByText('精华与保证属性'))
  fireEvent.change(screen.getByLabelText('搜索精华与保证属性'), { target: { value: '不存在' } })
  expect(screen.getByText('没有匹配的精华或保证属性。')).toBeDefined()
})
