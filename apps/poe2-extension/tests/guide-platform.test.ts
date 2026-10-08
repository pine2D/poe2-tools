import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_PREFS } from '../src/guide/prefs'
import { guidePlatform } from '../src/popup/guide-platform'

const fakeChrome = {
  sidePanel: { setOptions: vi.fn(), open: vi.fn() },
  storage: { local: { get: vi.fn(), set: vi.fn() } },
}
beforeEach(() => {
  vi.stubGlobal('chrome', fakeChrome)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('openGuide：先发 setOptions 再发 open，两者都在同一调用栈发出', async () => {
  fakeChrome.sidePanel.setOptions.mockResolvedValue(undefined)
  fakeChrome.sidePanel.open.mockResolvedValue(undefined)
  const pending = guidePlatform.openGuide(5)
  expect(fakeChrome.sidePanel.setOptions).toHaveBeenCalledWith({
    tabId: 5,
    path: 'guide.html?tab=5',
    enabled: true,
  })
  expect(fakeChrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 5 })
  expect(fakeChrome.sidePanel.setOptions.mock.invocationCallOrder[0]).toBeLessThan(
    fakeChrome.sidePanel.open.mock.invocationCallOrder[0] ?? 0,
  )
  await expect(pending).resolves.toBe(true)
  fakeChrome.sidePanel.open.mockRejectedValueOnce(new Error('No user gesture'))
  await expect(guidePlatform.openGuide(5)).resolves.toBe(false)
})

it('openGuide：没有 sidePanel（旧版 Chrome）时返回 false', async () => {
  vi.stubGlobal('chrome', { storage: fakeChrome.storage })
  await expect(guidePlatform.openGuide(5)).resolves.toBe(false)
})

it('偏好读写只用 storage.local 的 guide 键，非法值回到默认', async () => {
  fakeChrome.storage.local.get.mockResolvedValue({
    guide: { charLimit: -1, noticeVersion: '0.5.0' },
  })
  await expect(guidePlatform.readGuidePrefs()).resolves.toEqual({
    ...DEFAULT_PREFS,
    noticeVersion: '0.5.0',
  })
  expect(fakeChrome.storage.local.get).toHaveBeenCalledWith('guide')
  fakeChrome.storage.local.set.mockResolvedValue(undefined)
  await guidePlatform.writeGuidePrefs(DEFAULT_PREFS)
  expect(fakeChrome.storage.local.set).toHaveBeenCalledWith({ guide: DEFAULT_PREFS })
})
