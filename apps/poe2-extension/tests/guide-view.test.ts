import { createMatcher, type GuideDocument, prepareBlock } from '@poe2-tools/guide-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReadingView, type ReadingHandlers } from '../src/guide/view-reading'

const handlers = (): ReadingHandlers => ({
  onStage: vi.fn(),
  onRetryBlock: vi.fn(),
  onStop: vi.fn(),
  onReload: vi.fn(),
  onSettings: vi.fn(),
  onFullPage: vi.fn(),
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
    mount()
    const term = document.querySelector('.term')
    expect(term?.textContent).toBe('Contagion')
    expect(term?.getAttribute('title')).toContain('瘟疫')
    expect(term?.getAttribute('tabindex')).toBe('0')
    expect(document.querySelector('abbr')?.getAttribute('title')).toBe('Energy Shield，能量护盾')
    expect(document.querySelector('img')).toBeNull()
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
    expect(site()).toBe('mobalytics.gg · 通用提取，仅支持 PoE2 术语 · 站点可能改版，可检查扩展更新')
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
