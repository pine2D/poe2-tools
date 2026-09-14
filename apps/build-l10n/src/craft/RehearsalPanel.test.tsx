import {
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  type CraftCurrency,
  type CraftState,
  DESECRATION_SOURCE,
  type RestoredCraftProject,
} from '@poe2-tools/item-core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../packages/build-core/src/testing/miniDict'
import { fakeDictFetch } from '../testing/fakeDictFetch'
import { CraftComparisonPanel } from './CraftComparisonPanel'
import { RehearsalPanel } from './RehearsalPanel'

vi.mock('./targetRoutesWorkerClient', async () => {
  const { planCraftTargetRoutes } = await import('@poe2-tools/item-core')
  return {
    requestTargetRoutes: (
      args: Parameters<typeof planCraftTargetRoutes>,
      callback: (result: ReturnType<typeof planCraftTargetRoutes>) => void,
    ) => {
      callback(planCraftTargetRoutes(...args))
      return () => {}
    },
  }
})

const base = {
  id: 'Iron Helmet',
  name: 'Iron Helmet',
  type: 'Helmet',
  tags: ['default', 'helmet'],
  requirements: { Level: 1 },
  properties: { Armour: 18 },
  implicit: null,
  implicitTags: [],
  sourceQuality: 20,
  socketLimit: 2,
  hidden: false,
  runeforged: false,
}

const modifiers = [
  ['ArmourA', 'prefix', 'ArmourAGroup', 'Sturdy', '+(10-20) to Armour'],
  ['ArmourB', 'prefix', 'ArmourBGroup', 'Strong', '+(21-30) to Armour'],
  ['Life', 'prefix', 'LifeGroup', 'Healthy', '+(10-15) to maximum Life'],
  ['Fire', 'suffix', 'FireGroup', 'of Embers', '+(10-15)% to Fire Resistance'],
  ['Cold', 'suffix', 'ColdGroup', 'of Frost', '+(10-15)% to Cold Resistance'],
  ['Dexterity', 'suffix', 'DexterityGroup', 'of Skill', '+(5-10) to Dexterity'],
].map(([id, kind, group, name, line]) => ({
  id: id as string,
  kind: kind as 'prefix' | 'suffix',
  name: name as string,
  group: group as string,
  level: 1,
  lines: [line as string],
  statOrder: [1],
  tags: [],
  addsTags: [],
  eligibility: [{ tag: 'default', value: 1 as const }],
  tradeHashes: {},
}))

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
  modifiers,
}

function state(
  rarity: CraftState['rarity'] = 'normal',
  affixes: CraftState['affixes'] = [],
): CraftState {
  return { baseId: base.id, itemLevel: 80, rarity, affixes, sourceText: null }
}

function renderPanel(initialState = state(), initialProject?: RestoredCraftProject) {
  render(
    <RehearsalPanel
      catalog={catalog}
      initialState={initialState}
      translations={{ 'Iron Helmet': '铁制头盔' }}
      translateLine={(line) => (line.includes('Armour') ? line.replace('Armour', '护甲') : null)}
      {...(initialProject === undefined ? {} : { initialProject })}
    />,
  )
}

function prepare(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

function choose(modId: string) {
  fireEvent.click(
    within(screen.getByLabelText('本次指定结果')).getByRole('button', {
      name: new RegExp(modId),
    }),
  )
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
}

afterEach(cleanup)

describe('RehearsalPanel', () => {
  it('导出语言切换不改变已应用历史、费用或撤销游标', async () => {
    const inner = fakeDictFetch(miniBundle)
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) => inner(String(url)) as Promise<Response>)
    try {
      renderPanel()
      prepare('蜕变石')
      choose('ArmourA')
      apply()
      const history = screen.getByLabelText('演练历史').textContent
      fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
      await act(async () => {})
      expect(
        (screen.getByRole('textbox', { name: '演练装备简体中文文本' }) as HTMLTextAreaElement)
          .value,
      ).toContain('稀有度: 魔法')
      await act(async () => {
        fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'zh-TW' } })
      })
      fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'en' } })
      expect(screen.getByLabelText('演练历史').textContent).toBe(history)
      expect((screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value).toContain(
        '+10(10-20) to Armour',
      )
      fireEvent.click(screen.getByRole('button', { name: '撤销' }))
      expect((screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value).toContain(
        'Rarity: Normal',
      )
      expect(screen.getByText('尚未消耗通货')).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: '重做' }))
      expect(screen.getByLabelText('演练历史').textContent).toBe(history)
    } finally {
      fetchMock.mockRestore()
    }
  })
  it('导出只跟随已应用装备，草稿不计入文本或费用，撤销重做同步', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('装备文本语言'), { target: { value: 'en' } })
    fireEvent.click(screen.getByRole('button', { name: '导出装备文本' }))
    const text = () => (screen.getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value
    expect(text()).toContain('Rarity: Normal')
    prepare('蜕变石')
    choose('ArmourA')
    expect(text()).toContain('Rarity: Normal')
    expect(text()).not.toContain('+10(10-20) to Armour')
    expect(screen.getByText(/只导出当前已应用装备/)).toBeDefined()
    expect(screen.getByText('尚未消耗通货')).toBeDefined()
    apply()
    expect(text()).toContain('Rarity: Magic')
    expect(text()).toContain('+10(10-20) to Armour')
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(text()).toContain('Rarity: Normal')
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(text()).toContain('+10(10-20) to Armour')
  })

  it('同组候选包含高物等完整档位，排除不适用基底与不同类别', () => {
    const primary = modifiers[0]
    if (!primary) throw new Error('缺少测试词缀')
    render(
      <RehearsalPanel
        catalog={{
          ...catalog,
          modifiers: [
            ...modifiers,
            {
              ...primary,
              id: 'HighArmour',
              name: 'High',
              level: 90,
              lines: ['+(30-40) to Armour', '+(1-2) to Strength'],
            },
            { ...primary, id: 'WrongBase', eligibility: [{ tag: 'bow', value: 1 }] },
            { ...primary, id: 'WrongKind', kind: 'suffix' },
          ],
        }}
        initialState={state()}
        translations={{}}
      />,
    )
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'ArmourA' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourA' }))
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: '' } })
    fireEvent.click(screen.getByText('可接受的同组档位 · Sturdy'))
    expect(screen.getByRole('checkbox', { name: '接受档位 HighArmour' })).toBeDefined()
    expect(screen.getByText(/目录词缀等级 90/)).toBeDefined()
    expect(screen.getByText('+(1-2) to Strength')).toBeDefined()
    expect(screen.queryByRole('checkbox', { name: '接受档位 WrongBase' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: '接受档位 WrongKind' })).toBeNull()
  })
  it('同组档位显式接受、独立数值、撤销恢复与移除清理', () => {
    localStorage.clear()
    const primary = modifiers[0]
    if (!primary) throw new Error('缺少测试词缀')
    const alternate = {
      ...primary,
      id: 'ArmourTier',
      name: 'Alternate',
      level: 90,
      lines: ['+(30-40) to Armour'],
    }
    render(
      <RehearsalPanel
        catalog={{ ...catalog, modifiers: [...modifiers, alternate] }}
        initialState={{
          ...state(),
          itemLevel: 100,
        }}
        translations={{}}
      />,
    )
    prepare('蜕变石')
    choose('ArmourA')
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '15' } })
    apply()
    const search = screen.getByLabelText('搜索目标词缀')
    fireEvent.change(search, { target: { value: 'ArmourTier' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourTier' }))
    expect(screen.getByText('已达成 0 / 1')).toBeDefined()
    fireEvent.change(search, { target: { value: 'ArmourA' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourA' }))
    expect(screen.getByText(/请在已有目标中勾选可接受的同组档位/)).toBeDefined()
    fireEvent.click(screen.getByText('可接受的同组档位 · Alternate'))
    fireEvent.click(screen.getByRole('checkbox', { name: '接受档位 ArmourA' }))
    expect(screen.getByText('已达成 1 / 1')).toBeDefined()
    expect(screen.getByText('所有目标组均已达成，可停止当前路线。')).toBeDefined()
    expect(screen.queryByText(/需要先移除才能选择该精确档位/)).toBeNull()
    for (const [id, min] of [
      ['ArmourTier', '38'],
      ['ArmourA', '18'],
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `设置数值条件 ${id}` }))
      fireEvent.change(screen.getByLabelText(`${id} · 数值 1 最小值`), { target: { value: min } })
      fireEvent.click(screen.getByRole('button', { name: `保存数值条件 ${id}` }))
    }
    expect(screen.getByText('已达成 0 / 1')).toBeDefined()
    expect(screen.getByText(/涉及数值目标：Sturdy/)).toBeDefined()
    expect(screen.getByText(/需要先移除才能选择该精确档位/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '演练建议：神圣石' }))
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '19' } })
    apply()
    expect(screen.getByText('已达成 1 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByText('已达成 0 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(screen.getByText('演练项目已保存到本机；未应用的草稿不会保存。')).toBeDefined()
    const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    expect(saved.targetAlternatives).toEqual([{ targetModId: 'ArmourTier', modIds: ['ArmourA'] }])
    expect(saved.targetValues).toHaveLength(2)
    fireEvent.click(screen.getByRole('checkbox', { name: '接受档位 ArmourA' }))
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(
      JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}').targetValues,
    ).toEqual([{ modId: 'ArmourTier', bounds: [{ index: 0, min: 38 }] }])
    localStorage.setItem('poe2-tools:craft-rehearsal:v1', JSON.stringify(saved))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(
      (screen.getByRole('checkbox', { name: '接受档位 ArmourA' }) as HTMLInputElement).checked,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('已达成 1 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '移除目标 ArmourTier' }))
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const cleared = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    expect(cleared.targetModIds).toBeUndefined()
    expect(cleared.targetValues).toBeUndefined()
    expect(cleared.targetAlternatives).toBeUndefined()
    localStorage.clear()
  })
  it('符文草稿对比、覆盖、混合通货历史和项目恢复使用同一起点', () => {
    const rune = (name: string, line: string) => ({
      id: `pob2:augment:${JSON.stringify([name, 'armour'])}`,
      name,
      category: 'armour',
      type: 'Rune' as const,
      localMod: false,
      lines: [line],
      statOrder: [1],
      tradeHashes: {},
      levelReq: 0,
    })
    const fire = rune('Lesser Desert Rune', '+10% to Fire Resistance')
    const cold = rune('Lesser Glacial Rune', '+10% to Cold Resistance')
    const source: CraftCatalog = {
      ...catalog,
      augments: [fire, cold],
      _meta: {
        ...catalog._meta,
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
      <RehearsalPanel
        catalog={source}
        initialState={{ ...state(), sockets: [] }}
        translations={{}}
      />,
    )
    const selectRune = (id: string) =>
      fireEvent.change(screen.getByLabelText('选择镶嵌符文'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: '巧匠石：添加一个孔' }))
    expect(screen.getByText('孔数 0 → 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '取消打孔' }))
    expect(screen.queryByText('巧匠石 × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '巧匠石：添加一个孔' }))
    fireEvent.click(screen.getByRole('button', { name: '应用打孔' }))
    expect(screen.getByText('巧匠石 × 1')).toBeDefined()
    expect(
      (screen.getByRole('button', { name: '巧匠石：添加一个孔' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    selectRune(fire.id)
    expect((screen.getByRole('button', { name: '蜕变石' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    fireEvent.click(screen.getByRole('button', { name: '展开前后变化' }))
    expect(
      within(screen.getByLabelText('操作前后变化')).getByText('+10% to Fire Resistance'),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '应用镶嵌' }))
    expect(screen.getByText('Lesser Desert Rune × 1')).toBeDefined()
    selectRune(cold.id)
    expect(screen.getByText(/旧符文会被覆盖/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '应用镶嵌' }))
    const current = screen.getByLabelText('当前镶嵌效果')
    expect(within(current).queryByText('+10% to Fire Resistance')).toBeNull()
    expect(within(current).getByText('+10% to Cold Resistance')).toBeDefined()
    prepare('蜕变石')
    choose('ArmourA')
    apply()
    expect(
      within(screen.getByLabelText('当前镶嵌效果')).getByText('+10% to Cold Resistance'),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(screen.getByText(/演练项目已保存到本机/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(
      within(screen.getByLabelText('当前镶嵌效果')).getByText('+10% to Fire Resistance'),
    ).toBeDefined()
    expect(screen.queryByText('Lesser Glacial Rune × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(
      within(screen.getByLabelText('当前镶嵌效果')).getByText('+10% to Cold Resistance'),
    ).toBeDefined()
    expect(screen.getByText('蜕变石 × 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '回到起点' }))
    const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    saved.initialState.sockets = [null, null]
    saved.operations = []
    saved.cursor = 0
    localStorage.setItem('poe2-tools:craft-rehearsal:v1', JSON.stringify(saved))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    fireEvent.change(screen.getByLabelText('目标孔位'), { target: { value: '1' } })
    saved.initialState.sockets = [null]
    localStorage.setItem('poe2-tools:craft-rehearsal:v1', JSON.stringify(saved))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    selectRune(fire.id)
    expect((screen.getByRole('button', { name: '应用镶嵌' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
  })
  it('高级通货候选与具体消耗版本随历史和项目保留', () => {
    localStorage.clear()
    const armour = catalog.modifiers[0]
    if (!armour) throw new Error('缺少测试词缀')
    const tierCatalog: CraftCatalog = {
      ...catalog,
      modifiers: [
        ...catalog.modifiers.map((mod) => (mod.id === 'ArmourA' ? { ...mod, level: 44 } : mod)),
        { ...armour, id: 'ArmourLow', level: 1, lines: ['+(1-9) to Armour'] },
      ],
    }
    render(<RehearsalPanel catalog={tierCatalog} initialState={state()} translations={{}} />)
    fireEvent.change(screen.getByLabelText('通货层级'), { target: { value: 'greater' } })
    prepare('高级蜕变石')
    expect(
      within(screen.getByLabelText('本次指定结果')).queryByRole('button', { name: /ArmourLow/ }),
    ).toBeNull()
    choose('ArmourA')
    apply()
    expect(screen.getByText('高级蜕变石 × 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const p = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    expect(p.operations[0].currency).toBe('greater_transmutation')
    expect(p.rulesVersion).toBe(CRAFT_RULES_VERSION)
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByText('高级蜕变石 × 1')).toBeDefined()
    localStorage.clear()
  })
  it('完美通货先检查装备物等，不能由低等级族例外绕过', () => {
    renderPanel({ ...state(), itemLevel: 69 })
    fireEvent.change(screen.getByLabelText('通货层级'), { target: { value: 'perfect' } })
    prepare('完美蜕变石')
    expect(screen.queryByLabelText('本次指定结果')).toBeNull()
    expect(screen.getByText(/物品等级.*70/)).toBeDefined()
  })
  it('高级建议同步层级，高级混沌移除后保留具体版本', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'ArmourA' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourA' }))
    fireEvent.click(screen.getByRole('button', { name: /显示其余 .* 种建议/ }))
    fireEvent.click(screen.getByRole('button', { name: '演练建议：高级蜕变石' }))
    expect((screen.getByLabelText('通货层级') as HTMLSelectElement).value).toBe('greater')
    choose('ArmourA')
    apply()
    prepare('高级富豪石')
    choose('Fire')
    apply()
    prepare('高级混沌石')
    fireEvent.click(screen.getByRole('button', { name: /选择移除此组：Sturdy/ }))
    choose('ArmourB')
    apply()
    expect(screen.getByText('高级混沌石 × 1')).toBeDefined()
    expect(screen.getByRole('button', { name: '步骤 3：高级混沌石' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByText('高级混沌石 × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('高级混沌石 × 1')).toBeDefined()
  })
  it('完整草稿及已应用历史可展开对比，无效草稿不显示过期对比', () => {
    renderPanel()
    prepare('蜕变石')
    choose('ArmourA')
    fireEvent.click(screen.getByRole('button', { name: '展开前后变化' }))
    const comparison = () => screen.getByRole('region', { name: '操作前后变化' })
    expect(within(comparison()).getByText('新增')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '' } })
    expect(screen.queryByRole('region', { name: '操作前后变化' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '18' } })
    apply()
    expect(within(comparison()).getByText('+18(10-20) to Armour')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByRole('region', { name: '操作前后变化' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(within(comparison()).getByText('新增')).toBeDefined()
  })
  it('数值不足的已有目标提示神圣，条件随撤销与保存恢复且可清除', () => {
    localStorage.clear()
    renderPanel()
    prepare('蜕变石')
    choose('ArmourA')
    apply()
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'ArmourA' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourA' }))
    fireEvent.click(screen.getByRole('button', { name: '设置数值条件 ArmourA' }))
    fireEvent.change(screen.getByLabelText('ArmourA · 数值 1 最小值'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 ArmourA' }))
    const targets = screen.getByRole('region', { name: '制作目标与下一步' })
    expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '演练建议：神圣石' }))
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '19' } })
    apply()
    expect(within(targets).getByText('已达成 1 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    fireEvent.click(screen.getByRole('button', { name: '清除数值条件 ArmourA' }))
    expect(within(targets).getByText('已达成 1 / 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByRole('button', { name: '清除数值条件 ArmourA' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(within(targets).getByText('已达成 1 / 1')).toBeDefined()
    localStorage.clear()
  })
  it('非法数值目标不写入项目，清空上下限恢复仅档位目标', () => {
    localStorage.clear()
    renderPanel()
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Fire' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 Fire' }))
    fireEvent.click(screen.getByRole('button', { name: '设置数值条件 Fire' }))
    fireEvent.change(screen.getByLabelText('Fire · 数值 1 最小值'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Fire' }))
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    expect(
      JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}').targetValues,
    ).toBeUndefined()
    fireEvent.change(screen.getByLabelText('Fire · 数值 1 最小值'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Fire · 数值 1 最大值'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Fire' }))
    fireEvent.click(screen.getByRole('button', { name: '设置数值条件 Fire' }))
    const maximum = screen.getByLabelText('Fire · 数值 1 最大值') as HTMLInputElement
    fireEvent.change(maximum, { target: { value: '' } })
    // 浏览器将未完成数字暴露为空 value，须与用户真正清空区分。
    Object.defineProperty(maximum, 'validity', { configurable: true, value: { badInput: true } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Fire' }))
    expect(screen.getByRole('button', { name: '清除数值条件 Fire' })).toBeDefined()
    Object.defineProperty(maximum, 'validity', { configurable: true, value: { badInput: false } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 Fire' }))
    expect(screen.queryByRole('button', { name: '清除数值条件 Fire' })).toBeNull()
    localStorage.clear()
  })
  it('新词缀可指定具体数值，神圣重掷后撤销和项目恢复仍保留原值', () => {
    localStorage.clear()
    renderPanel()
    prepare('蜕变石')
    choose('ArmourA')
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '18' } })
    apply()
    expect(screen.getByText('+18(10-20) to Armour')).toBeDefined()
    prepare('神圣石')
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '' } })
    expect(
      (screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('Sturdy · 数值 1'), { target: { value: '20' } })
    apply()
    expect(screen.getByText('+20(10-20) to Armour')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByText('+18(10-20) to Armour')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    fireEvent.click(screen.getByRole('button', { name: '回到起点' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByText('+18(10-20) to Armour')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('+20(10-20) to Armour')).toBeDefined()
    expect(screen.getByText('神圣石 × 1')).toBeDefined()
    localStorage.clear()
  })

  it('普通基底的固有范围可单独神圣，不增加显式词缀', () => {
    render(
      <RehearsalPanel
        catalog={{ ...catalog, bases: [{ ...base, implicit: '+(5-10)% to Fire Resistance' }] }}
        initialState={state()}
        translations={{}}
      />,
    )
    prepare('神圣石')
    fireEvent.change(screen.getByLabelText('固有属性 · 数值 1'), { target: { value: '9' } })
    apply()
    expect(screen.getByText('+9(5-10)% to Fire Resistance')).toBeDefined()
    expect(screen.getByText('普通')).toBeDefined()
    expect(screen.getByText('前缀 0/0')).toBeDefined()
  })
  it('中文搜索选择精确目标，建议仅打开草稿，应用和撤销更新达成状态', () => {
    renderPanel()
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: '护甲' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 ArmourA' }))
    const targets = screen.getByRole('region', { name: '制作目标与下一步' })
    expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
    fireEvent.click(within(targets).getByRole('button', { name: '演练建议：蜕变石' }))
    expect(document.activeElement).toBe(screen.getByLabelText('本次指定结果'))
    expect(screen.getByText('已选择 0/1')).toBeDefined()
    choose('ArmourA')
    expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
    apply()
    expect(within(targets).getByText('已达成 1 / 1')).toBeDefined()
    expect(within(targets).queryByRole('button', { name: /演练建议/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(within(targets).getByText('已达成 0 / 1')).toBeDefined()
  })

  it('项目保存及恢复包含目标，恢复失败保留已有目标', () => {
    localStorage.clear()
    renderPanel()
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: 'Fire' } })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 Fire' }))
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    fireEvent.click(screen.getByRole('button', { name: '移除目标 Fire' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByRole('button', { name: '移除目标 Fire' })).toBeDefined()
    localStorage.setItem('poe2-tools:craft-rehearsal:v1', '{broken')
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByRole('button', { name: '移除目标 Fire' })).toBeDefined()
    localStorage.clear()
  })

  it('移除建议明确已有目标损失，打开整组剥离草稿后仍需确认', () => {
    renderPanel(state('magic', [{ modId: 'ArmourA', lines: ['+17 to Armour'] }]))
    for (const id of ['ArmourA', 'Life']) {
      fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
      fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
    }
    const targets = screen.getByRole('region', { name: '制作目标与下一步' })
    expect(within(targets).getByText('已达成 1 / 2')).toBeDefined()
    expect(within(targets).getAllByText(/已有目标没有被保护/).length).toBeGreaterThan(0)
    expect(within(targets).getAllByText(/该指定结果会失去已有目标/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: '演练建议：剥离石，移除 ArmourA' }))
    expect(
      (screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(within(targets).getByText('已达成 1 / 2')).toBeDefined()
    for (const button of within(targets).getAllByRole('button', { name: /演练建议/ })) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    apply()
    expect(within(targets).getByText('已达成 0 / 2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(within(targets).getByText('已达成 1 / 2')).toBeDefined()
  })

  it('沿蜕变、增幅、富豪、崇高路线指定结果并累计通货与槽位', () => {
    renderPanel()
    prepare('蜕变石')
    choose('ArmourA')
    apply()
    expect(screen.getByText('魔法')).toBeDefined()
    expect(screen.getByText('前缀 1/1')).toBeDefined()

    prepare('增幅石')
    choose('Fire')
    apply()
    prepare('富豪石')
    choose('ArmourB')
    apply()
    expect(screen.getByText('稀有')).toBeDefined()
    prepare('崇高石')
    choose('Cold')
    apply()

    expect(screen.getByText('前缀 2/3')).toBeDefined()
    expect(screen.getByText('后缀 2/3')).toBeDefined()
    for (const currency of ['蜕变石', '增幅石', '富豪石', '崇高石']) {
      expect(screen.getByText(`${currency} × 1`)).toBeDefined()
    }
  })

  it('点金必须依次选择四条，应用后原子替换魔法词缀并记录实值及范围', () => {
    renderPanel(state('magic', [{ modId: 'ArmourA', lines: ['+17 to Armour'] }]))
    prepare('点金石')
    const draft = screen.getByLabelText('本次指定结果')
    expect(within(draft).getByText(/清除当前旧词缀并换成四条新词缀/)).toBeDefined()
    expect(
      (within(draft).getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    for (const id of ['ArmourB', 'Life', 'Fire', 'Cold']) choose(id)
    expect(within(draft).getByText('已选择 4/4')).toBeDefined()
    const selected = within(draft).getByLabelText('已选词缀')
    expect(within(selected).getByText('Strong')).toBeDefined()
    expect(within(selected).getByText('+21(21-30) to Armour')).toBeDefined()
    fireEvent.click(within(draft).getByRole('button', { name: '撤销上一个选择' }))
    expect(within(draft).getByText('已选择 3/4')).toBeDefined()
    choose('Cold')
    apply()

    expect(screen.queryByText('+17 to Armour')).toBeNull()
    expect(screen.getAllByText('+21(21-30) to Armour').length).toBeGreaterThan(0)
    expect(screen.getByText('点金石 × 1')).toBeDefined()
    expect(screen.getByText(/可指定词缀与具体数值/)).toBeDefined()
  })

  it('取消不计数，撤销重做可回退，撤销后的新操作丢弃未来分支', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: /通货演练 · 指定结果演练/ })).toBeDefined()
    expect(
      screen.getByText(/支持普通攻击武器本地面板与三项防御估算；普通品质保留，催化品质按步骤更新/),
    ).toBeDefined()
    prepare('蜕变石')
    choose('ArmourA')
    fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
    expect(screen.queryByText('蜕变石 × 1')).toBeNull()

    prepare('蜕变石')
    choose('ArmourA')
    apply()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByText('普通')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('魔法')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    prepare('蜕变石')
    choose('Life')
    apply()
    expect((screen.getByRole('button', { name: '重做' }) as HTMLButtonElement).disabled).toBe(true)
    const history = screen.getByLabelText('演练历史')
    expect(within(history).getByRole('button', { name: '步骤 1：蜕变石' })).toBeDefined()
    fireEvent.click(within(history).getByRole('button', { name: '步骤 0：起点' }))
    expect(screen.getByText('普通')).toBeDefined()
    fireEvent.click(within(history).getByRole('button', { name: '步骤 1：蜕变石' }))
    expect(screen.getByText('魔法')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '回到起点' }))
    expect(screen.getByText('普通')).toBeDefined()
    expect(screen.getByText('尚未消耗通货')).toBeDefined()
  })

  it('混沌石先指定完整移除词缀，再核对移除与新增结果', () => {
    renderPanel(
      state('rare', [
        { modId: 'ArmourA', lines: ['+17 to Armour'] },
        { modId: 'Fire', lines: ['+12% to Fire Resistance'] },
        { modId: 'Cold', lines: ['+11% to Cold Resistance'] },
      ]),
    )
    prepare('混沌石')
    const removal = screen.getByLabelText('选择要移除的词缀')
    expect(within(removal).getByText(/指定移除结果/)).toBeDefined()
    fireEvent.click(
      within(removal).getByRole('button', {
        name: /选择移除此组：Sturdy，组 ArmourAGroup；\+17 to 护甲；\+17 to Armour/,
      }),
    )
    const draft = screen.getByLabelText('本次指定结果')
    expect(within(draft).getByLabelText('将移除的词缀').textContent).toContain('+17 to Armour')
    choose('ArmourB')
    apply()

    expect(screen.queryByText('+17 to Armour')).toBeNull()
    expect(screen.getByText('+21(21-30) to Armour')).toBeDefined()
    expect(screen.getByText('混沌石 × 1')).toBeDefined()
  })

  it('剥离石选择词缀后无需新增即可确认，撤销重做保留完整操作', () => {
    renderPanel(
      state('magic', [
        { modId: 'ArmourA', lines: ['+17 to Armour'] },
        { modId: 'Fire', lines: ['+12% to Fire Resistance'] },
      ]),
    )
    prepare('剥离石')
    fireEvent.click(
      within(screen.getByLabelText('选择要移除的词缀')).getByRole('button', {
        name: /选择移除此组：of Embers，组 FireGroup；\+12% to Fire Resistance/,
      }),
    )
    expect(
      (screen.getByRole('button', { name: '应用本次结果' }) as HTMLButtonElement).disabled,
    ).toBe(false)
    apply()
    expect(screen.queryByText('+12% to Fire Resistance')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(
      screen.getByText('+12% to Fire Resistance', { selector: '.rehearsal-affix code' }),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.queryByText('+12% to Fire Resistance')).toBeNull()
    expect(screen.getByText('剥离石 × 1')).toBeDefined()
  })

  it('优先恢复项目游标并保留游标之后的重做分支', () => {
    const start = state()
    const crafted = state('magic', [{ modId: 'ArmourA', lines: ['+(10-20) to Armour'] }])
    renderPanel(state(), {
      project: {
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: CRAFT_RULES_VERSION,
        initialState: start,
        operations: [{ currency: 'transmutation', modIds: ['ArmourA'] }],
        cursor: 0,
      },
      states: [start, crafted],
    })
    expect(screen.getByText('普通')).toBeDefined()
    expect(screen.getByText(/当前演练项目：铁制头盔 · 物品等级 80/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('魔法')).toBeDefined()
    expect(screen.getByText('+(10-20) to Armour')).toBeDefined()
  })

  it.each<[CraftCurrency, string]>([
    ['transmutation', '蜕变石'],
    ['augmentation', '增幅石'],
    ['regal', '富豪石'],
    ['alchemy', '点金石'],
    ['exalted', '崇高石'],
    ['chaos', '混沌石'],
    ['annulment', '剥离石'],
  ])('提供 %s 对应的指定结果入口', (_currency, label) => {
    renderPanel()
    expect(screen.getByRole('button', { name: label })).toBeDefined()
  })
})

describe('定向预兆演练', () => {
  const selectOmen = (value: string) =>
    fireEvent.change(screen.getByLabelText('本次搭配预兆'), { target: { value } })
  const rare = () =>
    state('rare', [
      { modId: 'ArmourA', lines: ['+17 to Armour'] },
      { modId: 'Fire', lines: ['+12% to Fire Resistance'] },
    ])
  it('新增侧过滤、草稿锁定、取消无费用、撤销选择仍保留预兆', () => {
    renderPanel(rare())
    selectOmen('dextral_exaltation')
    prepare('崇高石')
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).disabled).toBe(true)
    const draft = screen.getByLabelText('本次指定结果')
    expect(within(draft).queryByRole('button', { name: /ArmourB/ })).toBeNull()
    choose('Cold')
    fireEvent.click(screen.getByRole('button', { name: '撤销上一个选择' }))
    expect(within(draft).queryByRole('button', { name: /ArmourB/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
    expect(screen.getByText('尚未消耗通货')).toBeDefined()
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).disabled).toBe(false)
  })
  it('混沌只限制移除侧，新增可跨侧，保存恢复与历史费用保留预兆', () => {
    localStorage.clear()
    renderPanel()
    prepare('蜕变石')
    choose('ArmourA')
    apply()
    prepare('富豪石')
    choose('Fire')
    apply()
    selectOmen('sinistral_erasure')
    prepare('混沌石')
    const removal = screen.getByLabelText('选择要移除的词缀')
    expect(within(removal).queryByRole('button', { name: /of Embers/ })).toBeNull()
    expect(within(removal).getByText(/在前缀中随机移除/)).toBeDefined()
    fireEvent.click(within(removal).getByRole('button', { name: /选择移除此组：Sturdy/ }))
    choose('Cold')
    apply()
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('混沌石 × 1')).toBeDefined()
    expect(screen.getByText('Omen of Sinistral Erasure × 1')).toBeDefined()
    expect(
      screen.getByRole('button', { name: '步骤 3：混沌石 + Omen of Sinistral Erasure' }),
    ).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    expect(saved.operations[2].omen).toBe('sinistral_erasure')
    selectOmen('dextral_annulment')
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByText('混沌石 × 1')).toBeNull()
    expect(screen.queryByText('Omen of Sinistral Erasure × 1')).toBeNull()
    selectOmen('dextral_exaltation')
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('Omen of Sinistral Erasure × 1')).toBeDefined()
    localStorage.clear()
  })
  it('错配通货明确拒绝，定向剥离只列后缀且取消不计费', () => {
    renderPanel(rare())
    selectOmen('dextral_annulment')
    prepare('崇高石')
    expect(screen.queryByLabelText('本次指定结果')).toBeNull()
    expect(screen.getByText('该预兆只能搭配对应的基础通货。')).toBeDefined()
    expect(screen.getByText('尚未消耗通货')).toBeDefined()
    prepare('剥离石')
    const removal = screen.getByLabelText('选择要移除的词缀')
    expect(within(removal).queryByRole('button', { name: /Sturdy/ })).toBeNull()
    expect((screen.getByLabelText('本次搭配预兆') as HTMLSelectElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
    expect(screen.getByText('尚未消耗通货')).toBeDefined()
  })
  it('目标建议按预兆侧过滤，建议草稿带预兆并消费', () => {
    renderPanel(rare())
    for (const id of ['Life', 'Cold']) {
      fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
      fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
    }
    selectOmen('dextral_exaltation')
    const targets = screen.getByLabelText('制作目标与下一步')
    expect(within(targets).getByText(/建议已按本次预兆配置筛选/)).toBeDefined()
    expect(within(targets).getAllByRole('button', { name: /演练建议/ })).toHaveLength(1)
    fireEvent.click(within(targets).getByRole('button', { name: '演练建议：崇高石' }))
    expect(
      within(screen.getByLabelText('本次指定结果')).queryByRole('button', { name: /Life/ }),
    ).toBeNull()
    choose('Cold')
    apply()
    expect(screen.getByText('Omen of Dextral Exaltation × 1')).toBeDefined()
  })
})

describe('完整目标路线草稿', () => {
  it('按需生成，预览不计费，取消和应用后撤销重做', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索目标词缀' }), {
      target: { value: 'Life' },
    })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    fireEvent.click(screen.getAllByRole('button', { name: '预览路线第一步' })[0] as HTMLElement)
    expect(screen.getByText('尚未消耗通货')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
    fireEvent.click(screen.getAllByRole('button', { name: '预览路线第一步' })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.getByText('尚未消耗通货')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.queryByText('尚未消耗通货')).toBeNull()
  })
  it('修改保护配置或目标立即使旧路线不可预览', () => {
    renderPanel()
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索目标词缀' }), {
      target: { value: 'Life' },
    })
    fireEvent.click(screen.getByRole('button', { name: '加入目标 Life' }))
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '保留当前已达成目标' }))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    fireEvent.click(screen.getByRole('button', { name: '移除目标 Life' }))
    expect(screen.queryByRole('button', { name: '预览路线第一步' })).toBeNull()
  })
})

describe('路线首步完整字段与持久化', () => {
  const target = (id: string) => {
    fireEvent.change(screen.getByLabelText('搜索目标词缀'), { target: { value: id } })
    fireEvent.click(screen.getByRole('button', { name: `加入目标 ${id}` }))
  }
  const route = () => {
    fireEvent.click(screen.getByRole('button', { name: '生成多步示例路线' }))
    const button = screen.getAllByRole('button', { name: '预览路线第一步' })[0] as HTMLElement
    button.focus()
    fireEvent.click(button)
    return button
  }
  it('神圣首步保留完整roll和implicit，保存恢复沿原历史', () => {
    localStorage.clear()
    const source = { ...catalog, bases: [{ ...base, implicit: 'Implicit (1-10)' }] }
    render(<RehearsalPanel catalog={source} initialState={state()} translations={{}} />)
    prepare('蜕变石')
    choose('ArmourA')
    apply()
    target('ArmourA')
    fireEvent.click(screen.getByRole('button', { name: '设置数值条件 ArmourA' }))
    fireEvent.change(screen.getByLabelText('ArmourA · 数值 1 最小值'), { target: { value: '18' } })
    fireEvent.click(screen.getByRole('button', { name: '保存数值条件 ArmourA' }))
    const trigger = route()
    expect((screen.getByLabelText('Sturdy · 数值 1') as HTMLInputElement).value).toBe('18')
    expect((screen.getByLabelText('固有属性 · 数值 1') as HTMLInputElement).value).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: '取消本次结果' }))
    expect(document.activeElement).toBe(trigger)
    route()
    apply()
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByText('神圣石 × 1')).toBeDefined()
    expect(screen.getByText('Implicit 1(1-10)')).toBeDefined()
    localStorage.clear()
  })
  it('完整点金四词缀第一步可直接应用', () => {
    renderPanel()
    for (const mod of modifiers) target(mod.id)
    route()
    const draft = screen.getByLabelText('本次指定结果')
    expect(within(draft).getByText('已选择 4/4')).toBeDefined()
    apply()
    expect(screen.getByText('点金石 × 1')).toBeDefined()
  })
  it('精华首步预览、取消、应用与重做复用精华草稿', () => {
    const source: CraftCatalog = {
      ...catalog,
      _meta: {
        ...catalog._meta,
        sources: [{ path: 'src/Data/Essence.lua', sha256: 'b'.repeat(64), url: '' }],
      },
      modifiers: modifiers.map((mod) =>
        mod.id === 'Life' ? { ...mod, eligibility: [{ tag: 'default', value: 0 }] } : mod,
      ),
      essences: [
        {
          id: 'Metadata/Items/Currency/CurrencyLesserEssenceLife',
          name: 'Lesser Essence of Life',
          type: 'Life',
          tierLevel: 1,
          mods: { Helmet: 'Life' },
        },
      ],
    }
    render(
      <RehearsalPanel
        catalog={source}
        initialState={state()}
        translations={{ 'Lesser Essence of Life': '低阶生命精华' }}
      />,
    )
    prepare('蜕变石')
    choose('Fire')
    apply()
    target('Life')
    const trigger = route()
    expect(screen.getByLabelText('精华待应用结果')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '取消精华结果' }))
    expect(document.activeElement).toBe(trigger)
    route()
    fireEvent.click(screen.getByRole('button', { name: '应用精华结果' }))
    expect(screen.getByText('低阶生命精华 × 1')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(screen.queryByText('低阶生命精华 × 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(screen.getByText('低阶生命精华 × 1')).toBeDefined()
  })
})

it('整组数值未变时仍展示亵渎来源变化', () => {
  const source: CraftCatalog = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: DESECRATION_SOURCE.commit,
      sources: [DESECRATION_SOURCE],
    },
  }
  const before = state('rare', [{ modId: 'ArmourA', lines: ['+15 to Armour'], desecrated: true }])
  const after = state('rare', [{ modId: 'ArmourA', lines: ['+15 to Armour'] }])
  render(<CraftComparisonPanel catalog={source} before={before} after={after} />)
  expect(screen.getByText('来源变化')).toBeDefined()
  expect(screen.getByText('亵渎来源：亵渎 → 普通')).toBeDefined()
})
