import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { type CraftCatalog, inspectModPool, JEWEL_SOURCE } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { fsPathFromMetaUrl } from '../testing/fsPath'
import { CatalogPanel } from './CatalogPanel'
import { LiquidEmotionCatalog } from './LiquidEmotionCatalog'
import { LiquidEmotionCraftPanel } from './LiquidEmotionCraftPanel'

const catalog: CraftCatalog = JSON.parse(
  readFileSync(
    resolve(dirname(fsPathFromMetaUrl(import.meta.url)), '../../../../data/craft/catalog.json'),
    'utf8',
  ),
)
const translateLine = (line: string) =>
  ({
    '(40-60)% increased Effect of Prefixes': '前缀效果提高 (40-60)%',
    '(40-60)% increased Effect of Suffixes': '后缀效果提高 (40-60)%',
  })[line] ?? null
const base = (id: string) => {
  const result = catalog.bases.find((entry) => entry.id === id)
  if (!result) throw Error(`缺少测试基底 ${id}`)
  return result
}
async function show(id: string) {
  render(
    <CatalogPanel
      translations={{}}
      initialBaseId={id}
      initialItemLevel={86}
      translateLine={translateLine}
      fetchImpl={vi.fn<typeof fetch>(async () => new Response(JSON.stringify(catalog)))}
    />,
  )
  await screen.findByRole('button', { name: '从空白基底开始' })
}
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it.each(['Ruby', 'Sapphire', 'Emerald', 'Diamond'])(
  '%s 可从基底目录搜索真实普通词缀',
  async (id) => {
    await show(id)
    const pool = screen.getByRole('region', { name: '词缀池' })
    const ordinary = inspectModPool(base(id), catalog.modifiers, 86)[0]?.mod
    if (!ordinary) throw Error('缺少普通词缀')
    fireEvent.change(within(pool).getByRole('searchbox', { name: '搜索词缀' }), {
      target: { value: ordinary.id },
    })
    expect(within(pool).getByText(ordinary.lines[0] ?? '')).toBeDefined()
    expect(within(pool).getByText('匹配 1 条，当前展示 1 条。')).toBeDefined()
    fireEvent.change(within(pool).getByRole('searchbox', { name: '搜索词缀' }), {
      target: { value: 'CraftedJewel' },
    })
    expect(within(pool).getByText('匹配 0 条，当前展示 0 条。')).toBeDefined()
    expect(screen.queryByText(/珠宝、药剂与咒符的专属词缀池尚未收录/)).toBeNull()
  },
)

it('开始制作前可以按中文保证属性查到双侧液态材料，工艺与普通池分开', async () => {
  await show('Ruby')
  fireEvent.click(screen.getByText('液态情感与保证属性'))
  const region = screen.getByRole('region', { name: '液态保证属性目录' })
  fireEvent.change(within(region).getByRole('searchbox'), { target: { value: '后缀效果' } })
  expect(within(region).getByText('Potent Liquid Ferocity')).toBeDefined()
  expect(within(region).getByText('前缀效果提高 (40-60)%')).toBeDefined()
  expect(within(region).getByText('后缀效果提高 (40-60)%')).toBeDefined()
  expect(within(region).getAllByText('工艺属性')).toHaveLength(2)
  expect(within(region).queryByRole('button', { name: '选择材料' })).toBeNull()
  expect(screen.queryByRole('region', { name: '液态情感材料列表' })).toBeNull()
})

it('液态制作按保证属性检索，尚未准备稀有装备也能查看结果与不可用原因', () => {
  render(
    <LiquidEmotionCraftPanel
      catalog={catalog}
      state={{ baseId: 'Ruby', itemLevel: 86, rarity: 'normal', affixes: [], sourceText: null }}
      translations={{}}
      translateLine={translateLine}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByText('液态情感制作'))
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索液态情感' }), {
    target: { value: '后缀效果' },
  })
  const list = screen.getByRole('region', { name: '液态情感材料列表' })
  expect(within(list).getByText(/后缀效果提高/)).toBeDefined()
  expect(within(list).getByText(/稀有/)).toBeDefined()
  expect(within(list).queryByRole('button', { name: /选择液态情感/ })).toBeNull()
})

it.each(['Time-Lost Ruby', 'Time-Lost Emerald', 'Time-Lost Sapphire', 'Time-Lost Diamond'])(
  '%s 查询保留范围语义，不能混入普通珠宝或借此开始制作',
  async (id) => {
    render(
      <CatalogPanel
        translations={{}}
        initialBaseId={id}
        initialItemLevel={86}
        fetchImpl={vi.fn<typeof fetch>(async () => new Response(JSON.stringify(catalog)))}
      />,
    )
    const pool = await screen.findByRole('region', { name: '词缀池' })
    fireEvent.change(within(pool).getByRole('searchbox'), {
      target: { value: 'JewelRadiusNotableEffectNew' },
    })
    expect(
      within(pool).getByText('(15-25)% increased Effect of Notable Passive Skills in Radius'),
    ).toBeDefined()
    fireEvent.change(within(pool).getByRole('searchbox'), { target: { value: 'JewelLifeonKill' } })
    expect(within(pool).getByText('匹配 0 条，当前展示 0 条。')).toBeDefined()
    expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
  },
)

it.each([
  ['Timeless Jewel', '特殊珠宝的制作词缀池尚未开放。'],
  ['Ruby Charm', '药剂与咒符的专属词缀池尚未收录，因此不展示词缀结果。'],
])('%s 不会因开放普通珠宝而展示错误的常规池', async (id, reason) => {
  render(
    <CatalogPanel
      translations={{}}
      initialBaseId={id}
      initialItemLevel={86}
      fetchImpl={vi.fn<typeof fetch>(async () => new Response(JSON.stringify(catalog)))}
    />,
  )
  expect(await screen.findByText(reason)).toBeDefined()
  expect(screen.queryByRole('region', { name: '词缀池' })).toBeNull()
  expect(screen.queryByRole('button', { name: '从空白基底开始' })).toBeNull()
})

it('液态目录采用独立繁中材料名，支持混合词检索，查询不改制作状态', () => {
  const copy = structuredClone(catalog)
  if (!copy.localizedNames) throw Error('缺少本地名称')
  copy.localizedNames['zh-TW']['Potent Liquid Ferocity'] = '測試繁中凶殘'
  render(<LiquidEmotionCatalog catalog={copy} base={base('Ruby')} locale="zh-TW" />)
  fireEvent.click(screen.getByText('液态情感与保证属性'))
  const region = screen.getByRole('region', { name: '液态保证属性目录' })
  fireEvent.change(within(region).getByRole('searchbox'), { target: { value: '測試 suffix' } })
  expect(within(region).getByText('測試繁中凶殘')).toBeDefined()
  expect(within(region).getByText('CraftedJewelSuffixEffect')).toBeDefined()
  fireEvent.change(within(region).getByRole('searchbox'), { target: { value: '不会命中的属性' } })
  expect(within(region).getByText('没有匹配的液态材料或保证属性。')).toBeDefined()
  expect(within(region).queryByRole('button')).toBeNull()
})

it('缺少可信珠宝来源时只显示材料拒绝原因，不展示保证效果', () => {
  const copy = structuredClone(catalog)
  copy._meta.sources = copy._meta.sources.filter((source) => source.path !== JEWEL_SOURCE.path)
  render(<LiquidEmotionCatalog catalog={copy} base={base('Ruby')} translateLine={translateLine} />)
  fireEvent.click(screen.getByText('液态情感与保证属性'))
  const region = screen.getByRole('region', { name: '液态保证属性目录' })
  fireEvent.change(within(region).getByRole('searchbox'), {
    target: { value: 'Metadata/Items/Currency/EndgameDistilledEmotion2' },
  })
  expect(within(region).getByText('液态情感或珠宝目录来源指纹缺失或无效。')).toBeDefined()
  expect(within(region).queryByText('前缀效果提高 (40-60)%')).toBeNull()
})
