import type { DictBundle } from '@poe2-tools/build-core'
import type { CraftCatalog } from '@poe2-tools/item-core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miniBundle } from '../../../../packages/build-core/src/testing/miniDict'
import { fakeDictFetch } from '../testing/fakeDictFetch'
import { CraftApp, PROJECT_KEY } from './CraftApp'

const miniItems = miniBundle.items
const miniStats = miniBundle.stats
if (miniItems === undefined || miniStats === undefined) throw new Error('测试词典缺少装备或词缀表')

const craftBundle = {
  ...miniBundle,
  items: {
    ...miniItems,
    _meta: { ...miniItems._meta, count: 5 },
    bases: { ...miniItems.bases, 'Runed Focus': '符文法器' },
  },
  stats: {
    ...miniStats,
    _meta: { ...miniStats._meta, count: 13 },
    entries: [
      ...miniStats.entries,
      { id: 'explicit.stat_4052037485', en: '# to maximum Energy Shield', text: '# 能量护盾上限' },
      { id: 'explicit.stat_1671376347', en: '#% to Lightning Resistance', text: '闪电抗性 #%' },
    ],
  },
}

const sample = `物品类别: 法器
稀有度: 稀有
试验 星火
符文法器
--------
属性:
能量护盾: 80 (augmented)
--------
需求： 等级 45, 64 智慧
--------
物品等级: 46
--------
{ 前缀属性 "试验的" (等阶：6) — 法术 }
+38(36-41) 能量护盾上限
{ 后缀属性 "试验之" (等阶：6) — 元素, 闪电, 抗性 }
闪电抗性 +17(16-20)%
--------
插槽: S S
--------
获得技能: 等级 12 试验守卫
--------
备注: ~b/o 5 synthetic`

const unknownSample = sample.replace('闪电抗性 +17(16-20)%', '未收录效果 17%')
const bridgeSample = sample
  .replace('属性:\n', '')
  .replace('--------\n插槽: S S\n--------\n获得技能: 等级 12 试验守卫\n--------\n', '--------\n')

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('测试未提供制作目录'))
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderReady() {
  render(<CraftApp fetchImpl={fakeDictFetch(craftBundle)} />)
  await screen.findByText('英文词典就绪')
}

function parse(text = sample) {
  fireEvent.change(screen.getByLabelText('粘贴装备文本'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '解析装备' }))
}

describe('CraftApp', () => {
  it.each([false, true])(
    '目录就绪补已知英文身份并进入制作，混合英文技能=%s，无额外请求或历史重置',
    async (withSkill) => {
      const catalog: CraftCatalog = {
        _meta: {
          schemaVersion: 2,
          tier: 'primary',
          sourceCommit: 'a'.repeat(40),
          gameVersion: null,
          generatedAt: '2026-09-13',
          weightStatus: 'unknown',
          sources: [],
          excludedBases: [],
        },
        bases: [
          {
            id: 'Known English Name',
            name: 'Known English Name',
            type: 'Spear',
            tags: ['default'],
            requirements: {},
            properties: {},
            implicit: withSkill ? 'Grants Skill: Spear Throw' : null,
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
            kind: 'prefix',
            name: 'Healthy',
            group: 'life',
            level: 1,
            lines: ['+(10-20) to maximum Life'],
            statOrder: [1],
            tags: [],
            addsTags: [],
            eligibility: [{ tag: 'default', value: 1 }],
            tradeHashes: {},
          },
        ],
      }
      const catalogFetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => catalog } as Response)
      render(<CraftApp fetchImpl={fakeDictFetch(craftBundle, { omit: ['items'] })} />)
      await screen.findByText('英文词典就绪')
      expect(catalogFetch).not.toHaveBeenCalled()
      const text = `物品类别: Spears\n稀有度: 普通\nKnown English Name\n--------\n物品等级: 70${withSkill ? '\n--------\nGrants Skill: Spear Throw' : ''}`
      parse(text)
      const baseSection = screen.getByRole('heading', { name: '基底英文' }).closest('section')
      if (!baseSection) throw new Error('缺少身份区块')
      expect(within(baseSection).getByText('未识别')).toBeDefined()
      const details = screen.getByText('搜索基底、词缀与通货演练').closest('details')
      if (!details) throw new Error('缺少目录入口')
      expect(details.open).toBe(true)
      const start = await screen.findByRole('button', { name: '从当前装备开始' })
      expect(within(baseSection).getByText('Known English Name')).toBeDefined()
      expect(catalogFetch.mock.calls.map(([url]) => url)).toEqual([
        '/craft-data/catalog.json',
        '/craft-data/alloys.json',
        '/craft-data/runeforging.json',
      ])
      fireEvent.click(start)
      fireEvent.click(screen.getByRole('button', { name: '蜕变石' }))
      fireEvent.click(
        within(screen.getByLabelText('本次指定结果')).getByRole('button', { name: /life/ }),
      )
      fireEvent.click(screen.getByRole('button', { name: '应用本次结果' }))
      const history = screen.getByLabelText('演练历史').textContent
      details.open = false
      fireEvent(details, new Event('toggle'))
      fireEvent.click(screen.getByRole('button', { name: '保存到本机' }))
      expect(details.open).toBe(false)
      expect(screen.getByLabelText('演练历史').textContent).toBe(history)
      details.open = true
      fireEvent(details, new Event('toggle'))
      expect(screen.getByLabelText('演练历史').textContent).toBe(history)
      expect(catalogFetch.mock.calls.map(([url]) => url)).toEqual([
        '/craft-data/catalog.json',
        '/craft-data/alloys.json',
        '/craft-data/runeforging.json',
      ])
      fireEvent.change(screen.getByLabelText('粘贴装备文本'), {
        target: { value: text.replace('70', '71') },
      })
      expect(screen.queryByLabelText('演练历史')).toBeNull()
      expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
      parse(text.replace('Known English Name', 'Unknown English Name'))
      expect(within(baseSection).getByText('未识别')).toBeDefined()
      expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
      expect(catalogFetch.mock.calls.map(([url]) => url)).toEqual([
        '/craft-data/catalog.json',
        '/craft-data/alloys.json',
        '/craft-data/runeforging.json',
      ])
    },
  )
  it.each([
    '不是装备文本',
    '物品类别: 法杖\n稀有度: 传奇\n试作传奇\n试作法杖\n--------\n物品等级: 86',
    '物品类别: 咒符\n稀有度: 魔法\n试作咒符\n--------\n物品等级: 39',
  ])('无效或仅供对照的输入不自动打开工坊：%s', async (text) => {
    const fetchCatalog = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('不应加载'))
    await renderReady()
    parse(text)
    expect(screen.getByText('搜索基底、词缀与通货演练').closest('details')?.open).toBe(false)
    expect(fetchCatalog).not.toHaveBeenCalled()
  })
  it('技能原文与最高等级有独立对照，歧义只允许选择已有词典候选', async () => {
    const bundle = {
      ...craftBundle,
      stats: {
        ...craftBundle.stats,
        entries: [
          ...craftBundle.stats.entries,
          {
            id: 'skill.test_guard',
            en: 'Grants Skill: Level # Test Guard',
            text: '获得技能: 等级 # 试验守卫',
          },
          {
            id: 'skill.other_guard',
            en: 'Grants Skill: Level # Other Guard',
            text: '获得技能: 等级 # 试验守卫',
          },
        ],
      },
    }
    render(<CraftApp fetchImpl={fakeDictFetch(bundle)} />)
    await screen.findByText('英文词典就绪')
    parse(sample.replace('等级 12 试验守卫', '等级 12 试验守卫（最高等级 13）'))
    const panel = screen.getByRole('region', { name: '授予技能对照' })
    expect(within(panel).getByText('获得技能: 等级 12 试验守卫（最高等级 13）')).toBeDefined()
    const choice = within(panel).getByRole('combobox') as HTMLSelectElement
    fireEvent.change(choice, { target: { value: 'skill.test_guard' } })
    expect((screen.getByLabelText('英文对照文本') as HTMLTextAreaElement).value).toMatch(
      /Grants Skill: Level 12 Test Guard.*13/,
    )
    fireEvent.change(screen.getByLabelText('粘贴装备文本'), {
      target: { value: `${sample}\nCorrupted` },
    })
    expect(choice.disabled).toBe(true)
  })
  it('符文候选选择只改英文对照，修改输入后旧候选不可继续使用', async () => {
    const ambiguousBundle = {
      ...craftBundle,
      stats: {
        ...craftBundle.stats,
        entries: [
          ...craftBundle.stats.entries,
          { id: 'test-rune-cold', en: '#% to Cold Resistance', text: '闪电抗性 #%' },
        ],
      },
    }
    render(<CraftApp fetchImpl={fakeDictFetch(ambiguousBundle)} />)
    await screen.findByText('英文词典就绪')
    const text = `${bridgeSample}\n--------\n闪电抗性 +20% (rune)`
    parse(text)
    const region = screen.getByRole('region', { name: '符文效果对照' })
    const selection = within(region).getByRole('combobox') as HTMLSelectElement
    expect(selection.value).toBe('')
    fireEvent.change(selection, { target: { value: 'test-rune-cold' } })
    expect((screen.getByLabelText('英文对照文本') as HTMLTextAreaElement).value).toContain(
      '+20% to Cold Resistance (rune)',
    )
    expect(within(region).getByText('闪电抗性 +20% (rune)')).toBeDefined()
    fireEvent.change(screen.getByLabelText('粘贴装备文本'), {
      target: { value: `${text}\nCorrupted` },
    })
    expect(selection.disabled).toBe(true)
  })
  it('符文原文有独立中英对照，未知效果不混入普通前后缀', async () => {
    await renderReady()
    parse(`${bridgeSample}\n--------\n闪电抗性 +20% (rune)\n未知镶嵌效果 (rune)`)
    const panel = screen.getByRole('region', { name: '符文效果对照' })
    expect(within(panel).getByText('闪电抗性 +20% (rune)')).toBeDefined()
    expect(within(panel).getByText('+20% to Lightning Resistance')).toBeDefined()
    expect(within(panel).getByText('未识别')).toBeDefined()
    expect(screen.getByText('后缀 · 1 组')).toBeDefined()
    expect((screen.getByLabelText('英文对照文本') as HTMLTextAreaElement).value).toContain(
      '+20% to Lightning Resistance (rune)',
    )
  })
  it('提示高级复制且不劫持 Ctrl+Alt+C', async () => {
    await renderReady()
    expect(screen.getByText(/Ctrl\+Alt\+C 复制高级装备文本/)).toBeDefined()
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true, altKey: true })
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('载入示例得到已验证的稀有符文法器并可转接', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: '载入示例' }))
    fireEvent.click(screen.getByRole('button', { name: '解析装备' }))
    expect(screen.getByRole('heading', { name: /Runed Focus|符文法器/ })).toBeDefined()
    expect(screen.getByRole('link', { name: '在 CoE 打开' })).toBeDefined()
  })

  it('粘贴后按词缀分组显示结构，并提供只读英文对照', async () => {
    await renderReady()
    parse()

    expect(screen.getByRole('heading', { name: /试验 星火/ })).toBeDefined()
    expect(screen.getByText('物品等级 46')).toBeDefined()
    expect(screen.getByText('前缀 · 1 组')).toBeDefined()
    expect(screen.getByText('后缀 · 1 组')).toBeDefined()
    expect(screen.getByText('+38(36-41) to maximum Energy Shield')).toBeDefined()
    expect(screen.getByText('+17(16-20)% to Lightning Resistance')).toBeDefined()
    expect(screen.getByText('需求： 等级 45, 64 智慧')).toBeDefined()
    expect(screen.getByText('获得技能: 等级 12 试验守卫')).toBeDefined()

    const preview = screen.getByLabelText('英文对照文本') as HTMLTextAreaElement
    expect(preview.readOnly).toBe(true)
    expect(preview.value).toContain('Runed Focus')
    expect(preview.value).not.toContain('~b/o')
  })

  it('未识别行保留原文并阻止完整导入，仍允许复制对照草稿', async () => {
    await renderReady()
    parse(unknownSample)

    const pair = screen.getByText('未收录效果 17%').closest('.stat-pair') as HTMLElement
    expect(within(pair).getByText('未识别')).toBeDefined()
    expect(screen.getByText('尚不能完整转接，原因见下方')).toBeDefined()
    expect(screen.getByText('含未识别原文，英文对照仍保留原内容。')).toBeDefined()
    expect(
      (screen.getByRole('button', { name: '在 CoE 打开' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByRole('button', { name: '复制对照草稿' })).toBeDefined()
    expect((screen.getByLabelText('英文对照文本') as HTMLTextAreaElement).value).toContain(
      '未收录效果 17%',
    )
  })

  it('编辑输入后旧结果标记失效且导出不可用', async () => {
    await renderReady()
    parse(bridgeSample)
    expect(screen.getByRole('link', { name: '在 CoE 打开' })).toBeDefined()

    fireEvent.change(screen.getByLabelText('粘贴装备文本'), {
      target: { value: `${bridgeSample}\n被腐化` },
    })
    expect(screen.getByText('输入已修改，请重新解析')).toBeDefined()
    expect(screen.queryByRole('link', { name: '在 CoE 打开' })).toBeNull()
    expect(
      (screen.getByRole('button', { name: '在 CoE 打开' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect((screen.getByRole('button', { name: /复制/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('显式保存并恢复本机项目，损坏数据给反馈而不崩溃', async () => {
    const { unmount } = render(<CraftApp fetchImpl={fakeDictFetch(craftBundle)} />)
    await screen.findByText('英文词典就绪')
    parse()
    fireEvent.click(screen.getByRole('button', { name: '保存到本机' }))
    expect(screen.getByText('已保存到本机')).toBeDefined()
    expect(JSON.parse(localStorage.getItem(PROJECT_KEY) ?? '{}')).toMatchObject({
      version: 1,
      rawText: sample,
    })

    unmount()
    render(<CraftApp fetchImpl={fakeDictFetch(craftBundle)} />)
    await screen.findByText('英文词典就绪')
    fireEvent.click(screen.getByRole('button', { name: '恢复本机项目' }))
    expect((screen.getByLabelText('粘贴装备文本') as HTMLTextAreaElement).value).toBe(sample)
    expect(screen.getByText('前缀 · 1 组')).toBeDefined()

    localStorage.setItem(PROJECT_KEY, '{broken')
    fireEvent.click(screen.getByRole('button', { name: '恢复本机项目' }))
    expect(screen.getByText('本机项目已损坏或无法读取')).toBeDefined()
  })

  it('保存受限给出反馈，恢复不可解析内容清除旧导出', async () => {
    await renderReady()
    parse(bridgeSample)
    const workingStorage = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => workingStorage.getItem(key),
        removeItem: (key: string) => workingStorage.removeItem(key),
        setItem: () => {
          throw new Error('denied')
        },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存到本机' }))
    expect(screen.getByText('浏览器禁止本机存储，本次内容未保存')).toBeDefined()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: workingStorage })

    localStorage.setItem(PROJECT_KEY, JSON.stringify({ version: 1, rawText: '不是装备' }))
    fireEvent.click(screen.getByRole('button', { name: '恢复本机项目' }))
    expect(screen.getByText('恢复的内容无法识别：无法识别装备文本')).toBeDefined()
    expect((screen.getByLabelText('粘贴装备文本') as HTMLTextAreaElement).value).toBe('不是装备')
    expect(screen.queryByLabelText('英文对照文本')).toBeNull()
  })

  it('慢速旧 locale 结果不会覆盖较新的词典，卸载后也不写状态', async () => {
    let releaseCn!: () => void
    const cnGate = new Promise<void>((resolve) => {
      releaseCn = resolve
    })
    const inner = fakeDictFetch(craftBundle)
    const { unmount } = render(
      <CraftApp
        fetchImpl={async (url) => {
          if (url.includes('/zh-CN/')) await cnGate
          return inner(url)
        }}
      />,
    )
    parse(
      bridgeSample
        .replace('物品类别:', '物品種類:')
        .replace('稀有度:', '稀有度:')
        .replace('物品等级:', '物品等級:'),
    )
    await screen.findByText('英文词典就绪')
    expect(screen.getByText('+38(36-41) to maximum Energy Shield')).toBeDefined()
    releaseCn()
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.getByText('+38(36-41) to maximum Energy Shield')).toBeDefined()
    unmount()
  })

  it('展示基底英文候选，选择后仍可修改、清空，输入变脏时禁用', async () => {
    const ambiguous: DictBundle = {
      ...craftBundle,
      items: {
        ...craftBundle.items,
        _meta: { ...craftBundle.items._meta, count: 6 },
        bases: { ...craftBundle.items.bases, 'Alternate Focus': '符文法器' },
      },
    }
    render(<CraftApp fetchImpl={fakeDictFetch(ambiguous)} />)
    await screen.findByText('英文词典就绪')
    parse(bridgeSample)
    const baseSelect = screen.getByLabelText('基底英文候选') as HTMLSelectElement
    expect(baseSelect.options).toHaveLength(3)
    fireEvent.change(baseSelect, { target: { value: 'Runed Focus' } })
    expect(screen.getByLabelText('基底英文候选')).toBeDefined()
    fireEvent.change(baseSelect, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('粘贴装备文本'), {
      target: { value: `${bridgeSample} ` },
    })
    expect((screen.getByLabelText('基底英文候选') as HTMLSelectElement).disabled).toBe(true)
  })

  it('词典失败时仍显示中文结构，并能重试加载英文', async () => {
    let fail = true
    const good = fakeDictFetch(craftBundle)
    render(
      <CraftApp
        fetchImpl={async (url) =>
          fail ? { ok: false, status: 500, json: async () => null } : good(url)
        }
      />,
    )
    await screen.findByText('英文词典加载失败')
    parse()
    expect(screen.getByText('前缀 · 1 组')).toBeDefined()
    expect(screen.getByText('+38(36-41) 能量护盾上限')).toBeDefined()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重试英文词典' }))
    await screen.findByText('英文词典就绪')
    expect(screen.getByText('+38(36-41) to maximum Energy Shield')).toBeDefined()
  })

  it('咒符和真实传奇分别标为仅供对照，页面没有制作操作', async () => {
    await renderReady()
    parse(sample.replace('物品类别: 法器', '物品类别: 咒符'))
    const notice = screen.getByText('仅供对照').closest('section')
    expect(notice).not.toBeNull()
    expect(within(notice as HTMLElement).getByText(/咒符/)).toBeDefined()
    expect(screen.queryByRole('region', { name: '精华制作' })).toBeNull()
    parse(sample.replace('稀有度: 稀有', '稀有度: 传奇'))
    const uniqueNotice = screen.getByText('仅供对照').closest('section')
    expect(
      within(uniqueNotice as HTMLElement).getByText('传奇装备仅供解析与中英对照，不开放制作。'),
    ).toBeDefined()
    expect(screen.queryByRole('button', { name: /制作|模拟/ })).toBeNull()
    expect(screen.queryByRole('region', { name: '精华制作' })).toBeNull()
  })
})

it.each([
  ['crafted', '工艺'],
  ['desecrated', '亵渎'],
  ['fractured', '破裂'],
])('显示 %s 来源且保留中英对照', async (state, label) => {
  await renderReady()
  const raw = `+38(36-41) 能量护盾上限 (${state})`
  parse(bridgeSample.replace('+38(36-41) 能量护盾上限', raw))
  const card = screen
    .getByText(raw, { selector: '.stat-pair span' })
    .closest<HTMLElement>('.mod-card')
  if (!card) throw new Error('缺少词缀卡')
  expect(within(card).getByText(label)).toBeDefined()
  expect(within(card).getByText(`+38(36-41) to maximum Energy Shield (${state})`)).toBeDefined()
  expect(screen.getByText('前缀 · 1 组')).toBeDefined()
})

it('混合行来源合并显示，破裂物品旗标不赋予其他词缀状态', async () => {
  await renderReady()
  parse(
    `${bridgeSample.replace(
      '+38(36-41) 能量护盾上限',
      '+38(36-41) 能量护盾上限 (crafted) (fractured)\n+20 能量护盾上限 (desecrated)',
    )}\n--------\nFractured Item`,
  )
  const card = screen
    .getByText('+20 能量护盾上限 (desecrated)', { selector: '.stat-pair span' })
    .closest<HTMLElement>('.mod-card')
  if (!card) throw new Error('缺少词缀卡')
  for (const label of ['工艺', '亵渎', '破裂']) expect(within(card).getByText(label)).toBeDefined()
  expect(screen.getByText('破裂物品')).toBeDefined()
  const suffix = screen
    .getByText('闪电抗性 +17(16-20)%', { selector: '.stat-pair span' })
    .closest<HTMLElement>('.mod-card')
  if (!suffix) throw new Error('缺少后缀卡')
  expect(within(suffix).queryByLabelText('词缀来源')).toBeNull()
})

it.each([
  ['物品类别: 法器', '物品类别: 咒符', /咒符/],
  ['稀有度: 稀有', '稀有度: 传奇', /传奇装备仅供解析/],
])('特殊来源保留 %s 对应的只读策略', async (before, after, reason) => {
  await renderReady()
  parse(
    bridgeSample
      .replace(before, after)
      .replace('+38(36-41) 能量护盾上限', '+38(36-41) 能量护盾上限 (crafted)'),
  )
  expect(screen.getByText('工艺')).toBeDefined()
  const notice = screen.getByText('仅供对照').closest('section')
  if (!notice) throw new Error('缺少只读提示')
  expect(within(notice).getByText(reason)).toBeDefined()
  expect(screen.queryByRole('button', { name: '从当前装备开始' })).toBeNull()
})
