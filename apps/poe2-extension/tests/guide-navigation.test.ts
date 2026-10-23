import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guideChrome } from '../src/guide/chrome'
import { DEFAULT_PREFS } from '../src/guide/prefs'

vi.mock('../src/guide/chrome', () => ({
  guideChrome: {
    tabId: () => 1,
    readPrefs: vi.fn(),
    writePrefs: vi.fn(async () => {}),
    extract: vi.fn(),
    cancelPicker: vi.fn(async () => {}),
    resource: (path: string) => path,
    version: () => 'test',
    mode: vi.fn(async () => {}),
  },
}))
vi.mock('../src/guide/store/idb', async () => {
  const { createMemoryStore } = await import('../src/guide/store/memory')
  return { createIdbStore: () => createMemoryStore({ capacityBytes: 1e7, now: Date.now }) }
})

const source = () => ({
  ok: true,
  doc: {
    version: 1,
    game: 'poe2',
    targetLocale: 'zh-CN',
    source: {
      url: 'https://example.com/guide',
      title: 'Guide',
      siteId: 'generic',
      extractedAt: 't',
      scope: 'full',
    },
    stages: [],
    blocks: [
      { id: 'first', kind: 'heading', text: 'First chapter' },
      { id: 'middle', kind: 'heading', text: 'Defensive choices' },
      { id: 'last', kind: 'paragraph', text: 'Read the instructions before moving on.' },
    ],
  },
})
const node = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}
let middleTop: number

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', {})
  vi.mocked(guideChrome.readPrefs).mockResolvedValue({ ...DEFAULT_PREFS, introSeen: true })
  vi.mocked(guideChrome.extract).mockResolvedValue(source())
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => {
      if (path === 'assets/guide-stats.json')
        return Response.json({ terms: [], hash: 'stats', ruleVersion: 'test' })
      if (path === 'assets/guide-dictionary.json')
        return Response.json({
          schemaVersion: 1,
          locale: 'zh-CN',
          hash: 'dict',
          entries: [],
          abbreviations: [],
        })
      throw new Error(`unexpected request: ${path}`)
    }),
  )
  // happy-dom 不做排版，用文档坐标模拟长文及重新读取后的高度变化。
  middleTop = 4600
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('guide-header')) return new DOMRect(0, 0, 360, 100)
    const top = this.dataset.id === 'first' ? 300 : this.dataset.id === 'middle' ? middleTop : 6000
    return new DOMRect(0, top - window.scrollY, 360, 400)
  })
  window.scrollTo(0, 0)
  document.body.innerHTML = '<main id="app"></main>'
  await import('../src/guide/index')
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(1))
  node<HTMLButtonElement>('[data-mode="sidebar"]').click()
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(3))
})
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function openSettings() {
  window.scrollTo(0, 4500)
  const trigger = node<HTMLButtonElement>('[aria-label="设置翻译服务"]')
  trigger.focus({ preventScroll: true })
  trigger.click()
  await vi.waitFor(() => expect(node('.guide-settings').hidden).toBe(false))
  // 浏览器隐藏长阅读区后会收缩页面；模拟设置页面处于顶部。
  window.scrollTo(0, 0)
}

describe('设置往返的阅读位置', () => {
  it('无编辑返回保留正文位置，同时恢复设置入口焦点', async () => {
    await openSettings()
    node<HTMLButtonElement>('.settings-back').click()
    expect(node('.guide').hidden).toBe(false)
    expect(window.scrollY).toBe(4500)
    expect(document.activeElement).toBe(node('[aria-label="设置翻译服务"]'))
  })

  it('保存服务重新读取后，按原段落恢复位置而非旧页面像素', async () => {
    await openSettings()
    middleTop = 4800
    node<HTMLInputElement>('[name="apiKey"]').value = 'local-test-only'
    node<HTMLButtonElement>('.save').click()
    await vi.waitFor(() => expect(node('.guide-settings').hidden).toBe(true))
    expect(window.scrollY).toBe(4700)
    expect(node('[data-id="middle"]').getBoundingClientRect().top).toBe(100)
    expect(document.activeElement).toBe(node('[aria-label="设置翻译服务"]'))
  })

  it('保存期间已换文章时，不把新文章滚到旧段落位置', async () => {
    await openSettings()
    const changed = source()
    changed.doc.source.url = 'https://example.com/another-guide'
    vi.mocked(guideChrome.extract).mockResolvedValue(changed)
    node<HTMLInputElement>('[name="apiKey"]').value = 'local-test-only'
    node<HTMLButtonElement>('.save').click()
    await vi.waitFor(() => expect(node('.guide-settings').hidden).toBe(true))
    expect(window.scrollY).toBe(0)
  })
})

it('保存服务往返实际控件保留章节勾选', async () => {
  const first = node<HTMLInputElement>('.chapter-check')
  first.checked = false
  first.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(2))
  await openSettings()
  node<HTMLInputElement>('[name="apiKey"]').value = 'local-test-only'
  node<HTMLButtonElement>('.save').click()
  await vi.waitFor(() => expect(node('.guide-settings').hidden).toBe(true))
  expect(
    [...document.querySelectorAll<HTMLInputElement>('.chapter-check')].map((c) => c.checked),
  ).toEqual([false, true])
  expect([...document.querySelectorAll<HTMLElement>('.block')].map((b) => b.dataset.id)).toEqual([
    'middle',
    'last',
  ])
})

it('全不选显示选择提示，重新勾选后恢复开始入口', async () => {
  const clear = [...document.querySelectorAll<HTMLButtonElement>('.chapter-actions button')].find(
    (b) => b.textContent === '全不选',
  )
  if (!clear) throw new Error('missing clear selection')
  clear.click()
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(0))
  await vi.waitFor(() => expect(node('.guide').getAttribute('aria-busy')).toBe('false'))
  expect(node<HTMLButtonElement>('.guide-begin').disabled).toBe(true)
  expect(node('.guide-begin').textContent).toBe('先选择章节')
  expect(node('.guide-progress').textContent).toBe('尚未选择正文')
  const first = node<HTMLInputElement>('.chapter-check')
  first.checked = true
  first.dispatchEvent(new Event('change'))
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(1))
  await vi.waitFor(() => expect(node('.guide').getAttribute('aria-busy')).toBe('false'))
  expect(node('.guide-begin').textContent).toBe('开始翻译')
  expect(node('.guide-progress').textContent).toContain('0 / 1')
})

it('章节复选框键盘连按两次：真实预览不重建控件，焦点与状态都留在原处', async () => {
  const first = node<HTMLInputElement>('.chapter-check')
  first.focus()
  first.click()
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(2))
  await vi.waitFor(() => expect(node('.guide').getAttribute('aria-busy')).toBe('false'))
  expect(node('.chapter-check')).toBe(first)
  expect(document.activeElement).toBe(first)
  first.click()
  await vi.waitFor(() => expect(document.querySelectorAll('.block')).toHaveLength(3))
  await vi.waitFor(() => expect(node('.guide').getAttribute('aria-busy')).toBe('false'))
  expect(first.checked).toBe(true)
  expect(document.activeElement).toBe(first)
})

it('无选区读取失败后，选中态与“重新读取”使用同一范围', async () => {
  vi.mocked(guideChrome.extract).mockImplementation(async (_tab, scope) =>
    scope === 'selection' ? { ok: false, reason: 'empty' } : source(),
  )
  node<HTMLButtonElement>('[data-scope="selection"]').click()
  await vi.waitFor(() => expect(node('.guide-banner').textContent).toContain('没有读到'))
  expect(node('[data-scope="selection"]').getAttribute('aria-pressed')).toBe('true')
  expect(node('[data-scope="full"]').getAttribute('aria-pressed')).toBe('false')
  node<HTMLButtonElement>('[aria-label="重新读取当前页"]').click()
  await vi.waitFor(() => expect(guideChrome.extract).toHaveBeenLastCalledWith(1, 'selection'))
})
