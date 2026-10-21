import { createMatcher, type GuideDocument, prepareBlock } from '@poe2-tools/guide-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadingView, type ReadingHandlers } from '../src/guide/view-reading'

const handlers = (): ReadingHandlers => ({
  onStage: vi.fn(),
  onRetryBlock: vi.fn(),
  onStop: vi.fn(),
  onReload: vi.fn(),
  onSettings: vi.fn(),
  onScope: vi.fn(),
  onSelection: vi.fn(),
  onBegin: vi.fn(),
  onMode: vi.fn(),
  onLocate: vi.fn(),
  onRestore: vi.fn(),
  onIntroSeen: vi.fn(),
})
const matcher = createMatcher({
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h',
  entries: [{ id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' }],
  abbreviations: [{ en: 'ES', note: 'Energy Shield，能量护盾' }],
})
const doc: GuideDocument = {
  version: 1,
  game: 'poe2',
  targetLocale: 'zh-CN',
  source: {
    url: 'https://mobalytics.gg/poe-2/builds/x',
    title: 'Build X',
    siteId: 'mobalytics',
    extractedAt: '2026-10-07T00:00:00Z',
    scope: 'full',
  },
  stages: [
    { id: 's1', name: 'Leveling', current: true },
    { id: 's2', name: 'Endgame', current: false },
  ],
  blocks: [
    { id: 'b0', kind: 'paragraph', text: 'Use Contagion with ES.', stageId: 's1' },
    { id: 'b1', kind: 'paragraph', text: '<img src=x onerror=alert(1)>', stageId: 's2' },
  ],
}
const prepared = doc.blocks.map((b) => prepareBlock(b, matcher))
const mount = (h = handlers()) => {
  const v = createReadingView(document, h, '0.5.0')
  document.body.append(v.root)
  v.showDocument(doc, prepared, 's1')
  return { v, h }
}
afterEach(() => {
  document.body.textContent = ''
})

describe('createReadingView', () => {
  it('标题、阶段条与当前阶段的段落', () => {
    mount()
    expect(document.querySelector('.guide-title')?.textContent).toBe('Build X')
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.stage')]
    expect(tabs.map((t) => [t.textContent, t.getAttribute('aria-pressed')])).toEqual([
      ['Leveling', 'true'],
      ['Endgame', 'false'],
    ])
    const visible = [...document.querySelectorAll<HTMLElement>('.block')]
      .filter((b) => !b.hidden)
      .map((b) => b.dataset.id)
    expect(visible).toEqual(['b0'])
  })
  it('术语与简称标注带说明，原文按纯文本显示', () => {
    const { v } = mount()
    const term = document.querySelector('.term')
    expect(term?.textContent).toBe('Contagion')
    expect(term?.getAttribute('title')).toContain('瘟疫')
    expect(term?.getAttribute('tabindex')).toBe('0')
    expect(document.querySelector('abbr')?.getAttribute('title')).toBe('Energy Shield，能量护盾')
    expect(document.querySelector('img')).toBeNull()
    const mode = document.querySelector<HTMLSelectElement>('select[aria-label="阅读位置"]')
    if (!mode) throw Error('missing mode')
    mode.value = 'sidebar'
    mode.dispatchEvent(new Event('change'))
    v.showStage('s2')
    expect(document.querySelector('[data-id="b1"] .src')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    )
  })
  it('切换阶段调用处理函数，showStage 切换可见段落', () => {
    const { v, h } = mount()
    document.querySelectorAll<HTMLButtonElement>('.stage')[1]?.click()
    expect(h.onStage).toHaveBeenCalledWith('s2')
    v.showStage('s2')
    const visible = [...document.querySelectorAll<HTMLElement>('.block')]
      .filter((b) => !b.hidden)
      .map((b) => b.dataset.id)
    expect(visible).toEqual(['b1'])
  })
  it('写入译文、核对提示与失败重试', () => {
    const { v, h } = mount()
    v.setTranslation('b0', '配合 ES 使用瘟疫。', 'engine', [
      { kind: 'number-mismatch', detail: '缺少 3' },
    ])
    expect(document.querySelector('[data-id="b0"] .dst')?.textContent).toBe('配合 ES 使用瘟疫。')
    expect(document.querySelector('[data-id="b0"] .issues')?.textContent).toContain('缺少 3')
    v.setBlockState('b0', 'failed', '网络错误')
    const retry = document.querySelector<HTMLButtonElement>('[data-id="b0"] .retry-block')
    expect(retry?.hidden).toBe(false)
    retry?.click()
    expect(h.onRetryBlock).toHaveBeenCalledWith('b0')
  })
  it('站点行常驻说明：Mobalytics 正常读取时只有域名；通用提取与回退时说明适用范围', () => {
    const { v } = mount()
    const site = () => document.querySelector('.guide-site')?.textContent
    expect(site()).toBe('mobalytics.gg')
    const generic = {
      ...doc,
      source: { ...doc.source, url: 'https://example.com/g', siteId: 'generic' as const },
    }
    v.showDocument(generic, prepared, 's1')
    expect(site()).toBe('example.com · 通用提取，仅支持 PoE2 术语')
    const fallback = { ...doc, stages: [], source: { ...doc.source, fallback: true as const } }
    v.showDocument(fallback, prepared, null)
    expect(site()).toBe(
      'mobalytics.gg · 通用提取，仅支持 PoE2 术语 · 页面数据与地址不一致（站内跳转后常见），已改用通用读取；刷新页面可恢复完整阶段',
    )
    const other = {
      ...doc,
      stages: [],
      source: {
        ...doc.source,
        url: 'https://pathofexile2.com/forum/x',
        siteId: 'poe2com' as const,
        fallback: true as const,
      },
    }
    v.showDocument(other, prepared, null)
    expect(site()).toBe(
      'pathofexile2.com · 通用提取，仅支持 PoE2 术语 · 站点可能改版，可检查扩展更新',
    )
  })
  it('clearDocument 清空标题、阶段条与段落', () => {
    const { v } = mount()
    v.clearDocument()
    expect(document.querySelector('.guide-title')?.textContent).toBe('')
    expect(document.querySelector('.guide-site')?.textContent).toBe('')
    expect(document.querySelectorAll('.stage')).toHaveLength(0)
    expect(document.querySelector<HTMLElement>('.guide-stages')?.hidden).toBe(true)
    expect(document.querySelectorAll('.block')).toHaveLength(0)
    // 清空后旧段号的状态更新不报错、不留痕
    v.setBlockState('b0', 'failed', 'x')
    v.setStageState('s1', 'done')
    expect(document.querySelectorAll('.block')).toHaveLength(0)
  })
  it('阶段状态有文字说明', () => {
    const { v } = mount()
    const first = document.querySelector<HTMLButtonElement>('.stage')
    expect(first?.getAttribute('aria-description')).toBe('未翻译')
    v.setStageState('s1', 'done')
    expect([first?.dataset.state, first?.getAttribute('aria-description')]).toEqual([
      'done',
      '已翻译',
    ])
  })
  it('ask 返回用户选择', async () => {
    const { v } = mount()
    const answer = v.ask('超过上限，继续吗？', '继续')
    document.querySelector<HTMLButtonElement>('.ask-ok')?.click()
    await expect(answer).resolves.toBe(true)
  })
  it('ask 在中止或被新确认框取代时按取消结束', async () => {
    const { v } = mount()
    const abort = new AbortController()
    const first = v.ask('第一次', '继续', abort.signal)
    abort.abort()
    await expect(first).resolves.toBe(false)
    expect(document.querySelector<HTMLElement>('.guide-ask')?.hidden).toBe(true)
    const second = v.ask('第二次', '继续')
    const third = v.ask('第三次', '继续')
    await expect(second).resolves.toBe(false)
    expect(document.querySelector('.guide-ask p')?.textContent).toBe('第三次')
    document.querySelector<HTMLButtonElement>('.ask-ok')?.click()
    await expect(third).resolves.toBe(true)
    const done = new AbortController()
    done.abort()
    await expect(v.ask('已中止', '继续', done.signal)).resolves.toBe(false)
  })
})

it('词典、机器、待核对与原样保留分开，缓存不提升质量等级', () => {
  const { v } = mount()
  const status = () => document.querySelector('[data-id="b0"] .block-status')?.textContent
  v.setTranslation('b0', '中文', 'dictionary', [])
  expect(status()).toBe('词典译文')
  v.setTranslation('b0', '中文', 'engine', [])
  expect(status()).toBe('机器译文')
  v.setTranslation('b0', '中文', 'cache', [{ kind: 'placeholder', detail: '缺失' }])
  expect(status()).toBe('待核对 · 机器译文（缓存）')
  v.setBlockState('b0', 'skipped')
  expect(status()).toBe('原样保留')
})

it('失败后移除上一轮译文和复制入口，保留原文', () => {
  const { v } = mount()
  v.setTranslation('b0', '旧译文', 'engine', [])
  v.setBlockState('b0', 'failed', '译文格式异常')
  expect(document.querySelector('[data-id="b0"] .dst')?.textContent).toBe('')
  expect(document.querySelector<HTMLButtonElement>('[data-id="b0"] .copy-block')?.hidden).toBe(true)
  expect(document.querySelector('[data-id="b0"] .src')?.textContent).toBe('Use Contagion with ES.')
})

it('范围和阅读位置独立操作，开始按钮受预览和忙碌状态控制', () => {
  const { v, h } = mount()
  const begin = document.querySelector<HTMLButtonElement>('.guide-begin')
  expect(begin?.disabled).toBe(true)
  v.setReady(true)
  begin?.click()
  expect(h.onBegin).toHaveBeenCalledOnce()
  v.setBusy(true)
  expect(begin?.disabled).toBe(true)
  v.setBusy(false)
  const scope = document.querySelector<HTMLSelectElement>('select[aria-label="读取范围"]')
  if (!scope) throw Error('missing scope')
  scope.value = 'selection'
  scope.dispatchEvent(new Event('change'))
  expect(h.onScope).toHaveBeenCalledWith('selection')
  const mode = document.querySelector<HTMLSelectElement>('select[aria-label="阅读位置"]')
  if (!mode) throw Error('missing mode')
  mode.value = 'sidebar'
  mode.dispatchEvent(new Event('change'))
  expect(h.onMode).toHaveBeenCalledWith('sidebar')
  document.querySelector<HTMLButtonElement>('.locate-block')?.click()
  expect(h.onLocate).toHaveBeenCalledWith('b0')
  v.setProgress({ selected: 2, completed: 1, failed: 0, preserved: 1, characters: 80 })
  expect(document.querySelector('.guide-progress')?.textContent).toContain('已选 2 段 / 80 字')
  expect(document.querySelector('.guide-scope')?.textContent).toContain('不含隐藏/折叠内容和子页')
})

it('章节取消只返回所选章节块，不扩大到其他阶段', () => {
  const { v, h } = mount()
  const blocks = [
    { id: 'h', kind: 'heading' as const, text: 'First heading', stageId: 's1' },
    { id: 'a', kind: 'paragraph' as const, text: 'First paragraph.', stageId: 's1' },
    { id: 'h2', kind: 'heading' as const, text: 'Second heading', stageId: 's1' },
    { id: 'b', kind: 'paragraph' as const, text: 'Second paragraph.', stageId: 's1' },
    { id: 'outside', kind: 'paragraph' as const, text: 'Other stage.', stageId: 's2' },
  ]
  v.showDocument(
    { ...doc, blocks },
    blocks.map((b) => prepareBlock(b, matcher)),
    's1',
  )
  const choices = document.querySelectorAll<HTMLInputElement>('.chapter-check')
  expect(choices).toHaveLength(2)
  const first = choices[0]
  if (!first) throw Error('missing checkbox')
  first.checked = false
  first.dispatchEvent(new Event('change'))
  expect(h.onSelection).toHaveBeenCalledWith(['h2', 'b'])
  expect(h.onBegin).not.toHaveBeenCalled()
})

it('侧栏保留列表与表格行列，标题保持层级', async () => {
  const { prepareGuideBlocks } = await import('@poe2-tools/guide-core')
  const { v } = mount()
  const blocks: GuideDocument['blocks'] = [
    { id: 'h', kind: 'heading', text: 'Rewards', context: { headingLevel: 2 } },
    { id: 'l', kind: 'list-item', text: 'Collect reward.', context: { listId: 'list' } },
    {
      id: 'c1',
      kind: 'table-cell',
      text: 'Zone',
      context: { tableId: 'table', rowId: 'r1', column: 0, header: true },
    },
    {
      id: 'c2',
      kind: 'table-cell',
      text: 'Reward',
      context: { tableId: 'table', rowId: 'r1', column: 1, header: true },
    },
    {
      id: 'c3',
      kind: 'table-cell',
      text: 'Clearfell',
      context: { tableId: 'table', rowId: 'r2', column: 0 },
    },
    {
      id: 'c4',
      kind: 'table-cell',
      text: 'Permanent bonus.',
      context: { tableId: 'table', rowId: 'r2', column: 1 },
    },
  ]
  const prepared = await prepareGuideBlocks(blocks, matcher, {
    hash: 's',
    ruleVersion: '1',
    resolve: () => ({ status: 'unmatched', text: null, candidates: [] }),
  })
  v.showDocument({ ...doc, blocks, stages: [] }, prepared, null)
  const mode = document.querySelector<HTMLSelectElement>('select[aria-label="阅读位置"]')
  if (!mode) throw Error('missing mode')
  mode.value = 'sidebar'
  mode.dispatchEvent(new Event('change'))
  expect(document.querySelector('[data-id="h"] [aria-level="2"]')).not.toBeNull()
  expect(document.querySelector('ul li [data-id="l"]')).not.toBeNull()
  const rows = document.querySelectorAll('.guide-table tr')
  expect(rows).toHaveLength(2)
  expect(rows[0]?.querySelectorAll('th')).toHaveLength(2)
  expect(rows[1]?.querySelectorAll('td')).toHaveLength(2)
  expect(rows[1]?.querySelectorAll('td')[1]?.textContent).toContain('Permanent bonus.')
})

it('原文旁工作区只挂载当前段，目录与异常跳转不发翻译请求', () => {
  const { v, h } = mount()
  const blocks: GuideDocument['blocks'] = [
    { id: 'h', kind: 'heading', text: 'Chapter' },
    ...Array.from({ length: 99 }, (_, i) => ({
      id: `p${i}`,
      kind: 'paragraph' as const,
      text: `Paragraph ${i}.`,
    })),
  ]
  v.showDocument(
    { ...doc, blocks, stages: [] },
    blocks.map((b) => prepareBlock(b, matcher)),
    null,
  )
  expect(document.querySelectorAll('.guide-blocks .block')).toHaveLength(1)
  v.setBlockState('p20', 'missing', '没有返回这一段，可单独重试')
  v.setTranslation('p30', '合格译文', 'engine', [])
  v.setPageState('p30', { state: 'sidebar', message: '表格需在侧栏阅读' })
  expect(document.querySelector('.guide-placement')?.textContent).toContain('仅侧栏 1')
  const missing = document.querySelector<HTMLButtonElement>('.guide-exceptions [data-target="p20"]')
  expect(missing?.textContent).toContain('没有返回')
  missing?.click()
  expect(document.querySelector('.guide-blocks .block')?.getAttribute('data-id')).toBe('p20')
  expect(h.onLocate).toHaveBeenCalledWith('p20')
  expect(h.onBegin).not.toHaveBeenCalled()
  document.querySelector<HTMLButtonElement>('.retry-block')?.click()
  expect(h.onRetryBlock).toHaveBeenCalledWith('p20')
  v.setTranslation('p20', '已完成', 'engine', [])
  expect(document.querySelector('.guide-exceptions [data-target="p20"]')).toBeNull()
  v.setPageState('p30', { state: 'located', message: '已定位原文' })
  expect(document.querySelector('.guide-placement')?.textContent).toContain('仅侧栏 1')
})
it('完成状态禁用主操作且用量位于工具区，确认可 Esc 取消并返回焦点', async () => {
  const { v } = mount()
  v.setReady(true)
  v.setProgress({ selected: 1, completed: 1, failed: 0, preserved: 0, characters: 20 })
  const begin = document.querySelector<HTMLButtonElement>('.guide-begin')
  expect(begin?.disabled).toBe(true)
  expect(begin?.textContent).toBe('翻译完成')
  v.setUsage('预计用量')
  expect(document.querySelector('.guide-header .guide-usage')?.textContent).toBe('预计用量')
  const focus = document.querySelector<HTMLSelectElement>('select[aria-label="阅读位置"]')
  focus?.focus()
  const answer = v.ask('确认', '继续')
  document
    .querySelector('.guide-ask')
    ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await expect(answer).resolves.toBe(false)
  expect(document.activeElement).toBe(focus)
})
