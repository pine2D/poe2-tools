import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { platform } from '../src/platform'
import { PAGE_STATE_TYPE } from '../src/protocol'

const request = { type: PAGE_STATE_TYPE, v: 1 } as const
const fakeChrome = {
  runtime: { onMessage: { addListener: vi.fn() } },
  tabs: { query: vi.fn(), sendMessage: vi.fn(), reload: vi.fn() },
}
beforeEach(() => {
  vi.stubGlobal('chrome', fakeChrome)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('activeTab：只取当前窗口活动标签页的 id 与是否加载中；没有或 id 无效时为 null', async () => {
  fakeChrome.tabs.query.mockResolvedValueOnce([{ id: 7, status: 'loading' }])
  await expect(platform.activeTab()).resolves.toEqual({ id: 7, loading: true })
  expect(fakeChrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true })
  fakeChrome.tabs.query.mockResolvedValueOnce([{ id: 8, status: 'complete' }])
  await expect(platform.activeTab()).resolves.toEqual({ id: 8, loading: false })
  for (const tabs of [[], [{ status: 'complete' }], [{ id: -1, status: 'complete' }]]) {
    fakeChrome.tabs.query.mockResolvedValueOnce(tabs)
    await expect(platform.activeTab()).resolves.toBeNull()
  }
})

it('ask：只发给顶层框架；应答原样返回，undefined 记为无应答', async () => {
  fakeChrome.tabs.sendMessage.mockResolvedValueOnce({ v: 1 })
  await expect(platform.ask(7, request, 1000)).resolves.toEqual({ v: 1 })
  expect(fakeChrome.tabs.sendMessage).toHaveBeenCalledWith(7, request, { frameId: 0 })
  fakeChrome.tabs.sendMessage.mockResolvedValueOnce(undefined)
  await expect(platform.ask(7, request, 1000)).resolves.toBeNull()
})

it('ask：没有接收端（reject）或同步抛错都记为无应答，不抛出', async () => {
  fakeChrome.tabs.sendMessage.mockRejectedValueOnce(
    new Error('Could not establish connection. Receiving end does not exist.'),
  )
  await expect(platform.ask(7, request, 1000)).resolves.toBeNull()
  fakeChrome.tabs.sendMessage.mockImplementationOnce(() => {
    throw new Error('No tab with id: 7.')
  })
  await expect(platform.ask(7, request, 1000)).resolves.toBeNull()
})

it('ask：超时记为无应答', async () => {
  vi.useFakeTimers()
  fakeChrome.tabs.sendMessage.mockReturnValueOnce(new Promise(() => {}))
  let settled = false
  const answer = platform.ask(7, request, 1000)
  void answer.then(() => {
    settled = true
  })
  await vi.advanceTimersByTimeAsync(999)
  expect(settled).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await expect(answer).resolves.toBeNull()
})

it('reload：刷新指定标签页', async () => {
  fakeChrome.tabs.reload.mockResolvedValueOnce(undefined)
  await platform.reload(7)
  expect(fakeChrome.tabs.reload).toHaveBeenCalledExactlyOnceWith(7)
})

it('answer：类型相符时同步回快照；不符时不应答并返回 false', () => {
  const snapshot = vi.fn(() => ({ v: 1 }))
  platform.answer(PAGE_STATE_TYPE, snapshot)
  const listener = fakeChrome.runtime.onMessage.addListener.mock.calls[0]?.[0]
  const sendResponse = vi.fn()
  expect(listener({ type: 'other' }, {}, sendResponse)).toBe(false)
  expect(listener(null, {}, sendResponse)).toBe(false)
  expect(listener('poe2-l10n/page-state', {}, sendResponse)).toBe(false)
  expect(sendResponse).not.toHaveBeenCalled()
  expect(snapshot).not.toHaveBeenCalled()
  listener(request, {}, sendResponse)
  expect(sendResponse).toHaveBeenCalledExactlyOnceWith({ v: 1 })
})
