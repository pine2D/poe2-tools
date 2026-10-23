import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS } from '../src/guide/prefs'
import { setupGuideButton } from '../src/popup/guide-button'

const html =
  '<button id="translate" hidden>翻译此页</button><p id="translate-error" role="status" hidden></p><details id="guide-notice" hidden><summary>首次使用说明</summary>新功能</details>'
const api = (over = {}) => ({
  activeTab: vi.fn(async () => ({ id: 7 })),
  openGuide: vi.fn(async () => true),
  readGuidePrefs: vi.fn(async () => DEFAULT_PREFS),
  writeGuidePrefs: vi.fn(async () => {}),
  version: () => '0.5.0',
  ...over,
})
afterEach(() => {
  document.body.textContent = ''
})

describe('setupGuideButton', () => {
  it('有活动标签页时显示按钮；点击时同步调用 openGuide（保留用户手势）并关闭弹窗', async () => {
    document.body.innerHTML = html
    const a = api()
    const close = vi.fn()
    await setupGuideButton(document, a, close)
    const button = document.querySelector<HTMLButtonElement>('#translate')
    expect(button?.hidden).toBe(false)
    button?.click()
    expect(a.openGuide).toHaveBeenCalledWith(7) // 同一调用栈内，不经 await
    await vi.waitFor(() => expect(close).toHaveBeenCalled())
  })
  it('打不开侧边栏时按钮保持原文，错误另起一行；有侧栏接口只说打不开，可重试', async () => {
    document.body.innerHTML = html
    const close = vi.fn()
    const a = api({ openGuide: vi.fn(async () => false), hasSidePanel: () => true })
    await setupGuideButton(document, a, close)
    const button = document.querySelector<HTMLButtonElement>('#translate')
    button?.click()
    const error = document.querySelector<HTMLElement>('#translate-error')
    await vi.waitFor(() => expect(error?.hidden).toBe(false))
    expect(button?.textContent).toBe('翻译此页')
    expect(error?.textContent).toBe('这次没能打开侧边栏，可以再试一次。')
    expect(button?.hasAttribute('aria-disabled')).toBe(false)
    expect(close).not.toHaveBeenCalled()
    button?.click()
    expect(a.openGuide).toHaveBeenCalledTimes(2)
  })
  it('只有浏览器没有侧栏接口时才提示更新 Chrome', async () => {
    document.body.innerHTML = html
    const a = api({ openGuide: vi.fn(async () => false), hasSidePanel: () => false })
    await setupGuideButton(document, a, vi.fn())
    document.querySelector<HTMLButtonElement>('#translate')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('#translate-error')?.textContent).toBe(
        '无法打开侧边栏，请更新 Chrome',
      ),
    )
  })
  it('请求期间用 aria-disabled 保留焦点并忽略重复点击', async () => {
    document.body.innerHTML = html
    const a = api({ openGuide: vi.fn(() => new Promise<boolean>(() => {})) })
    await setupGuideButton(document, a, vi.fn())
    const button = document.querySelector<HTMLButtonElement>('#translate')
    button?.focus()
    button?.click()
    button?.click()
    expect(a.openGuide).toHaveBeenCalledTimes(1)
    expect(button?.disabled).toBe(false)
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button)
  })
  it('about:blank、chrome:// 等非 http(s) 页面不显示“翻译此页”', async () => {
    for (const url of [
      undefined,
      'about:blank',
      'chrome://extensions',
      'chrome-extension://abc/guide.html',
    ]) {
      document.body.innerHTML = html
      await setupGuideButton(document, api({ activeUrl: vi.fn(async () => url) }), vi.fn())
      expect(document.querySelector<HTMLButtonElement>('#translate')?.hidden, String(url)).toBe(
        true,
      )
    }
    document.body.innerHTML = html
    await setupGuideButton(
      document,
      api({ activeUrl: vi.fn(async () => 'https://example.com/guide') }),
      vi.fn(),
    )
    expect(document.querySelector<HTMLButtonElement>('#translate')?.hidden).toBe(false)
  })
  it('没有活动标签页时按钮保持隐藏', async () => {
    document.body.innerHTML = html
    await setupGuideButton(document, api({ activeTab: vi.fn(async () => null) }), vi.fn())
    expect(document.querySelector<HTMLButtonElement>('#translate')?.hidden).toBe(true)
  })
  it('一次性说明：只显示不写入；展开说明后记录一次，版本相同则不再显示', async () => {
    document.body.innerHTML = html
    const a = api()
    await setupGuideButton(document, a, vi.fn())
    const notice = document.querySelector<HTMLDetailsElement>('#guide-notice')
    expect(notice?.hidden).toBe(false)
    expect(a.writeGuidePrefs).not.toHaveBeenCalled()
    notice?.dispatchEvent(new Event('toggle'))
    expect(a.writeGuidePrefs).not.toHaveBeenCalled() // 未展开不算
    if (notice) notice.open = true
    notice?.dispatchEvent(new Event('toggle'))
    notice?.dispatchEvent(new Event('toggle'))
    await vi.waitFor(() => expect(a.writeGuidePrefs).toHaveBeenCalledTimes(1))
    expect(a.writeGuidePrefs).toHaveBeenCalledWith({ ...DEFAULT_PREFS, noticeVersion: '0.5.0' })
    document.body.innerHTML = html
    const seen = api({
      readGuidePrefs: vi.fn(async () => ({ ...DEFAULT_PREFS, noticeVersion: '0.5.0' })),
    })
    await setupGuideButton(document, seen, vi.fn())
    expect(document.querySelector<HTMLElement>('#guide-notice')?.hidden).toBe(true)
  })
  it('点击“翻译此页”也算看过说明', async () => {
    document.body.innerHTML = html
    const a = api()
    await setupGuideButton(document, a, vi.fn())
    document.querySelector<HTMLButtonElement>('#translate')?.click()
    await vi.waitFor(() => expect(a.writeGuidePrefs).toHaveBeenCalledTimes(1))
  })
  it('页面缺少按钮时什么也不做', async () => {
    const a = api()
    await expect(setupGuideButton(document, a, vi.fn())).resolves.toBeUndefined()
    expect(a.activeTab).not.toHaveBeenCalled()
  })
})
