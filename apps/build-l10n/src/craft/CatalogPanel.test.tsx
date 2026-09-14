import {
  CRAFT_RULES_VERSION,
  type CraftCatalog,
  DESECRATION_SOURCE,
  type InspectedMod,
  type ItemMod,
  inspectItem,
  parseItem,
} from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogPanel } from './CatalogPanel'

const catalog: CraftCatalog = {
  _meta: {
    schemaVersion: 2,
    tier: 'primary',
    sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12',
    gameVersion: null,
    generatedAt: '2026-09-12T00:00:00.000Z',
    weightStatus: 'unknown',
    sources: [
      { path: 'src/Data/Bases.lua', url: 'https://example.test/Bases.lua', sha256: 'a'.repeat(64) },
    ],
    excludedBases: [{ id: 'Unsupported Relic', reason: '缺少类型' }],
  },
  bases: [
    {
      id: 'Runed Focus',
      name: 'Runed Focus',
      type: 'Focus',
      tags: ['default', 'focus'],
      requirements: { Level: 20, Int: 40 },
      properties: { EnergyShield: 30 },
      implicit: '+(10-15) to maximum Energy Shield',
      implicitTags: [['defences']],
      sourceQuality: 20,
      socketLimit: 3,
      hidden: false,
      runeforged: true,
    },
    {
      id: 'Hidden Focus',
      name: 'Hidden Focus',
      type: 'Focus',
      tags: ['default', 'focus'],
      requirements: {},
      properties: {},
      implicit: null,
      implicitTags: [],
      sourceQuality: null,
      socketLimit: null,
      hidden: true,
      runeforged: false,
    },
    {
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
    },
  ],
  modifiers: [
    {
      id: 'ShieldLow',
      kind: 'prefix',
      name: 'Protective',
      group: 'LocalShield',
      level: 10,
      lines: ['+(20-30) to maximum Energy Shield'],
      statOrder: [1],
      tags: ['defences'],
      addsTags: [],
      eligibility: [
        { tag: 'focus', value: 1 },
        { tag: 'default', value: 0 },
      ],
      tradeHashes: {},
    },
    {
      id: 'ShieldHigh',
      kind: 'prefix',
      name: 'Resolute',
      group: 'LocalShield',
      level: 60,
      lines: ['+(70-80) to maximum Energy Shield'],
      statOrder: [1],
      tags: ['defences'],
      addsTags: [],
      eligibility: [
        { tag: 'focus', value: 1 },
        { tag: 'default', value: 0 },
      ],
      tradeHashes: {},
    },
    {
      id: 'Resistance',
      kind: 'suffix',
      name: 'of Resistance',
      group: 'FireResistance',
      level: 15,
      lines: ['+(10-15)% to Fire Resistance'],
      statOrder: [1],
      tags: ['elemental'],
      addsTags: [],
      eligibility: [{ tag: 'default', value: 1 }],
      tradeHashes: {},
    },
  ],
}

const translations = {
  'Runed Focus': '符文法器',
  'Hidden Focus': '隐藏法器',
  'Iron Helmet': '铁制头盔',
  ShieldLow: '防护的',
}

function goodFetch() {
  return vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => catalog }) as Response)
}

function importedMod(
  kind: ItemMod['kind'],
  english: string | null,
  raw = english ?? '未翻译属性',
): InspectedMod {
  const source = { raw, text: raw, line: 1, rolls: [], unscalable: false }
  return {
    mod: {
      kind,
      name: null,
      tier: null,
      tags: [],
      header: { raw: `{ ${kind} Modifier }`, line: 0 },
      stats: [source],
    },
    stats: [{ source, resolution: { english, candidates: [] } }],
  }
}

afterEach(() => {
  cleanup()
  localStorage.removeItem('poe2-tools:craft-rehearsal:v1')
})

describe('CatalogPanel', () => {
  it('已校验目录回调复用一次加载，父级重渲染不重复抓取或通知', async () => {
    const fetchImpl = goodFetch()
    const onCatalogReady = vi.fn()
    const view = render(
      <CatalogPanel
        translations={translations}
        fetchImpl={fetchImpl}
        onCatalogReady={onCatalogReady}
      />,
    )
    await waitFor(() => expect(onCatalogReady).toHaveBeenCalledTimes(1))
    expect(onCatalogReady.mock.calls[0]?.[0]).toEqual(catalog)
    view.rerender(
      <CatalogPanel
        translations={{ ...translations }}
        fetchImpl={fetchImpl}
        onCatalogReady={onCatalogReady}
      />,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onCatalogReady).toHaveBeenCalledTimes(1)
  })
  it.each(['zh-CN', 'zh-TW'] as const)(
    '直接搜索使用 %s 的 primary 符文名称并保留基底译名',
    async (locale) => {
      const source: CraftCatalog = {
        ...catalog,
        localizedNames: {
          'zh-CN': { 'Lesser Desert Rune': '国服样本符文' },
          'zh-TW': { 'Lesser Desert Rune': '台服樣本符文' },
        },
        augments: [
          {
            id: 'pob2:augment:["Lesser Desert Rune","armour"]',
            name: 'Lesser Desert Rune',
            category: 'armour',
            type: 'Rune',
            localMod: false,
            lines: ['+10% to Fire Resistance'],
            statOrder: [1],
            tradeHashes: {},
            levelReq: 0,
          },
        ],
        _meta: {
          ...catalog._meta,
          sources: [
            ...catalog._meta.sources,
            {
              path: 'src/Data/ModRunes.lua',
              url: 'https://example.test/runes',
              sha256: 'b'.repeat(64),
            },
          ],
          nameSources: (
            [
              ['en', 'https://www.pathofexile.com/api/trade2/data/static'],
              ['zh-CN', 'https://poe.game.qq.com/api/trade2/data/static'],
              ['zh-TW', 'https://pathofexile.tw/api/trade2/data/static'],
            ] as const
          ).map(([locale, url]) => ({
            locale,
            url,
            sha256: 'c'.repeat(64),
            fetchedAt: '2026-09-12T00:00:00.000Z',
            gameVersion: null,
          })),
        },
      }
      const fetchImpl = vi.fn<typeof fetch>(
        async () => ({ ok: true, json: async () => source }) as Response,
      )
      render(
        <CatalogPanel
          locale={locale}
          translations={translations}
          initialBaseId="Iron Helmet"
          fetchImpl={fetchImpl}
        />,
      )
      fireEvent.click(await screen.findByRole('button', { name: '从空白基底开始' }))
      expect(screen.getByText(/当前演练项目：铁制头盔/)).toBeDefined()
      fireEvent.click(screen.getByRole('button', { name: '巧匠石：添加一个孔' }))
      fireEvent.click(screen.getByRole('button', { name: '应用打孔' }))
      expect(
        screen.getByRole('option', { name: locale === 'zh-CN' ? /国服样本符文/ : /台服樣本符文/ }),
      ).toBeDefined()
      expect(
        screen.queryByRole('option', {
          name: locale === 'zh-CN' ? /台服樣本符文/ : /国服样本符文/,
        }),
      ).toBeNull()
    },
  )
  it('无需先搜索基底即可恢复项目，定位原基底和物等', async () => {
    localStorage.setItem(
      'poe2-tools:craft-rehearsal:v1',
      JSON.stringify({
        schemaVersion: 1,
        sourceCommit: catalog._meta.sourceCommit,
        rulesVersion: CRAFT_RULES_VERSION,
        initialState: {
          baseId: 'Iron Helmet',
          itemLevel: 37,
          rarity: 'normal',
          affixes: [],
          sourceText: null,
        },
        operations: [{ currency: 'transmutation', modIds: ['Resistance'] }],
        cursor: 1,
      }),
    )
    const fetchImpl = goodFetch()
    const view = render(<CatalogPanel translations={translations} fetchImpl={fetchImpl} />)
    fireEvent.click(await screen.findByRole('button', { name: '恢复本机演练' }))
    expect(screen.getByLabelText('通货演练')).toBeDefined()
    expect((screen.getByLabelText('物品等级') as HTMLInputElement).value).toBe('37')
    expect(within(screen.getByLabelText('通货演练')).getByText('步骤 1：蜕变石')).toBeDefined()
    const changed = parseItem(
      'Item Class: Helmets\nRarity: Normal\nIron Helmet\n--------\nItem Level: 37',
    )
    if (!changed.ok) throw new Error(changed.error)
    view.rerender(
      <CatalogPanel
        translations={translations}
        fetchImpl={fetchImpl}
        imported={{ baseId: 'Iron Helmet', mods: [], item: changed.item }}
      />,
    )
    expect(screen.queryByLabelText('通货演练')).toBeNull()
    view.rerender(<CatalogPanel translations={translations} fetchImpl={fetchImpl} />)
    expect(screen.queryByLabelText('通货演练')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '恢复本机演练' }))
    fireEvent.click(screen.getByRole('button', { name: /符文法器 · Runed Focus/ }))
    expect(screen.queryByLabelText('通货演练')).toBeNull()
  })
  it('搜索基底进入空白演练，改变物等销毁旧会话', async () => {
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Iron Helmet"
        initialItemLevel={40}
        fetchImpl={goodFetch()}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '从空白基底开始' }))
    expect(screen.getByLabelText('通货演练')).toBeDefined()
    fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '41' } })
    expect(screen.queryByLabelText('通货演练')).toBeNull()
    fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '40' } })
    expect(screen.queryByLabelText('通货演练')).toBeNull()
  })

  it('完整中文导入保留已有值，输入失效后清除演练', async () => {
    const parsed = parseItem(
      '物品类别: 法器\n稀有度: 稀有\n测试 烁光\n符文法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "测试的" (等阶：6) }\n+25(20-30) 能量护盾上限',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const inspection = inspectItem(parsed.item, {
      items: { bases: translations, uniques: {} },
      stats: {
        entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
      },
    })
    const data = {
      ...catalog,
      bases: catalog.bases.map((base) => ({ ...base, implicit: null, runeforged: false })),
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => data }) as Response,
    )
    const common = { translations, initialBaseId: 'Runed Focus', initialItemLevel: 40, fetchImpl }
    const view = render(
      <CatalogPanel
        {...common}
        imported={{
          baseId: 'Runed Focus',
          mods: inspection.mods,
          item: parsed.item,
          comparisonOnly: false,
        }}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '从当前装备开始' }))
    expect(
      within(screen.getByLabelText('通货演练')).getByText('+25(20-30) to maximum Energy Shield', {
        selector: '.rehearsal-affix code',
      }),
    ).toBeDefined()
    view.rerender(<CatalogPanel {...common} />)
    expect(screen.queryByLabelText('通货演练')).toBeNull()
  })

  it('切换授予技能候选后销毁旧演练会话', async () => {
    const parsed = parseItem(
      '物品类别: 权杖\n稀有度: 普通\n测试权杖\n--------\n物品等级: 40\n--------\n获得技能: 等级 12 测试召唤物（最高等级 13）',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const dictionary = {
      items: { bases: { 'Test Sceptre': '测试权杖' }, uniques: {} },
      stats: {
        entries: [
          {
            id: 'skill.a',
            en: 'Grants Skill: Level # Test Minion',
            text: '获得技能: 等级 # 测试召唤物',
          },
          {
            id: 'skill.b',
            en: 'Grants Skill: Level # Other Minion',
            text: '获得技能: 等级 # 测试召唤物',
          },
        ],
      },
    }
    const inspected = inspectItem(parsed.item, dictionary)
    const selected = (english: string | null) => ({
      baseId: 'Test Sceptre',
      mods: inspected.mods,
      skills: inspected.skills.map((skill) => ({
        ...skill,
        resolution: { ...skill.resolution, english },
      })),
      item: parsed.item,
      comparisonOnly: false,
    })
    const sourceBase = catalog.bases[0]
    if (sourceBase === undefined) throw new Error('测试基底缺失')
    const data: CraftCatalog = {
      ...catalog,
      bases: [
        {
          ...sourceBase,
          id: 'Test Sceptre',
          name: 'Test Sceptre',
          type: 'Sceptre',
          implicit: 'Grants Skill: Level (1-20) Test Minion',
          runeforged: false,
        },
      ],
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => data }) as Response,
    )
    const common = {
      translations: { 'Test Sceptre': '测试权杖' },
      initialBaseId: 'Test Sceptre',
      initialItemLevel: 40,
      fetchImpl,
      dictionary,
    }
    const view = render(
      <CatalogPanel
        {...common}
        imported={selected('Grants Skill: Level 12 Test Minion (Max Level 13)')}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '从当前装备开始' }))
    expect(screen.getByLabelText('通货演练')).toBeDefined()
    view.rerender(
      <CatalogPanel
        {...common}
        imported={selected('Grants Skill: Level 12 Other Minion (Max Level 13)')}
      />,
    )
    expect(screen.queryByLabelText('通货演练')).toBeNull()
    view.rerender(<CatalogPanel {...common} imported={selected(null)} />)
    expect(screen.queryByLabelText('通货演练')).toBeNull()
  })

  it('传奇输入没有从当前装备进入制作的入口', async () => {
    const parsed = parseItem(
      '物品类别: 法器\n稀有度: 传奇\n测试传奇\n符文法器\n--------\n物品等级: 40',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        fetchImpl={goodFetch()}
        imported={{ baseId: 'Runed Focus', mods: [], item: parsed.item, comparisonOnly: true }}
      />,
    )
    await screen.findByRole('heading', { name: /符文法器/ })
    expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
    expect(screen.getByText('咒符和传奇装备仅供对比，不开放制作。')).toBeDefined()
  })

  it('按中文名称搜索且不向普通目录暴露隐藏基底', async () => {
    render(<CatalogPanel translations={translations} fetchImpl={goodFetch()} />)
    await screen.findByRole('button', { name: /Runed Focus/ })
    fireEvent.change(screen.getByLabelText('搜索基底'), { target: { value: '法器' } })
    expect(screen.getByRole('button', { name: /符文法器/ })).toBeDefined()
    expect(screen.queryByText('Hidden Focus')).toBeNull()
  })

  it('物品等级改变后区分可出现与等级不足的词缀组', async () => {
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={40}
        fetchImpl={goodFetch()}
      />,
    )
    const pool = await screen.findByLabelText('词缀池')
    expect(within(pool).getByText('可出现 · 2')).toBeDefined()
    expect(within(pool).getByText('等级不足 · 1')).toBeDefined()
    fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '70' } })
    expect(within(pool).getByText('可出现 · 3')).toBeDefined()
    expect(within(pool).queryByText(/等级不足 ·/)).toBeNull()

    fireEvent.change(screen.getByLabelText('物品等级'), { target: { value: '42.8' } })
    expect((screen.getByLabelText('物品等级') as HTMLInputElement).value).toBe('42')
    expect(within(pool).getByText('等级不足 · 1')).toBeDefined()
  })

  it('规范外来物等并用词缀行翻译做中文对照和检索', async () => {
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={101.5}
        translateLine={(line) => (line.startsWith('+(20-30)') ? '+(20-30) 最大能量护盾' : null)}
        fetchImpl={goodFetch()}
      />,
    )
    const pool = await screen.findByLabelText('词缀池')
    expect((screen.getByLabelText('物品等级') as HTMLInputElement).value).toBe('100')
    expect(within(pool).getAllByText('+(20-30) 最大能量护盾')).not.toHaveLength(0)
    expect(within(pool).getByText('+(20-30) to maximum Energy Shield')).toBeDefined()
    fireEvent.change(screen.getByLabelText('搜索词缀'), { target: { value: '最大能量护盾' } })
    expect(within(pool).getByText('可出现 · 1')).toBeDefined()
  })

  it('导入属性变化会定位基底与物等，用户改选后不被相同属性覆盖', async () => {
    const fetchImpl = goodFetch()
    const view = render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={46}
        fetchImpl={fetchImpl}
      />,
    )
    await screen.findByRole('heading', { name: /符文法器/ })
    expect((screen.getByLabelText('物品等级') as HTMLInputElement).value).toBe('46')
    fireEvent.click(screen.getByRole('button', { name: /铁制头盔/ }))
    expect(screen.getByRole('heading', { name: /铁制头盔/ })).toBeDefined()
    view.rerender(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={46}
        fetchImpl={fetchImpl}
      />,
    )
    expect(screen.getByRole('heading', { name: /铁制头盔/ })).toBeDefined()
    view.rerender(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={55}
        fetchImpl={fetchImpl}
      />,
    )
    expect(screen.getByRole('heading', { name: /符文法器/ })).toBeDefined()
    expect((screen.getByLabelText('物品等级') as HTMLInputElement).value).toBe('55')
  })

  it('目录加载失败后可重试并恢复目录', async () => {
    let fail = true
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      fail
        ? ({ ok: false, status: 503, json: async () => null } as Response)
        : ({ ok: true, json: async () => catalog } as Response),
    )
    render(<CatalogPanel translations={translations} fetchImpl={fetchImpl} />)
    expect(await screen.findByText('制作目录加载失败')).toBeDefined()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重试制作目录' }))
    expect(await screen.findByRole('button', { name: /Runed Focus/ })).toBeDefined()
    await waitFor(() => expect(screen.queryByText('制作目录加载失败')).toBeNull())
  })

  it('展示隔离基底并允许继续浏览超过首批上限的词缀', async () => {
    const seedMod = catalog.modifiers[0]
    if (!seedMod) throw new Error('测试目录缺少词缀')
    const manyCatalog = {
      ...catalog,
      modifiers: Array.from({ length: 82 }, (_, index) => ({
        ...seedMod,
        id: `Generated${index}`,
        group: `Group${index}`,
        lines: [`Generated line ${index}`],
      })),
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => manyCatalog }) as Response,
    )
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={100}
        fetchImpl={fetchImpl}
      />,
    )
    await screen.findByLabelText('词缀池')
    expect(screen.getByText('已隔离基底 · 1')).toBeDefined()
    fireEvent.click(screen.getByText('已隔离基底 · 1'))
    expect(screen.getByText(/Unsupported Relic/)).toBeDefined()
    expect(screen.getByRole('link', { name: '数据来源与许可' }).getAttribute('href')).toBe(
      '/craft-data/NOTICE.md',
    )
    expect(screen.getByText('匹配 82 条，当前展示 80 条。')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '显示更多词缀' }))
    expect(screen.getByText('匹配 82 条，当前展示 82 条。')).toBeDefined()
    expect(screen.queryByRole('button', { name: '显示更多词缀' })).toBeNull()
  })

  it('按整组展示导入词缀状态，并把唯一对应组标为已有同组', async () => {
    const seedMod = catalog.modifiers[0]
    if (!seedMod) throw new Error('测试目录缺少词缀')
    const ambiguousMods = [
      {
        ...seedMod,
        id: 'DexterityA',
        group: 'DexterityA',
        lines: ['+(1-5) to Dexterity'],
      },
      {
        ...seedMod,
        id: 'DexterityB',
        group: 'DexterityB',
        lines: ['+(1-5) to Dexterity'],
      },
    ]
    const imported = {
      baseId: 'Runed Focus',
      mods: [
        importedMod('prefix', '+25 to maximum Energy Shield'),
        importedMod('prefix', '+3 to Dexterity'),
        importedMod('suffix', '+99 to maximum Mana'),
        importedMod('suffix', null),
        importedMod('implicit', '+10 to Spirit'),
      ],
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          json: async () => ({ ...catalog, modifiers: [...catalog.modifiers, ...ambiguousMods] }),
        }) as Response,
    )
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={40}
        imported={imported}
        fetchImpl={fetchImpl}
      />,
    )
    const importedPanel = await screen.findByLabelText('当前装备词缀')
    expect(within(importedPanel).getByText('前缀 · 2 组')).toBeDefined()
    expect(within(importedPanel).getByText('后缀 · 2 组')).toBeDefined()
    expect(within(importedPanel).getByText('已对应')).toBeDefined()
    expect(within(importedPanel).getByText('多个候选')).toBeDefined()
    expect(within(importedPanel).getByText('未对应')).toBeDefined()
    expect(within(importedPanel).getByText('待翻译')).toBeDefined()
    expect(within(importedPanel).getByText('特殊属性保留')).toBeDefined()
    expect(within(importedPanel).getByText(/Protective · LocalShield · 需求等级 10/)).toBeDefined()

    const pool = screen.getByLabelText('词缀池')
    expect(within(pool).getByText('已有同组 · 2')).toBeDefined()
    expect(within(pool).getByText(/同时等级不足/)).toBeDefined()
    expect(within(pool).queryByText('可出现 · 2')).toBeNull()
  })

  it('用户切换到其他基底后清除导入匹配和占用组', async () => {
    render(
      <CatalogPanel
        translations={translations}
        initialBaseId="Runed Focus"
        initialItemLevel={40}
        imported={{
          baseId: 'Runed Focus',
          mods: [importedMod('prefix', '+25 to maximum Energy Shield')],
        }}
        fetchImpl={goodFetch()}
      />,
    )
    await screen.findByLabelText('当前装备词缀')
    fireEvent.click(screen.getByRole('button', { name: /铁制头盔/ }))
    expect(screen.queryByLabelText('当前装备词缀')).toBeNull()
    expect(within(screen.getByLabelText('词缀池')).queryByText(/已有同组/)).toBeNull()
  })

  it('同名不同固有属性逐项展示，只传英文名称时等待用户选择', async () => {
    const seed = catalog.bases[0]
    if (!seed) throw new Error('测试目录缺少基底')
    const variants: CraftCatalog = {
      ...catalog,
      bases: [
        {
          ...seed,
          id: `pob2:base:v1:${'a'.repeat(64)}`,
          name: 'Shared Focus',
          implicit: '+(10-15) to maximum Energy Shield',
          properties: { EnergyShield: 30 },
          variant: {
            visibility: 'visible',
            declarations: [{ sourcePath: 'A.lua', index: 1, hidden: false }],
          },
        },
        {
          ...seed,
          id: `pob2:base:v1:${'b'.repeat(64)}`,
          name: 'Shared Focus',
          implicit: '+(20-25) to maximum Energy Shield',
          properties: { EnergyShield: 45 },
          variant: {
            visibility: 'mixed',
            declarations: [
              { sourcePath: 'B.lua', index: 2, hidden: false },
              { sourcePath: 'C.lua', index: 3, hidden: true },
            ],
          },
        },
      ],
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => variants }) as Response,
    )
    render(
      <CatalogPanel
        translations={{ 'Shared Focus': '共享法器' }}
        initialBaseId="Shared Focus"
        fetchImpl={fetchImpl}
      />,
    )
    const chooser = await screen.findByLabelText('选择基底变体')
    expect(within(chooser).getByText('请选择具体变体')).toBeDefined()
    expect(within(chooser).getByRole('button', { name: /\+\(10-15\).*能量护盾 30/ })).toBeDefined()
    expect(
      within(chooser).getByRole('button', { name: /\+\(20-25\).*能量护盾 45.*来源含隐藏记录/ }),
    ).toBeDefined()
    expect(screen.queryByRole('heading', { name: /共享法器/ })).toBeNull()
  })

  it('固有属性范围可唯一定位，手动切换具体变体会更新词缀候选', async () => {
    const seed = catalog.bases[0]
    const lowMod = catalog.modifiers[0]
    if (!seed || !lowMod) throw new Error('测试目录缺少基底或词缀')
    const variants: CraftCatalog = {
      ...catalog,
      bases: [
        {
          ...seed,
          id: `pob2:base:v1:${'c'.repeat(64)}`,
          name: 'Shared Focus',
          tags: ['variant_a'],
          implicit: '+(10-15) to maximum Energy Shield',
          variant: {
            visibility: 'visible',
            declarations: [{ sourcePath: 'VariantA.lua', index: 1, hidden: false }],
          },
        },
        {
          ...seed,
          id: `pob2:base:v1:${'d'.repeat(64)}`,
          name: 'Shared Focus',
          tags: ['variant_b'],
          implicit: '+(20-25) to maximum Energy Shield',
          variant: {
            visibility: 'visible',
            declarations: [{ sourcePath: 'VariantB.lua', index: 2, hidden: false }],
          },
        },
      ],
      modifiers: [
        {
          ...lowMod,
          id: 'OnlyA',
          group: 'OnlyA',
          eligibility: [
            { tag: 'variant_a', value: 1 },
            { tag: 'default', value: 0 },
          ],
        },
        {
          ...lowMod,
          id: 'OnlyB',
          name: 'Variant B mod',
          group: 'OnlyB',
          eligibility: [
            { tag: 'variant_b', value: 1 },
            { tag: 'default', value: 0 },
          ],
        },
      ],
    }
    const fetchImpl = vi.fn<typeof fetch>(
      async () => ({ ok: true, json: async () => variants }) as Response,
    )
    render(
      <CatalogPanel
        translations={{ 'Shared Focus': '共享法器' }}
        initialBaseId="Shared Focus"
        imported={{
          baseId: 'Shared Focus',
          mods: [],
          implicitLines: ['+12 to maximum Energy Shield'],
        }}
        fetchImpl={fetchImpl}
      />,
    )
    await screen.findByRole('heading', { name: /共享法器/ })
    expect(screen.getByText('OnlyA')).toBeDefined()
    expect(screen.queryByText('Variant B mod')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /\+\(20-25\)/ }))
    expect(screen.getByText('Variant B mod')).toBeDefined()
    expect(screen.queryByText('OnlyA')).toBeNull()
  })
})

it.each(['search', 'import'] as const)(
  '预兆从 %s 起点使用既有官方中文名并保存费用',
  async (route) => {
    const names = {
      'Omen of Sinistral Exaltation': '左旋崇高预兆',
      'Omen of Dextral Exaltation': '右旋崇高预兆',
      'Omen of Sinistral Annulment': '左旋剥离预兆',
      'Omen of Dextral Annulment': '右旋剥离预兆',
      'Omen of Sinistral Erasure': '左旋消抹预兆',
      'Omen of Dextral Erasure': '右旋消抹预兆',
    }
    const data: CraftCatalog = {
      ...catalog,
      bases: catalog.bases.map((base) => ({ ...base, implicit: null, runeforged: false })),
      localizedNames: { 'zh-CN': names, 'zh-TW': {} },
      _meta: {
        ...catalog._meta,
        nameSources: (
          [
            ['en', 'https://www.pathofexile.com/api/trade2/data/static'],
            ['zh-CN', 'https://poe.game.qq.com/api/trade2/data/static'],
            ['zh-TW', 'https://pathofexile.tw/api/trade2/data/static'],
          ] as const
        ).map(([locale, url]) => ({
          locale,
          url,
          sha256: 'c'.repeat(64),
          fetchedAt: '2026-09-12T00:00:00.000Z',
          gameVersion: null,
        })),
      },
    }
    const parsed = parseItem(
      '物品类别: 法器\n稀有度: 稀有\n测试 烁光\n符文法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "测试的" (等阶：6) }\n+25(20-30) 能量护盾上限',
    )
    if (!parsed.ok) throw new Error(parsed.error)
    const dictionary = {
      items: { bases: translations, uniques: {} },
      stats: {
        entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
      },
    }
    const inspection = inspectItem(parsed.item, dictionary)
    render(
      <CatalogPanel
        translations={translations}
        dictionary={dictionary}
        initialBaseId="Runed Focus"
        initialItemLevel={40}
        fetchImpl={vi.fn<typeof fetch>(
          async () => ({ ok: true, json: async () => data }) as Response,
        )}
        {...(route === 'import'
          ? {
              imported: {
                baseId: 'Runed Focus',
                mods: inspection.mods,
                item: parsed.item,
                comparisonOnly: false,
              },
            }
          : {})}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: route === 'import' ? '从当前装备开始' : '从空白基底开始',
      }),
    )
    if (route === 'search') {
      fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
      fireEvent.click(
        within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /ShieldLow/ }),
      )
      fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
    }
    const select = screen.getByLabelText('本次搭配预兆')
    for (const name of Object.values(names))
      expect(within(select).getByRole('option', { name })).toBeDefined()
    fireEvent.change(select, { target: { value: 'sinistral_annulment' } })
    expect(screen.getByText(/Omen of Sinistral Annulment/, { selector: 'span' })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '剥离石' }))
    fireEvent.click(screen.getByRole('button', { name: /选择移除此组：Protective/ }))
    fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
    expect(screen.getByText('剥离石 × 1')).toBeDefined()
    expect(screen.getByText('左旋剥离预兆 × 1')).toBeDefined()
    expect((select as HTMLSelectElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: '保存演练到本机' }))
    const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
    expect(saved.operations.at(-1).omen).toBe('sinistral_annulment')
    if (route === 'import')
      expect(saved.initialState.sourceText).toContain('+25(20-30) 能量护盾上限')
  },
)

it('目录刚就绪时显式选择优先于尚未执行的初始定位', async () => {
  render(
    <CatalogPanel
      translations={translations}
      fetchImpl={goodFetch()}
      onCatalogReady={() => {
        screen.getByRole('button', { name: /符文法器/ }).click()
      }}
    />,
  )
  await screen.findByRole('heading', { name: /符文法器/ })
})

it('旧目录在当前基底下说明暂无精华数据', async () => {
  render(
    <CatalogPanel
      translations={translations}
      initialBaseId="Runed Focus"
      fetchImpl={goodFetch()}
    />,
  )
  await screen.findByRole('heading', { name: /符文法器/ })
  fireEvent.click(screen.getByText('精华与保证属性'))
  expect(screen.getByText('当前目录暂无精华数据。')).toBeDefined()
})

it.each(['search', 'import'] as const)('精华查询从 %s 入口跟随基底变化', async (route) => {
  const data: CraftCatalog = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sources: [
        ...catalog._meta.sources,
        {
          path: 'src/Data/Essence.lua',
          url: `https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/${catalog._meta.sourceCommit}/src/Data/Essence.lua`,
          sha256: 'e'.repeat(64),
        },
      ],
    },
    essences: [
      {
        id: 'Metadata/Items/Currency/TestEssence',
        name: 'Test Essence',
        type: 'Test',
        tierLevel: 1,
        mods: { Focus: 'ShieldLow', Helmet: 'HelmetEffectDisplay' },
      },
    ],
  }
  render(
    <CatalogPanel
      translations={translations}
      {...(route === 'import'
        ? { initialBaseId: 'Runed Focus', imported: { baseId: 'Runed Focus', mods: [] } }
        : {})}
      fetchImpl={vi.fn<typeof fetch>(
        async () => ({ ok: true, json: async () => data }) as Response,
      )}
    />,
  )
  if (route === 'search') fireEvent.click(await screen.findByRole('button', { name: /符文法器/ }))
  await screen.findByRole('heading', { name: /符文法器/ })
  fireEvent.click(screen.getByText('精华与保证属性'))
  const panel = screen.getByText('精华与保证属性').closest('details')
  if (!panel) throw new Error('缺少精华折叠区')
  expect(within(panel).getByText('ShieldLow')).toBeDefined()
  expect(within(panel).queryByRole('button')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /铁制头盔/ }))
  expect(within(panel).getByText('HelmetEffectDisplay')).toBeDefined()
  expect(within(panel).queryByText('ShieldLow')).toBeNull()
  expect(within(panel).getByText('此效果尚未解析，不能据此模拟。')).toBeDefined()
})

it.each([
  ['desecrated', '亵渎'],
  ['fractured', '破裂'],
  ['', '破裂物品'],
])('当前装备显示 %s 来源，缺少固有属性或定位时仍拒绝制作', async (state, label) => {
  const raw = state ? `+25(20-30) 能量护盾上限 (${state})` : '+25(20-30) 能量护盾上限'
  const parsed = parseItem(
    `物品类别: 法器\n稀有度: 稀有\n试验 星火\n符文法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "试验的" (等阶：6) }\n${raw}${state ? '' : '\n--------\nFractured Item'}`,
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const dictionary = {
    items: { bases: translations, uniques: {} },
    stats: {
      entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
    },
  }
  const inspection = inspectItem(parsed.item, dictionary)
  render(
    <CatalogPanel
      translations={translations}
      initialBaseId="Runed Focus"
      initialItemLevel={40}
      dictionary={dictionary}
      imported={{ baseId: 'Runed Focus', mods: inspection.mods, item: parsed.item }}
      fetchImpl={goodFetch()}
    />,
  )
  const panel = await screen.findByLabelText('当前装备词缀')
  expect(within(panel).getByText(label)).toBeDefined()
  expect(within(panel).getByText('前缀 · 1 组')).toBeDefined()
  expect(within(panel).getByText(raw)).toBeDefined()
  if (!state) expect(within(panel).queryByLabelText('词缀来源')).toBeNull()
  const start = screen.queryByRole('button', { name: '从当前装备开始' }) as HTMLButtonElement | null
  expect(start === null || start.disabled).toBe(true)
  expect(
    screen.getByText(state ? /固有属性尚未与所选基底完整对应/ : /破裂必须定位一组显式属性/),
  ).toBeDefined()
})

it('可对应的工艺词缀从原文进入演练并保留工艺状态', async () => {
  const parsed = parseItem(
    '物品类别: 法器\n稀有度: 稀有\n试验 星火\n符文法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "试验的" (等阶：6) }\n+25(20-30) 能量护盾上限 (crafted)',
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const dictionary = {
    items: { bases: translations, uniques: {} },
    stats: {
      entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
    },
  }
  const inspection = inspectItem(parsed.item, dictionary)
  const data: CraftCatalog = {
    ...catalog,
    bases: catalog.bases.map((base) => ({
      ...base,
      implicit: null,
      implicitTags: [],
      socketLimit: null,
      runeforged: false,
    })),
  }
  render(
    <CatalogPanel
      translations={translations}
      initialBaseId="Runed Focus"
      initialItemLevel={40}
      dictionary={dictionary}
      imported={{ baseId: 'Runed Focus', mods: inspection.mods, item: parsed.item }}
      fetchImpl={vi.fn<typeof fetch>(
        async () => ({ ok: true, json: async () => data }) as Response,
      )}
    />,
  )
  const start = await screen.findByRole('button', { name: '从当前装备开始' })
  expect(start.hasAttribute('disabled')).toBe(false)
  fireEvent.click(start)
  const rehearsal = screen.getByLabelText('通货演练')
  expect(within(rehearsal).getByText('工艺词缀 1/1')).toBeDefined()
  expect(within(rehearsal).getByText('工艺')).toBeDefined()
  expect(within(rehearsal).getByText('+25(20-30) to maximum Energy Shield')).toBeDefined()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '神圣石' }))
  fireEvent.click(within(rehearsal).getByRole('button', { name: '应用本次结果' }))
  expect(within(rehearsal).getByText('工艺词缀 1/1')).toBeDefined()
})

it('已揭示亵渎来源导入演练并保留徽标、神圣状态与项目指纹', async () => {
  const parsed = parseItem(
    '物品类别: 法器\n稀有度: 稀有\n试验 星火\n符文法器\n--------\n物品等级: 40\n--------\n{ 前缀属性 "试验的" (等阶：6) }\n+25(20-30) 能量护盾上限 (desecrated)',
  )
  if (!parsed.ok) throw new Error(parsed.error)
  const dictionary = {
    items: { bases: translations, uniques: {} },
    stats: {
      entries: [{ id: 'shield', en: '+# to maximum Energy Shield', text: '+# 能量护盾上限' }],
    },
  }
  const inspection = inspectItem(parsed.item, dictionary)
  const data: CraftCatalog = {
    ...catalog,
    _meta: {
      ...catalog._meta,
      sourceCommit: DESECRATION_SOURCE.commit,
      sources: [DESECRATION_SOURCE],
      excludedDesecratedMods: [],
    },
    bases: catalog.bases.map((base) => ({
      ...base,
      implicit: null,
      implicitTags: [],
      socketLimit: null,
      runeforged: false,
    })),
  }
  render(
    <CatalogPanel
      translations={translations}
      initialBaseId="Runed Focus"
      initialItemLevel={40}
      dictionary={dictionary}
      imported={{ baseId: 'Runed Focus', mods: inspection.mods, item: parsed.item }}
      fetchImpl={vi.fn<typeof fetch>(
        async () => ({ ok: true, json: async () => data }) as Response,
      )}
    />,
  )
  const start = await screen.findByRole('button', { name: '从当前装备开始' })
  expect(start.hasAttribute('disabled')).toBe(false)
  fireEvent.click(start)
  const rehearsal = screen.getByLabelText('通货演练')
  expect(within(rehearsal).getByText('亵渎词缀 1/1')).toBeDefined()
  expect(within(rehearsal).getByText('亵渎')).toBeDefined()
  expect(within(rehearsal).getByText('+25(20-30) to maximum Energy Shield')).toBeDefined()
  expect(within(rehearsal).getByText(/亵渎组也可能被移除/)).toBeDefined()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '神圣石' }))
  fireEvent.click(within(rehearsal).getByRole('button', { name: '应用本次结果' }))
  expect(within(rehearsal).getByText('亵渎词缀 1/1')).toBeDefined()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '保存演练到本机' }))
  const saved = JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}')
  expect(saved.desecrationSourceHash).toBe(DESECRATION_SOURCE.sha256)
  fireEvent.change(within(rehearsal).getByLabelText('装备文本语言'), { target: { value: 'en' } })
  fireEvent.click(within(rehearsal).getByRole('button', { name: '导出装备文本' }))
  expect(
    (within(rehearsal).getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value,
  ).toContain('(desecrated)')
  fireEvent.click(within(rehearsal).getByRole('button', { name: '剥离石' }))
  const removal = within(rehearsal).getByLabelText('选择要移除的词缀')
  expect(within(removal).getByText('亵渎')).toBeDefined()
  fireEvent.click(within(removal).getByRole('button', { name: /选择移除此组/ }))
  expect(within(within(rehearsal).getByLabelText('将移除的词缀')).getByText('亵渎')).toBeDefined()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '应用本次结果' }))
  expect(within(rehearsal).queryByText('亵渎词缀 1/1')).toBeNull()
  expect(
    (within(rehearsal).getByLabelText('演练装备英文文本') as HTMLTextAreaElement).value,
  ).not.toContain('(desecrated)')
  fireEvent.click(within(rehearsal).getByRole('button', { name: '保存演练到本机' }))
  expect(
    JSON.parse(localStorage.getItem('poe2-tools:craft-rehearsal:v1') ?? '{}').desecrationSourceHash,
  ).toBe(DESECRATION_SOURCE.sha256)
  fireEvent.click(within(rehearsal).getByRole('button', { name: '撤销' }))
  expect(within(rehearsal).getByText('亵渎词缀 1/1')).toBeDefined()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '重做' }))
  expect(within(rehearsal).queryByText('亵渎词缀 1/1')).toBeNull()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '恢复本机演练' }))
  expect(within(rehearsal).queryByText('亵渎词缀 1/1')).toBeNull()
  fireEvent.click(within(rehearsal).getByRole('button', { name: '撤销' }))
  expect(within(rehearsal).getByText('亵渎词缀 1/1')).toBeDefined()
})
