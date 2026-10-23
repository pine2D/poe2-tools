import { readFileSync } from 'node:fs'
import { createMatcher, type GuideDocument, prepareBlock } from '@poe2-tools/guide-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadingView, type ReadingHandlers } from '../src/guide/view-reading'

// 2026-10-23 v4 复盘第二批（阅读侧栏）的回归用例；编号对应复盘 findings。
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
  entries: [],
  abbreviations: [],
})
const doc = (blocks: GuideDocument['blocks'], title = 'Build X'): GuideDocument => ({
  version: 1,
  game: 'poe2',
  targetLocale: 'zh-CN',
  source: {
    url: 'https://example.com/guide',
    title,
    siteId: 'generic',
    extractedAt: 't',
    scope: 'full',
  },
  stages: [],
  blocks,
})
const chapters: GuideDocument['blocks'] = [
  { id: 'h1', kind: 'heading', text: 'First chapter' },
  { id: 'p1', kind: 'paragraph', text: 'First paragraph.' },
  { id: 'h2', kind: 'heading', text: 'Second chapter' },
  { id: 'p2', kind: 'paragraph', text: 'Second paragraph.' },
]
const mount = (blocks = chapters, h = handlers(), title?: string) => {
  const v = createReadingView(document, h, 'test')
  document.body.append(v.root)
  const guide = doc(blocks, title)
  v.showDocument(
    guide,
    blocks.map((b) => prepareBlock(b, matcher)),
    null,
  )
  return { v, h, guide }
}
const node = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}
const withCss = (run: () => void, hover = false) => {
  const style = document.createElement('style')
  style.textContent = [
    'packages/ui-theme/src/tokens.css',
    'packages/ui-theme/src/components/btn.css',
    'apps/poe2-extension/src/guide/guide.css',
  ]
    .map((file) => {
      const css = readFileSync(file, 'utf8')
      return hover ? css.replaceAll(':hover', '.test-hover') : css
    })
    .join('\n')
  document.head.append(style)
  try {
    run()
  } finally {
    style.remove()
  }
}
afterEach(() => {
  document.body.textContent = ''
})

describe('B2-01 章节勾选原地更新', () => {
  it('同一文档重新预览时不重建复选框，焦点与控件保持，第二次切换仍生效', () => {
    const h = handlers()
    const { v, guide } = mount(chapters, h)
    const prepared = chapters.map((b) => prepareBlock(b, matcher))
    // 模拟 controller：勾选变化后用同一文档对象重新 showDocument
    vi.mocked(h.onSelection).mockImplementation((ids) =>
      v.showDocument(
        guide,
        prepared.filter((b) => ids.includes(b.id)),
        null,
        ids,
      ),
    )
    const first = node<HTMLInputElement>('.chapter-check')
    first.focus()
    first.click()
    expect(h.onSelection).toHaveBeenLastCalledWith(['h2', 'p2'])
    expect(document.querySelector('.chapter-check')).toBe(first)
    expect(document.activeElement).toBe(first)
    expect(first.checked).toBe(false)
    first.click()
    expect(h.onSelection).toHaveBeenLastCalledWith(['h1', 'p1', 'h2', 'p2'])
    expect(first.checked).toBe(true)
    expect(document.activeElement).toBe(first)
  })
  it('全不选／全选连按保持按钮焦点，半选状态随选择同步', () => {
    const h = handlers()
    const { v, guide } = mount(chapters, h)
    const prepared = chapters.map((b) => prepareBlock(b, matcher))
    vi.mocked(h.onSelection).mockImplementation((ids) =>
      v.showDocument(
        guide,
        prepared.filter((b) => ids.includes(b.id)),
        null,
        ids,
      ),
    )
    const none = node<HTMLButtonElement>('.chapter-actions [data-action="none"]')
    none.focus()
    none.click()
    expect(document.activeElement).toBe(none)
    expect(
      [...document.querySelectorAll<HTMLInputElement>('.chapter-check')].map((c) => c.checked),
    ).toEqual([false, false])
    const all = node<HTMLButtonElement>('.chapter-actions [data-action="all"]')
    all.focus()
    all.click()
    expect(document.activeElement).toBe(all)
    // 只选一章的一部分时为半选
    v.showDocument(guide, prepared.slice(0, 1), null, ['h1'])
    const first = node<HTMLInputElement>('.chapter-check')
    expect(first.checked).toBe(false)
    expect(first.indeterminate).toBe(true)
  })
  it('换文档必须重建时按章节编号找回焦点', () => {
    const { v } = mount()
    const second = document.querySelectorAll<HTMLInputElement>('.chapter-check')[1]
    second?.focus()
    v.showDocument(
      doc(chapters),
      chapters.map((b) => prepareBlock(b, matcher)),
      null,
    )
    const rebuilt = document.querySelectorAll<HTMLInputElement>('.chapter-check')[1]
    expect(rebuilt).not.toBe(second)
    expect(document.activeElement).toBe(rebuilt)
  })
})

describe('B2-02 开始翻译与超限确认的焦点', () => {
  it('忙碌时焦点从开始移到停止，Escape 取消确认后回到开始按钮', async () => {
    const { v } = mount()
    v.setReady(true)
    const begin = node<HTMLButtonElement>('.guide-begin')
    begin.focus()
    v.setBusy(true)
    const stop = [...document.querySelectorAll<HTMLButtonElement>('.guide-taskbar button')].find(
      (b) => b.textContent === '停止',
    )
    expect(document.activeElement).toBe(stop)
    const answer = v.ask('超过上限', '继续翻译')
    node('.guide-ask').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await expect(answer).resolves.toBe(false)
    v.setBusy(false)
    expect(document.activeElement).toBe(begin)
  })
  it('完成后开始按钮禁用时，焦点交给重新读取而不是丢到 body', () => {
    const { v } = mount()
    v.setReady(true)
    node<HTMLButtonElement>('.guide-begin').focus()
    v.setBusy(true)
    v.setProgress({ selected: 1, completed: 1, failed: 0, preserved: 0, characters: 10 })
    v.setBusy(false)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('重新读取当前页')
  })
  it('焦点不在开始按钮时忙碌状态不抢焦点', () => {
    const { v } = mount()
    v.setReady(true)
    const check = node<HTMLInputElement>('.chapter-check')
    check.focus()
    v.setBusy(true)
    v.setBusy(false)
    expect(document.activeElement).toBe(check)
  })
})

describe('B2-03 读取范围选中态', () => {
  it('点击范围先同步选中态，读取失败后仍与将重新读取的范围一致', () => {
    const { h } = mount()
    node<HTMLButtonElement>('[data-scope="selection"]').click()
    expect(h.onScope).toHaveBeenCalledWith('selection')
    expect(node('[data-scope="selection"]').getAttribute('aria-pressed')).toBe('true')
    expect(node('[data-scope="full"]').getAttribute('aria-pressed')).toBe('false')
  })
})

describe('B2-08 发送摘要', () => {
  it('开始翻译旁显示段数、字符与目标主机；忙碌或没有可发送段时隐藏', () => {
    const { v } = mount()
    v.setReady(true)
    v.setProgress({ selected: 4, completed: 0, failed: 0, preserved: 1, characters: 60 })
    v.setSendSummary?.({ blocks: 3, chars: 57, host: 'api.example.com', preserved: 1 })
    const summary = node('.guide-send-summary')
    expect(summary.hidden).toBe(false)
    expect(summary.textContent).toBe(
      '点击后发送 3 段到 api.example.com，正文和原文语境约 57 字符。另有 1 段原样保留，不发送。',
    )
    expect(summary.closest('.guide-header')).not.toBeNull()
    v.setBusy(true)
    expect(summary.hidden).toBe(true)
    v.setBusy(false)
    expect(summary.hidden).toBe(false)
    v.setSendSummary?.(null)
    expect(summary.hidden).toBe(true)
  })
})

describe('B2-12 禁用主操作写明原因', () => {
  it('恢复原文后不再显示可点的“重试失败段”，改为先重新读取，底色为中性', () => {
    const { v } = mount()
    v.setReady(true)
    v.setProgress({ selected: 2, completed: 1, failed: 1, preserved: 0, characters: 30 })
    const begin = node<HTMLButtonElement>('.guide-begin')
    expect(begin.textContent).toBe('重试失败段（1）')
    v.setReady(false)
    expect(begin.disabled).toBe(true)
    expect(begin.textContent).toBe('先重新读取')
    withCss(() => {
      const style = getComputedStyle(begin)
      expect(style.backgroundColor).toBe('#1e2124')
      expect(style.opacity).toBe('1')
    })
  })
})

describe('B2-09／B2-17 异常列表', () => {
  const many: GuideDocument['blocks'] = [
    { id: 'a', kind: 'paragraph', text: 'Alpha.' },
    { id: 'b', kind: 'paragraph', text: 'Beta.' },
    { id: 'c', kind: 'paragraph', text: 'Gamma.' },
    { id: 'd', kind: 'paragraph', text: 'Delta.' },
  ]
  it('失败排在最前并用危险色，待核对用玫红，位置说明为中性', () => {
    const { v } = mount(many)
    v.setTranslation('a', '甲', 'engine', [])
    v.setPageState('a', {
      state: 'sidebar',
      message: '此段没有可安全显示的原文位置，请在侧栏阅读。',
    })
    v.setTranslation('b', '乙', 'engine', [{ kind: 'term-missing', detail: '术语未出现' }])
    v.setBlockState('c', 'failed', '网络断开')
    const rows = [...document.querySelectorAll<HTMLElement>('.guide-exception')]
    expect(rows.map((r) => [r.dataset.target, r.dataset.kind])).toEqual([
      ['c', 'failed'],
      ['b', 'warning'],
      ['a', 'info'],
    ])
    withCss(() => {
      const color = (id: string) =>
        getComputedStyle(node(`.guide-exception[data-target="${id}"] strong`)).color
      expect(color('c')).toBe('#f3806f')
      expect(color('b')).toBe('#ef90b8')
      expect(color('a')).not.toBe(color('c'))
      expect(color('a')).not.toBe(color('b'))
      // 原文旁模式只挂载当前段，切到仅侧栏查看全部段落的核对提示
      node<HTMLButtonElement>('.reading-mode [data-mode="sidebar"]').click()
      expect(getComputedStyle(node('[data-id="b"] .issues summary')).color).toBe('#ef90b8')
    })
  })
  it('仅侧栏模式不在每段和异常列表重复“请在侧栏阅读”', () => {
    const { v } = mount(many)
    for (const id of ['a', 'b']) {
      v.setTranslation(id, '译文', 'engine', [])
      v.setPageState(id, {
        state: 'sidebar',
        message: '此段没有可安全显示的原文位置，请在侧栏阅读。',
      })
    }
    v.setBlockState('c', 'failed', '网络断开')
    node<HTMLButtonElement>('.reading-mode [data-mode="sidebar"]').click()
    expect(
      [...document.querySelectorAll<HTMLElement>('.guide-exception')].map((r) => r.dataset.target),
    ).toEqual(['c'])
    expect(document.querySelector('[data-id="a"] .block-notices .page-status')).toBeNull()
    node<HTMLButtonElement>('.reading-mode [data-mode="inline"]').click()
    expect(document.querySelectorAll('.guide-exception')).toHaveLength(3)
  })
})

describe('B2-13 目录父路径', () => {
  it('省略作为页面标题的根节点，只在重名时显示足以区分的父级', () => {
    mount(
      [
        { id: 'root', kind: 'heading', text: 'Build X', context: { headingLevel: 1 } },
        { id: 'act1', kind: 'heading', text: 'Act 1', context: { headingLevel: 2 } },
        { id: 'gear1', kind: 'heading', text: 'Gear', context: { headingLevel: 3 } },
        { id: 'act2', kind: 'heading', text: 'Act 2', context: { headingLevel: 2 } },
        { id: 'gear2', kind: 'heading', text: 'Gear', context: { headingLevel: 3 } },
        { id: 'tips', kind: 'heading', text: 'Tips', context: { headingLevel: 3 } },
      ],
      handlers(),
      'Build X',
    )
    const context = (id: string) => {
      const small = node(`.guide-directory-link[data-target="${id}"] .directory-context`)
      return small.hidden ? null : small.textContent
    }
    expect(context('act1')).toBeNull()
    expect(context('tips')).toBeNull()
    expect(context('gear1')).toBe('Act 1')
    expect(context('gear2')).toBe('Act 2')
  })
})

describe('P3 精修', () => {
  it('B2-16 计数行分隔符在片段之外，不随 inline-block 折叠', () => {
    mount()
    const placement = node('.guide-placement')
    expect(placement.textContent).toBe('原文旁 0 · 仅侧栏 0')
    for (const span of placement.querySelectorAll('span'))
      expect(span.textContent?.startsWith(' ')).toBe(false)
  })
  it('B2-19 截两行的来源标题带完整 title', () => {
    mount(chapters, handlers(), 'A very long guide title that will wrap')
    expect(node('.guide-title').title).toBe('A very long guide title that will wrap')
  })
  it('B2-14 悬停已选分段保留选中底；B2-15 目录与异常项不继承粗体', () => {
    const { v } = mount()
    v.setBlockState('p1', 'failed', '网络断开')
    withCss(() => {
      const pressed = node<HTMLButtonElement>('.reading-mode [data-mode="inline"]')
      // happy-dom 不解析含变量的渐变与阴影，用选中态独有的标签色核对级联
      expect(getComputedStyle(pressed).color).toBe('#fff8e1')
      pressed.classList.add('test-hover')
      expect(getComputedStyle(pressed).color).toBe('#fff8e1')
      expect(getComputedStyle(node('.guide-directory-link')).fontWeight).toBe('400')
      expect(getComputedStyle(node('.guide-exception')).fontWeight).toBe('400')
    }, true)
  })
  it('B2-22 强制色彩下透明分段与展开按钮有边界', () => {
    const css = readFileSync('apps/poe2-extension/src/guide/guide.css', 'utf8')
    const forced = css.slice(css.indexOf('@media (forced-colors: active)'))
    expect(forced).toMatch(
      /\.reading-mode button,\s*\.scope-choices button,\s*\.guide-controlbar > button \{\s*border: 1px solid ButtonText;/,
    )
  })
})
