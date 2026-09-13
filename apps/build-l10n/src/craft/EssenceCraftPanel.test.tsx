import type { CraftCatalog, CraftState } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { EssenceCraftPanel } from './EssenceCraftPanel'
import { REHEARSAL_PROJECT_KEY } from './ProjectControls'
import { RehearsalPanel } from './RehearsalPanel'

const essenceId = 'Metadata/Items/Currency/CurrencyLesserEssenceLife'
const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'a'.repeat(40),
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [
      {
        path: 'src/Data/Essence.lua',
        url: 'https://example.test/Essence.lua',
        sha256: 'b'.repeat(64),
      },
    ],
    excludedBases: [],
  },
  bases: [
    {
      id: 'Helmet',
      name: 'Helmet',
      type: 'Helmet',
      tags: ['helmet'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: false,
      runeforged: false,
    },
  ],
  modifiers: [
    {
      id: 'Life',
      name: 'Healthy',
      kind: 'prefix',
      group: 'Life',
      level: 1,
      lines: ['+(10-20) to maximum Life'],
      statOrder: [1],
      tags: [],
      addsTags: [],
      eligibility: [{ tag: 'helmet', value: 1 }],
      tradeHashes: {},
    },
  ],
  essences: [
    {
      id: essenceId,
      name: 'Lesser Essence of Life',
      type: 'Life',
      tierLevel: 1,
      mods: { Helmet: 'Life' },
    },
    {
      id: 'Metadata/Items/Currency/CurrencyPerfectEssenceLife',
      name: 'Perfect Essence of Life',
      type: 'Life',
      tierLevel: 4,
      mods: { Helmet: 'Life' },
    },
  ],
}
const lifeMod = catalog.modifiers[0]
if (!lifeMod) throw new Error('合成生命词缀缺失')
catalog.modifiers.push({
  ...lifeMod,
  id: 'Fire',
  name: 'Embers',
  kind: 'suffix',
  group: 'Fire',
  lines: ['+(10-20)% to Fire Resistance'],
})
const state: CraftState = {
  baseId: 'Helmet',
  itemLevel: 80,
  rarity: 'magic',
  affixes: [],
  sourceText: null,
}
const translations = { 'Lesser Essence of Life': '低阶生命精华' }
const perfectEssenceId = 'Metadata/Items/Currency/CurrencyPerfectEssenceLife'
const replacementState: CraftState = {
  ...state,
  rarity: 'rare',
  affixes: [{ modId: 'Fire', lines: ['+18% to Fire Resistance'] }],
}

it.each(['Lesser', '', 'Greater'])('前三档 %s 精华仍直接升级且不携带移除字段', (tier) => {
  const id = `Metadata/Items/Currency/Currency${tier}EssenceLife`
  const onPreview = vi.fn()
  render(
    <EssenceCraftPanel
      catalog={{
        ...catalog,
        essences: [
          { id, name: 'Test Essence', type: 'Life', tierLevel: 1, mods: { Helmet: 'Life' } },
        ],
      }}
      state={state}
      translations={{}}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Test Essence' }))
  expect(screen.queryByRole('radio')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  expect(onPreview).toHaveBeenCalledWith({ kind: 'essence', essenceId: id, values: [10] })
})

it('精华独有保证属性可以搜索设为目标并在制作面板提示', () => {
  const essenceOnlyCatalog = {
    ...catalog,
    modifiers: catalog.modifiers.map((mod) =>
      mod.id === 'Life' ? { ...mod, eligibility: [] } : mod,
    ),
  }
  render(
    <RehearsalPanel
      catalog={essenceOnlyCatalog}
      initialState={replacementState}
      translations={translations}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Life' } })
  expect(screen.getByText(/精华保证来源：/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(screen.getByText('保证目标词缀；数值仍需核对')).toBeDefined()
})

it('替换必须显式选择整组，并提示接受替代目标的风险', () => {
  const onPreview = vi.fn()
  render(
    <EssenceCraftPanel
      catalog={catalog}
      state={replacementState}
      translations={translations}
      translateLine={(line) => (line === '+18% to Fire Resistance' ? '+18% 火焰抗性' : null)}
      disabled={false}
      targetModIds={['BestFire']}
      targetAlternatives={[{ targetModId: 'BestFire', modIds: ['Fire'] }]}
      onPreview={onPreview}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(screen.getByText(/游戏会随机移除/)).toBeDefined()
  expect(screen.getByText(/移除池中的目标风险：BestFire/)).toBeDefined()
  const preview = screen.getByRole('button', { name: '预览精华结果' })
  expect(preview.hasAttribute('disabled')).toBe(true)
  const removal = screen.getByRole('radio', { name: /Fire · Embers/ })
  expect((removal as HTMLInputElement).checked).toBe(false)
  expect(screen.getByText('+18% 火焰抗性')).toBeDefined()
  fireEvent.click(removal)
  expect(screen.getByText(/本次指定移除将失去目标：BestFire/)).toBeDefined()
  fireEvent.click(preview)
  expect(onPreview).toHaveBeenLastCalledWith({
    kind: 'essence',
    essenceId: perfectEssenceId,
    removeModId: 'Fire',
    values: [10],
  })
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(preview.hasAttribute('disabled')).toBe(true)
})

it('稀有替换的取消、费用、撤销与保存恢复保留明确移除结果', () => {
  const fire = catalog.modifiers.find((mod) => mod.id === 'Fire')
  if (!fire) throw new Error('合成火抗词缀缺失')
  const historyCatalog = {
    ...catalog,
    modifiers: [
      ...catalog.modifiers,
      {
        ...fire,
        id: 'Cold',
        name: 'Frozen',
        group: 'Cold',
        lines: ['+(10-20)% to Cold Resistance'],
      },
    ],
  }
  render(
    <RehearsalPanel
      catalog={historyCatalog}
      initialState={{ ...state, rarity: 'normal' }}
      translations={translations}
    />,
  )
  for (const [currency, mod] of [
    ['蜕变石', 'Fire · Embers'],
    ['富豪石', 'Cold · Frozen'],
  ]) {
    if (!currency || !mod) throw new Error('缺少合成步骤')
    fireEvent.click(screen.getByRole('button', { name: currency }))
    fireEvent.click(
      within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: new RegExp(mod) }),
    )
    fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  }
  const choose = () => {
    fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
    fireEvent.click(screen.getByRole('radio', { name: /Fire · Embers/ }))
    fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  }
  choose()
  expect(screen.getByText(/稀有度不变/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '展开前后变化' }))
  expect(screen.getByText('移除')).toBeDefined()
  expect(screen.getByText('新增')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '取消精华结果' }))
  expect(screen.queryByRole('radio')).toBeNull()
  expect(screen.queryByText('Perfect Essence of Life × 1')).toBeNull()
  choose()
  fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(within(screen.getByLabelText('演练项目')).getByRole('status').textContent).toContain(
    '已保存到本机',
  )
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations.at(-1),
  ).toMatchObject({ removeModId: 'Fire' })
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('Perfect Essence of Life × 1')).toBeNull()
  choose()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.queryByRole('button', { name: '应用精华结果' })).toBeNull()
  expect(screen.queryByRole('radio')).toBeNull()
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('工艺词缀 1/1')).toBeDefined()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

it('精华搜索、禁用原因及目标替代数值条件使用同一草稿', () => {
  const onPreview = vi.fn()
  render(
    <EssenceCraftPanel
      catalog={catalog}
      state={state}
      translations={translations}
      disabled={false}
      targetModIds={['OtherLife']}
      targetAlternatives={[{ targetModId: 'OtherLife', modIds: ['Life'] }]}
      targetValues={[{ modId: 'Life', bounds: [{ index: 0, min: 15 }] }]}
      onPreview={onPreview}
    />,
  )
  expect(screen.getByText('工艺词缀 0/1')).toBeDefined()
  expect(
    screen
      .getByRole('button', { name: '选择精华 Perfect Essence of Life' })
      .hasAttribute('disabled'),
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('搜索可演练精华'), { target: { value: '低阶生命' } })
  expect(screen.queryByText('Perfect Essence of Life')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '选择精华 低阶生命精华' }))
  expect(screen.getByText('保证目标词缀；数值仍需核对')).toBeDefined()
  expect(screen.getByText(/当前数值不满足/)).toBeDefined()
  fireEvent.change(screen.getByLabelText('低阶生命精华 · 数值 1'), { target: { value: '18' } })
  expect(screen.getByText(/当前数值满足/)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  expect(onPreview).toHaveBeenLastCalledWith({ kind: 'essence', essenceId, values: [18] })
})

it('取消不消费、应用有工艺徽标、撤销重做以及保存恢复后可继续制作', () => {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={{ ...state, rarity: 'normal' }}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /Fire · Embers/ }),
  )
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  const choose = () => {
    fireEvent.click(screen.getByRole('button', { name: '选择精华 低阶生命精华' }))
    fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  }
  choose()
  expect(screen.getByText('当前装备与待应用结果')).toBeDefined()
  expect(screen.getByRole('button', { name: '增幅石' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '取消精华结果' }))
  expect(screen.queryByText('低阶生命精华 × 1')).toBeNull()
  choose()
  fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
  expect(screen.getByText('工艺词缀 1/1')).toBeDefined()
  expect(screen.getByText('工艺')).toBeDefined()
  expect(screen.getByText('低阶生命精华 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByText('工艺词缀 0/1')).toBeDefined()
  expect(screen.queryByText('低阶生命精华 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(within(screen.getByLabelText('演练项目')).getByRole('status').textContent).toContain(
    '已保存到本机',
  )
  expect(JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').essenceSourceHash).toBe(
    'b'.repeat(64),
  )
  choose()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.queryByRole('button', { name: '应用精华结果' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('工艺词缀 1/1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '神圣石' }))
  expect(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: '应用本次结果' }),
  ).toBeDefined()
})

it('低物等显示工具覆盖边界，英文搜索和越界数值阻止预览', () => {
  const higherCatalog = {
    ...catalog,
    modifiers: catalog.modifiers.map((mod) => ({ ...mod, level: 10 })),
  }
  const onPreview = vi.fn()
  const view = render(
    <EssenceCraftPanel
      catalog={higherCatalog}
      state={{ ...state, itemLevel: 5 }}
      translations={translations}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  expect(
    screen.getByRole('button', { name: '选择精华 低阶生命精华' }).hasAttribute('disabled'),
  ).toBe(true)
  expect(screen.getByText('低物等交互尚未验证，暂不支持。')).toBeDefined()
  view.rerender(
    <EssenceCraftPanel
      catalog={catalog}
      state={state}
      translations={translations}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索可演练精华'), { target: { value: 'LESSER ESSENCE' } })
  expect(screen.queryByText('Perfect Essence of Life')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '选择精华 低阶生命精华' }))
  fireEvent.change(screen.getByLabelText('低阶生命精华 · 数值 1'), { target: { value: '999' } })
  expect(screen.getByRole('button', { name: '预览精华结果' }).hasAttribute('disabled')).toBe(true)
  expect(onPreview).not.toHaveBeenCalled()
})

it('对比明确区分工艺来源变化与纯数值变化', () => {
  const normal: CraftState = {
    ...state,
    rarity: 'rare',
    affixes: [{ modId: 'Life', lines: ['+18 to maximum Life'] }],
  }
  const crafted: CraftState = {
    ...normal,
    affixes: [{ modId: 'Life', lines: ['+18 to maximum Life'], crafted: true }],
  }
  render(<CraftComparisonPanel catalog={catalog} before={crafted} after={normal} />)
  expect(screen.getByText('来源变化')).toBeDefined()
  expect(screen.getByText('工艺来源：工艺 → 普通')).toBeDefined()
  expect(screen.queryByText('数值变化')).toBeNull()
})

it('无法制作时仍可按保证属性搜索，过滤没有当前类别映射的精华', () => {
  render(
    <EssenceCraftPanel
      catalog={{
        ...catalog,
        essences: [
          ...(catalog.essences ?? []),
          {
            id: 'Metadata/Items/Currency/CurrencyEssenceCold',
            name: 'Other Base Essence',
            type: 'Cold',
            tierLevel: 2,
            mods: { Ring: 'Life' },
          },
        ],
      }}
      state={{ ...state, rarity: 'rare' }}
      translations={translations}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  const list = screen.getByRole('region', { name: '当前基底精华列表' })
  expect(list.tabIndex).toBe(0)
  list.focus()
  expect(document.activeElement).toBe(list)
  expect(screen.queryByText('Other Base Essence')).toBeNull()
  fireEvent.change(screen.getByLabelText('搜索可演练精华'), { target: { value: 'maximum Life' } })
  expect(screen.getByText('低阶生命精华')).toBeDefined()
  expect(
    screen.getByRole('button', { name: '选择精华 低阶生命精华' }).hasAttribute('disabled'),
  ).toBe(true)
})

const omenTranslations = {
  ...translations,
  'Omen of Sinistral Crystallisation': '左旋结晶预兆',
  'Omen of Dextral Crystallisation': '右旋结晶预兆',
}
const mixedState: CraftState = {
  ...replacementState,
  affixes: [...replacementState.affixes, { modId: 'Armour', lines: ['+18 to Armour'] }],
}
const mixedCatalog: CraftCatalog = {
  ...catalog,
  modifiers: [
    ...catalog.modifiers,
    {
      ...lifeMod,
      id: 'Armour',
      group: 'Armour',
      name: 'Armoured',
      lines: ['+(10-20) to Armour'],
    },
  ],
}

it('结晶预兆过滤目标风险，切换清空材料、移除及数值选择', () => {
  render(
    <EssenceCraftPanel
      catalog={mixedCatalog}
      state={mixedState}
      translations={omenTranslations}
      disabled={false}
      onPreview={vi.fn()}
      targetModIds={['Armour', 'BestFire']}
      targetAlternatives={[{ targetModId: 'BestFire', modIds: ['Fire'] }]}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(screen.getByRole('radio', { name: /Fire · Embers/ })).toBeDefined()
  expect(screen.getByRole('radio', { name: /Armour · Armoured/ })).toBeDefined()
  fireEvent.change(screen.getByLabelText('精华预兆'), {
    target: { value: 'sinistral_crystallisation' },
  })
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(screen.getByText(/移除池中的目标风险：Armour。/)).toBeDefined()
  expect(screen.queryByRole('radio', { name: /Fire · Embers/ })).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: /Armour · Armoured/ }))
  fireEvent.change(screen.getByLabelText('Perfect Essence of Life · 数值 1'), {
    target: { value: '19' },
  })
  fireEvent.change(screen.getByLabelText('精华预兆'), { target: { value: '' } })
  expect(screen.queryByLabelText('精华保证结果')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(
    (screen.getByLabelText('Perfect Essence of Life · 数值 1') as HTMLInputElement).value,
  ).toBe('10')
  expect(screen.getByRole('button', { name: '预览精华结果' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByLabelText('精华预兆'), {
    target: { value: 'dextral_crystallisation' },
  })
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  expect(screen.getByText(/移除池中的目标风险：BestFire。/)).toBeDefined()
  expect(screen.queryByRole('radio', { name: /Armour · Armoured/ })).toBeNull()
})

it('右旋允许跨保证侧移除，左旋空交集使材料不可用', () => {
  const onPreview = vi.fn()
  render(
    <EssenceCraftPanel
      catalog={catalog}
      state={replacementState}
      translations={omenTranslations}
      disabled={false}
      onPreview={onPreview}
    />,
  )
  fireEvent.change(screen.getByLabelText('精华预兆'), {
    target: { value: 'sinistral_crystallisation' },
  })
  expect(
    screen
      .getByRole('button', { name: '选择精华 Perfect Essence of Life' })
      .hasAttribute('disabled'),
  ).toBe(true)
  fireEvent.change(screen.getByLabelText('精华预兆'), {
    target: { value: 'dextral_crystallisation' },
  })
  fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
  fireEvent.click(screen.getByRole('radio', { name: /Fire · Embers/ }))
  fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  expect(onPreview).toHaveBeenCalledWith({
    kind: 'essence',
    essenceId: perfectEssenceId,
    omen: 'dextral_crystallisation',
    removeModId: 'Fire',
    values: [10],
  })
})

it.each(['Lesser', '', 'Greater'])('结晶预兆禁用 %s 档升级精华', (tier) => {
  render(
    <EssenceCraftPanel
      catalog={{
        ...catalog,
        essences: [
          {
            id: `Metadata/Items/Currency/Currency${tier}EssenceLife`,
            name: 'Test Essence',
            type: 'Life',
            tierLevel: 1,
            mods: { Helmet: 'Life' },
          },
        ],
      }}
      state={state}
      translations={omenTranslations}
      disabled={false}
      onPreview={vi.fn()}
    />,
  )
  expect(
    screen.getByRole('button', { name: '选择精华 Test Essence' }).hasAttribute('disabled'),
  ).toBe(false)
  fireEvent.change(screen.getByLabelText('精华预兆'), {
    target: { value: 'dextral_crystallisation' },
  })
  expect(
    screen.getByRole('button', { name: '选择精华 Test Essence' }).hasAttribute('disabled'),
  ).toBe(true)
})

it('精华预兆草稿锁定、取消无费、分项计费与历史保存恢复', () => {
  render(
    <RehearsalPanel
      catalog={mixedCatalog}
      initialState={{ ...state, rarity: 'normal' }}
      translations={omenTranslations}
    />,
  )
  expect(
    within(screen.getByLabelText('本次搭配预兆')).getByRole('option', {
      name: 'Omen of Whittling',
    }),
  ).toBeDefined()
  expect(
    within(screen.getByLabelText('本次搭配预兆')).queryByRole('option', {
      name: '右旋结晶预兆',
    }),
  ).toBeNull()
  for (const [currency, mod] of [
    ['蜕变石', /Fire · Embers/],
    ['富豪石', /Armour · Armoured/],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: currency }))
    fireEvent.click(
      within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: mod }),
    )
    fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  }
  const choose = () => {
    fireEvent.change(screen.getByLabelText('精华预兆'), {
      target: { value: 'dextral_crystallisation' },
    })
    fireEvent.click(screen.getByRole('button', { name: '选择精华 Perfect Essence of Life' }))
    fireEvent.click(screen.getByRole('radio', { name: /Fire · Embers/ }))
    fireEvent.click(screen.getByRole('button', { name: '预览精华结果' }))
  }
  choose()
  expect(screen.getByLabelText('精华预兆').hasAttribute('disabled')).toBe(true)
  expect(
    screen.getByRole('heading', { name: 'Perfect Essence of Life + 右旋结晶预兆' }),
  ).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '取消精华结果' }))
  expect((screen.getByLabelText('精华预兆') as HTMLSelectElement).value).toBe('')
  expect(screen.queryByText('右旋结晶预兆 × 1')).toBeNull()
  choose()
  fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
  expect(screen.getByText('右旋结晶预兆 × 1')).toBeDefined()
  expect(screen.queryByText('Perfect Essence of Life + 右旋结晶预兆 × 1')).toBeNull()
  expect((screen.getByLabelText('精华预兆') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.queryByText('右旋结晶预兆 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  expect(
    JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}').operations.at(-1),
  ).toMatchObject({ omen: 'dextral_crystallisation' })
  choose()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.queryByRole('button', { name: '应用精华结果' })).toBeNull()
  expect((screen.getByLabelText('精华预兆') as HTMLSelectElement).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
  expect(screen.getByText('右旋结晶预兆 × 1')).toBeDefined()
})

it('精华独有目标直接预览具体数值，不误报无建议，取消不消费并保留历史恢复', () => {
  render(
    <RehearsalPanel
      catalog={{
        ...catalog,
        modifiers: catalog.modifiers.map((mod) =>
          mod.id === 'Life' ? { ...mod, eligibility: [] } : mod,
        ),
      }}
      initialState={{ ...state, rarity: 'normal' }}
      translations={translations}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /Fire · Embers/ }),
  )
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Life' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
  expect(screen.queryByText(/当前没有可直接推进目标/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 Life' }))
  fireEvent.change(screen.getByLabelText('Life · 数值 1 最小值'), { target: { value: '18' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Life' }))
  const choose = () => {
    const button = screen.getByRole('button', { name: /预览此精华方案/ })
    button.focus()
    fireEvent.click(button)
  }
  choose()
  const preview = screen.getByRole('region', { name: '精华待应用结果' })
  expect(preview.textContent).toContain('+18(10-20) to maximum Life')
  expect(document.activeElement).toBe(preview)
  expect(screen.getByText('工艺词缀 0/1')).toBeDefined()
  expect(screen.queryByText('低阶生命精华 × 1')).toBeNull()
  expect(screen.getByRole('button', { name: /预览此精华方案/ }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '取消精华结果' }))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: /预览此精华方案/ }))
  expect(screen.queryByText('低阶生命精华 × 1')).toBeNull()
  choose()
  fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
  expect(screen.getByText('低阶生命精华 × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  choose()
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  expect(screen.queryByRole('region', { name: '精华待应用结果' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('低阶生命精华 × 1')).toBeDefined()
})

it('目标精华方案展示整个池风险和指定损失，普通预兆不隐藏方案且进入预览后清空', () => {
  render(
    <RehearsalPanel
      catalog={mixedCatalog}
      initialState={mixedState}
      translations={omenTranslations}
    />,
  )
  for (const id of ['Life', 'Fire']) {
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
  }
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
    target: { value: 'dextral_exaltation' },
  })
  const advice = screen.getByRole('region', { name: '精华目标建议' })
  expect(within(advice).getByText(/显示全部 4 种精华方案/)).toBeDefined()
  fireEvent.click(within(advice).getByRole('button', { name: '显示全部 4 种精华方案' }))
  const cards = within(advice).getAllByRole('article')
  const safeSelection = cards.find(
    (card) =>
      card.textContent?.includes('指定移除整组：Armour') &&
      card.textContent?.includes('整个合法移除池中的目标风险：Fire'),
  )
  if (!safeSelection) throw new Error('缺少选择非目标但整个池包含已有目标的方案')
  expect(within(safeSelection).getByText('本次指定结果失去目标：无。')).toBeDefined()
  expect(cards.some((card) => card.textContent?.includes('本次指定结果失去目标：Fire'))).toBe(true)
  expect(within(advice).getByRole('heading', { name: /右旋结晶预兆/ })).toBeDefined()
  fireEvent.click(within(safeSelection).getByRole('button', { name: '预览此精华方案' }))
  expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).value).toBe('')
  expect(
    within(screen.getByRole('region', { name: '精华待应用结果' })).getByText(
      /指定移除整组：Armour/,
    ),
  ).toBeDefined()
  expect(screen.queryByText('Perfect Essence of Life × 1')).toBeNull()
})

it('普通基底显示三步精华准备路线，逐步确认、取消回焦点并沿用历史', () => {
  render(
    <RehearsalPanel
      catalog={{
        ...mixedCatalog,
        essences: mixedCatalog.essences?.filter((entry) => entry.id === perfectEssenceId) ?? [],
        modifiers: mixedCatalog.modifiers.map((mod) =>
          mod.id === 'Life' ? { ...mod, eligibility: [] } : mod,
        ),
      }}
      initialState={{ ...state, rarity: 'normal' }}
      translations={omenTranslations}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Life' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
  fireEvent.click(screen.getByRole('button', { name: '设置数值条件 Life' }))
  fireEvent.change(screen.getByLabelText('Life · 数值 1 最小值'), { target: { value: '18' } })
  fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Life' }))
  const route = screen.getByRole('region', { name: '精华准备路线' })
  expect(route.textContent).toContain('示例准备路线')
  expect(route.textContent).toContain('1. 蜕变石')
  expect(route.textContent).toContain('2. 富豪石')
  expect(route.textContent).toContain('3. Perfect Essence of Life')
  expect(route.textContent).toContain('预计材料')
  expect(route.textContent).toContain('+18(10-20) to maximum Life')
  expect(screen.queryByText(/当前没有可直接推进目标/)).toBeNull()
  fireEvent.change(screen.getByLabelText('本次搭配预兆'), {
    target: { value: 'dextral_exaltation' },
  })
  const trigger = within(route).getByRole('button', { name: '预览第一步' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(document.activeElement).toBe(screen.getByRole('region', { name: '本次指定结果' }))
  expect(screen.getByText('已选择 1/1')).toBeDefined()
  expect(trigger.hasAttribute('disabled')).toBe(true)
  expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).value).toBe('')
  expect(screen.queryByText('蜕变石 × 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
  expect(document.activeElement).toBe(trigger)
  expect(screen.queryByText('蜕变石 × 1')).toBeNull()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('蜕变石 × 1')).toBeDefined()
  expect(route.textContent).toContain('1. 富豪石')
  expect(route.textContent).not.toContain('蜕变石')
  fireEvent.click(within(route).getByRole('button', { name: '预览第一步' }))
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  expect(screen.getByText('富豪石 × 1')).toBeDefined()
  expect(screen.queryByRole('region', { name: '精华准备路线' })).toBeNull()
  const direct = screen.getAllByRole('button', { name: '预览此精华方案' })[0]
  if (!direct) throw new Error('缺少直接精华方案')
  fireEvent.click(direct)
  fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
  expect(screen.getByText('所有目标组均已达成，可停止当前路线。')).toBeDefined()
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(screen.getByText('Perfect Essence of Life × 1')).toBeDefined()
})

it('修改准备草稿的词缀结果后按实际装备重算下一步', () => {
  render(
    <RehearsalPanel
      catalog={{
        ...mixedCatalog,
        essences: mixedCatalog.essences?.filter((entry) => entry.id === perfectEssenceId) ?? [],
        modifiers: mixedCatalog.modifiers.map((mod) =>
          mod.id === 'Life' ? { ...mod, eligibility: [] } : mod,
        ),
      }}
      initialState={{ ...state, rarity: 'normal' }}
      translations={translations}
    />,
  )
  fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Life' } })
  fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
  fireEvent.click(screen.getByRole('button', { name: '预览第一步' }))
  const draft = screen.getByRole('region', { name: '本次指定结果' })
  expect((within(draft).getByLabelText('Armoured · 数值 1') as HTMLInputElement).value).toBe('10')
  fireEvent.click(within(draft).getByRole('button', { name: '撤销上一个选择' }))
  fireEvent.click(within(draft).getByRole('button', { name: /Fire · Embers/ }))
  fireEvent.change(within(draft).getByLabelText('Embers · 数值 1'), { target: { value: '19' } })
  fireEvent.click(within(draft).getByRole('button', { name: '应用本次结果' }))
  const route = screen.getByRole('region', { name: '精华准备路线' })
  expect(within(route).getByRole('heading', { name: '1. 富豪石' })).toBeDefined()
  fireEvent.click(within(route).getByRole('button', { name: '预览第一步' }))
  expect(screen.getByLabelText('Armoured · 数值 1')).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
  fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem(REHEARSAL_PROJECT_KEY) ?? '{}')
  expect(saved.operations[0]).toMatchObject({
    currency: 'transmutation',
    modIds: ['Fire'],
    rolls: [{ modId: 'Fire', values: [19] }],
  })
  expect(saved.operations[1]).toMatchObject({ currency: 'regal', modIds: ['Armour'] })
})
