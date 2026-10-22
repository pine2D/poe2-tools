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

it('同页多个气泡各占一个请求，全局最多四个；单独取消与整页禁用边界不同', async () => {
  const { port, run, broker, deps } = fixture()
  const signals: AbortSignal[] = []
  run.mockImplementation(async (_, signal) => {
    signals.push(signal)
    return new Promise((resolve) =>
      signal.addEventListener('abort', () =>
        resolve({ ok: true, text: 'late', origin: 'engine', issues: [], usage: '' }),
      ),
    )
  })
  const ports = Array.from({ length: 4 }, () => port())
  for (const p of ports) p.start()
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(4))
  expect(signals.every((s) => !s.aborted)).toBe(true)
  const fifth = port()
  fifth.start()
  await vi.waitFor(() =>
    expect(fifth.p.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ ok: false }) }),
    ),
  )
  expect(run).toHaveBeenCalledTimes(4)
  ports[1]?.cancel()
  expect(signals.map((s) => s.aborted)).toEqual([false, true, false, false])
  const otherTab = port({
    id: 'own',
    tab: { id: 3 },
    frameId: 0,
    documentId: 'doc1',
    url: 'https://example.com/b',
  })
  otherTab.start()
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(5))
  await broker.control({ type: 'selection-disable', tabId: 2 }, { id: 'own', url: deps.popupUrl })
  expect(signals.map((s) => s.aborted)).toEqual([true, true, true, true, false])
  otherTab.cancel()
})

describe('自动站点授权与临时关闭', () => {
  function automaticFixture() {
    const base = fixture()
    let grant: string | null = null,
      url: string | null = null,
      paused: string | null = null,
      allowed = true
    const deps = {
      ...base.deps,
      getGrant: async () => grant,
      setGrant: async (_id: number, id: string | null, auto?: string) => {
        grant = id
        url = auto ?? null
      },
      automatic: {
        allowed: vi.fn(async () => allowed),
        getUrl: async () => url,
        getPaused: async () => paused,
        setPaused: async (_id: number, id: string | null) => {
          paused = id
        },
      },
    }
    return {
      deps,
      broker: createSelectionBroker(deps),
      deny() {
        allowed = false
      },
      grant: () => grant,
    }
  }
  it('刷新自动注入无需弹窗、重复事件不销毁气泡，不发模型请求', async () => {
    const f = automaticFixture()
    await f.broker.automatic(2)
    await f.broker.automatic(2)
    expect(f.grant()).toBe('doc1')
    expect(f.deps.inject).toHaveBeenCalledTimes(1)
    expect(f.deps.run).not.toHaveBeenCalled()
  })
  it('关闭本页在当前文档保持，导航后按站点设置恢复', async () => {
    const f = automaticFixture()
    await f.broker.automatic(2)
    await f.broker.control(
      { type: 'selection-disable', tabId: 2 },
      { id: 'own', url: f.deps.popupUrl },
    )
    await f.broker.automatic(2)
    expect(f.grant()).toBeNull()
    expect(f.deps.inject).toHaveBeenCalledTimes(1)
    await f.broker.removed(2)
    f.deps.probe = async () => ({ documentId: 'doc2', url: 'https://example.com/a' })
    await f.broker.automatic(2)
    expect(f.deps.inject).toHaveBeenCalledTimes(2)
  })
  it('撤权/退出目录撤销自动授权并销毁气泡，后台恢复后仍重新检查权限', async () => {
    const f = automaticFixture()
    await f.broker.automatic(2)
    f.deny()
    await f.broker.automatic(2)
    expect(f.grant()).toBeNull()
    expect(f.deps.disable).toHaveBeenCalledWith(2, 'doc1')
    await createSelectionBroker(f.deps).automatic(2)
    expect(f.deps.inject).toHaveBeenCalledTimes(1)
  })
  it('撤权后 probe 失败仍可取消授权，通过消息清理原内容脚本', async () => {
    const f = automaticFixture()
    await f.broker.automatic(2)
    f.deps.probe = async () => {
      throw Error('no host permission')
    }
    await f.broker.automatic(2)
    expect(f.grant()).toBeNull()
    expect(f.deps.disable).toHaveBeenCalledWith(2, 'doc1')
  })
  it('导航加载取消后同一文档继续保持关闭，后台重建不清除暂停', async () => {
    const f = automaticFixture()
    await f.broker.automatic(2)
    await f.broker.control(
      { type: 'selection-disable', tabId: 2 },
      { id: 'own', url: f.deps.popupUrl },
    )
    await f.broker.removed(2)
    await createSelectionBroker(f.deps).automatic(2)
    expect(f.grant()).toBeNull()
    expect(f.deps.inject).toHaveBeenCalledTimes(1)
  })
  it('自动模式权限变化不取消手动启用的当前页', async () => {
    const f = automaticFixture()
    await f.broker.control(
      { type: 'selection-enable', tabId: 2 },
      { id: 'own', url: f.deps.popupUrl },
    )
    f.deny()
    await f.broker.automatic(2)
    expect(f.grant()).toBe('doc1')
    expect(f.deps.disable).not.toHaveBeenCalled()
  })
})
