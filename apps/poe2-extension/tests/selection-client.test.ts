import { afterEach, expect, it, vi } from 'vitest'
import { setupSelectionButton } from '../src/popup/selection-button'
import { requestSelection } from '../src/selection/client'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
it('后台断开显示错误，不自动建立第二个请求；消息不含 Key 或网页地址', async () => {
  let disconnected = () => {}
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: {
      addListener: (f: () => void) => {
        disconnected = f
      },
    },
  }
  const connect = vi.fn(() => port)
  vi.stubGlobal('chrome', { runtime: { connect } })
  const result = requestSelection(
    { id: 'b0', kind: 'paragraph', text: 'Public selected text.' },
    new AbortController().signal,
  )
  disconnected()
  expect(await result).toMatchObject({ ok: false, message: expect.stringContaining('连接中断') })
  expect(connect).toHaveBeenCalledTimes(1)
  const payload = port.postMessage.mock.calls[0]?.[0]
  expect(Object.keys(payload).sort()).toEqual(['block', 'id', 'type'])
})
it('主动取消发送取消消息并断开连接', async () => {
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  }
  vi.stubGlobal('chrome', { runtime: { connect: () => port } })
  const abort = new AbortController()
  const result = requestSelection(
    { id: 'b0', kind: 'paragraph', text: 'Public selected text.' },
    abort.signal,
  )
  abort.abort()
  expect(await result).toEqual({ ok: false, message: '已取消翻译。' })
  expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'cancel' })
  expect(port.disconnect).toHaveBeenCalledTimes(1)
})
it('弹窗只查询状态，用户点击后才启用；启用失败不关闭弹窗', async () => {
  document.body.innerHTML =
    '<button id="selection" hidden></button><p id="selection-notice" hidden></p>'
  const selection = vi.fn(async (_id: number, action: string) =>
    action === 'status' ? { ok: true, enabled: false } : { ok: false, message: '页面已关闭。' },
  )
  const close = vi.fn()
  await setupSelectionButton(document, { activeTab: async () => ({ id: 5 }), selection }, close)
  expect(selection).toHaveBeenCalledTimes(1)
  document.querySelector<HTMLButtonElement>('#selection')?.click()
  await vi.waitFor(() =>
    expect(document.querySelector('#selection-notice')?.textContent).toBe('页面已关闭。'),
  )
  expect(selection).toHaveBeenLastCalledWith(5, 'enable')
  expect(close).not.toHaveBeenCalled()
})
