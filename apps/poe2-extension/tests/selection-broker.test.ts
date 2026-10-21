import { describe, expect, it, vi } from 'vitest'
import { createSelectionBroker, type SelectionPort } from '../src/background/broker'
import { REQUEST_TIMEOUT_MS, SELECTION_PORT } from '../src/selection/protocol'

function fixture() {
  let grant: string | null = 'doc1'
  const run = vi.fn(async (_block, _signal) => ({
    ok: true as const,
    text: '译文',
    origin: 'engine' as const,
    issues: [],
    usage: '',
  }))
  const deps = {
    extensionId: 'own',
    popupUrl: 'chrome-extension://own/popup.html',
    getGrant: async (_id: number) => grant,
    setGrant: async (_id: number, value: string | null) => {
      grant = value
    },
    probe: async (_id: number) => ({ documentId: 'doc1', url: 'https://example.com/a' }),
    inject: vi.fn(async (_id: number, _documentId: string) => {}),
    disable: vi.fn(async (_id: number, _documentId: string) => {}),
    run,
  }
  const broker = createSelectionBroker(deps)
  function port(
    sender: SelectionPort['sender'] = {
      id: 'own',
      tab: { id: 2 },
      frameId: 0,
      documentId: 'doc1',
      url: 'https://example.com/a',
    },
  ) {
    const messages: ((message: unknown) => void)[] = [],
      closes: (() => void)[] = []
    const p: SelectionPort = {
      name: SELECTION_PORT,
      sender,
      postMessage: vi.fn(),
      disconnect: vi.fn(() =>
        closes.forEach((f) => {
          f()
        }),
      ),
      onMessage: { addListener: (f) => messages.push(f) },
      onDisconnect: { addListener: (f) => closes.push(f) },
    }
    broker.connect(p)
    return {
      p,
      start: () =>
        messages.forEach((f) => {
          f({
            type: 'translate',
            id: 'r1',
            block: { id: 'b0', kind: 'paragraph', text: 'Only my selected text.' },
          })
        }),
      cancel: () =>
        messages.forEach((f) => {
          f({ type: 'cancel' })
        }),
    }
  }
  return { broker, port, deps, run }
}

describe('独立后台的授权与生命周期', () => {
  it('只准本扩展弹窗激活；页面或跨扩展消息不能取得授权', async () => {
    const { broker, deps } = fixture()
    for (const sender of [
      {},
      { id: 'other', url: deps.popupUrl },
      { id: 'own', url: deps.popupUrl, tab: { id: 2 } },
      { id: 'own', url: 'https://example.com/' },
    ])
      expect((await broker.control({ type: 'selection-enable', tabId: 2 }, sender)).ok).toBe(false)
    expect(deps.inject).not.toHaveBeenCalled()
    expect(
      await broker.control(
        { type: 'selection-enable', tabId: 2 },
        { id: 'own', url: deps.popupUrl },
      ),
    ).toEqual({ ok: true, enabled: true })
    expect(deps.inject).toHaveBeenCalledWith(2, 'doc1')
  })
  it('拒绝未授权文档、其他扩展、子 frame；不读取服务或发请求', async () => {
    const { port, run } = fixture()
    for (const change of [
      { documentId: 'old' },
      { id: 'other' },
      { frameId: 1 },
      { url: 'file:///tmp/a' },
    ]) {
      const p = port({
        id: 'own',
        tab: { id: 2 },
        frameId: 0,
        documentId: 'doc1',
        url: 'https://example.com/a',
        ...change,
      })
      p.start()
      await vi.waitFor(() => expect(p.p.disconnect).toHaveBeenCalled())
    }
    expect(run).not.toHaveBeenCalled()
  })
  it('一条连接最多一次请求，结束后断开且不自动重试', async () => {
    const { port, run } = fixture()
    const p = port()
    p.start()
    p.start()
    await vi.waitFor(() => expect(p.p.disconnect).toHaveBeenCalled())
    expect(run).toHaveBeenCalledTimes(1)
    expect(p.p.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'result',
        id: 'r1',
        result: expect.objectContaining({ ok: true }),
      }),
    )
  })
  it('关闭、禁用与导航断连中止请求；晚到结果不回写', async () => {
    const { port, run, broker, deps } = fixture()
    let release!: () => void
    run.mockImplementation(async (_, signal) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      expect(signal.aborted).toBe(true)
      return { ok: true, text: '旧结果', origin: 'engine', issues: [], usage: '' }
    })
    const p = port()
    p.start()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await broker.control({ type: 'selection-disable', tabId: 2 }, { id: 'own', url: deps.popupUrl })
    release()
    await Promise.resolve()
    expect(p.p.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'result' }))
  })
  it('授权读取尚未返回时页面离开，旧授权晚到也不能发请求', async () => {
    const { deps, broker, port, run } = fixture()
    let release!: (value: string) => void
    deps.getGrant = async () =>
      new Promise((resolve) => {
        release = resolve
      })
    const p = port()
    p.start()
    await broker.removed(2)
    release('doc1')
    await vi.waitFor(() => expect(p.p.disconnect).toHaveBeenCalled())
    expect(run).not.toHaveBeenCalled()
  })
  it('有明确截止时间，不靠无限保活，超时不重试', async () => {
    vi.useFakeTimers()
    try {
      const { port, run } = fixture()
      run.mockImplementation(
        async (_, signal) =>
          new Promise((resolve) =>
            signal.addEventListener('abort', () =>
              resolve({ ok: true, text: 'late', origin: 'engine', issues: [], usage: '' }),
            ),
          ),
      )
      const p = port()
      p.start()
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
      expect(run).toHaveBeenCalledTimes(1)
      expect(p.p.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          result: { ok: false, message: '翻译超时，请手动重试。' },
        }),
      )
      expect(p.p.disconnect).toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
