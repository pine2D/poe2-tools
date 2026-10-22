import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS } from '../src/guide/prefs'
import { setupGuideButton } from '../src/popup/guide-button'

const html = '<button id="translate" hidden>翻译此页</button><p id="guide-notice" hidden>新功能</p>'
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
  it('打不开侧边栏时提示，不关闭弹窗', async () => {
    document.body.innerHTML = html
    const close = vi.fn()
    await setupGuideButton(document, api({ openGuide: vi.fn(async () => false) }), close)
    document.querySelector<HTMLButtonElement>('#translate')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('#translate')?.textContent).toBe(
        '无法打开侧边栏，请更新 Chrome',
      ),
    )
    expect(close).not.toHaveBeenCalled()
  })
  it('没有活动标签页时按钮保持隐藏', async () => {
    document.body.innerHTML = html
    await setupGuideButton(document, api({ activeTab: vi.fn(async () => null) }), vi.fn())
    expect(document.querySelector<HTMLButtonElement>('#translate')?.hidden).toBe(true)
  })
  it('一次性说明：版本变化后显示一次并记录', async () => {
    document.body.innerHTML = html
    const a = api()
    await setupGuideButton(document, a, vi.fn())
    expect(document.querySelector<HTMLElement>('#guide-notice')?.hidden).toBe(false)
    expect(a.writeGuidePrefs).toHaveBeenCalledWith({ ...DEFAULT_PREFS, noticeVersion: '0.5.0' })
    document.body.innerHTML = html
    const seen = api({
      readGuidePrefs: vi.fn(async () => ({ ...DEFAULT_PREFS, noticeVersion: '0.5.0' })),
    })
    await setupGuideButton(document, seen, vi.fn())
    expect(document.querySelector<HTMLElement>('#guide-notice')?.hidden).toBe(true)
  })
  it('页面缺少按钮时什么也不做', async () => {
    const a = api()
    await expect(setupGuideButton(document, a, vi.fn())).resolves.toBeUndefined()
    expect(a.activeTab).not.toHaveBeenCalled()
  })
})
