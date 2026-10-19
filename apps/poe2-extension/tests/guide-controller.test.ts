import type { ChatMessage, GuideDictionary } from '@poe2-tools/guide-core'
import { describe, expect, it, vi } from 'vitest'
import { type ControllerDeps, createController, type EngineHandle } from '../src/guide/controller'
import { type ChunkResult, EngineError } from '../src/guide/engines/openai'
import { DEFAULT_PREFS } from '../src/guide/prefs'
import { createMemoryStore } from '../src/guide/store/memory'
import type { ReadingView } from '../src/guide/view-reading'

const dict: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h1',
  entries: [{ id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' }],
  abbreviations: [],
}
const longText = 'Spread Contagion across the whole pack of monsters quickly.'
const doc = (blocks: unknown[], stages: unknown[] = []) => ({
  ok: true,
  doc: {
    version: 1,
    game: 'poe2',
    targetLocale: 'zh-CN',
    source: {
      url: 'https://mobalytics.gg/poe-2/builds/x',
      title: 'X',
      siteId: 'mobalytics',
      extractedAt: 't',
      scope: 'full',
    },
    stages,
    blocks,
  },
})
const twoStages = doc(
  [
    { id: 'a', kind: 'paragraph', text: longText, stageId: 's1' },
    { id: 'm', kind: 'modline', text: '+80 to maximum Life', stageId: 's1' },
    { id: 'b', kind: 'paragraph', text: 'Endgame Contagion text here.', stageId: 's2' },
  ],
  [
    { id: 's1', name: 'L', current: true },
    { id: 's2', name: 'E', current: false },
  ],
)

function fakeView() {
  const calls: string[] = []
  const view = {
    root: document.createElement('main'),
    showIntro: vi.fn(),
    showDocument: vi.fn(),
    clearDocument: vi.fn(() => calls.push('CLEAR')),
    showStage: vi.fn(),
    setTranslation: vi.fn((id: string, text: string, origin: string) =>
      calls.push(`T ${id} ${origin} ${text}`),
    ),
    setBlockState: vi.fn((id: string, state: string) => calls.push(`S ${id} ${state}`)),
    setStageState: vi.fn(),
    setBanner: vi.fn((kind: string, msg: string) => calls.push(`B ${kind} ${msg}`)),
    ask: vi.fn(async (_message: string, _okLabel: string, _signal?: AbortSignal) => true),
    setUsage: vi.fn(),
    setBusy: vi.fn(),
  }
  return { view: view as unknown as ReadingView & typeof view, calls }
}

// 假引擎：按收到的 <s id> 原样回 “译:<原文>”，可注入错误或漏段
function fakeEngine(opts: { fail?: EngineError; drop?: string; noUsage?: boolean } = {}) {
  const run = vi.fn(async (messages: readonly ChatMessage[], onText: (d: string) => void) => {
    if (opts.fail) throw opts.fail
    const user = messages[1]?.content ?? ''
    for (const m of user.matchAll(/<s id="([^"]+)">([\s\S]*?)<\/s>/g)) {
      if (m[1] === opts.drop) continue
      onText(`<t id="${m[1]}">译:${m[2]} 瘟疫</t>`)
    }
    return { finishReason: 'stop', usage: opts.noUsage ? null : { prompt: 10, completion: 5 } }
  })
  const handle: EngineHandle = {
    runner: { run },
    provider: 'deepseek',
    model: 'deepseek-flash',
    params: 'p',
    costText: () => '约 ¥0.0001',
  }
  return { run, handle }
}

// 可控假引擎：每次调用挂起，直到测试手动 release；不理会中止信号，模拟仍在吐字的旧请求
function gatedEngine() {
  const calls: { user: string; release(): void }[] = []
  const run = vi.fn(
    (messages: readonly ChatMessage[], onText: (d: string) => void) =>
      new Promise<ChunkResult>((resolve) => {
        const user = messages[1]?.content ?? ''
        calls.push({
          user,
          release() {
            for (const m of user.matchAll(/<s id="([^"]+)">([\s\S]*?)<\/s>/g))
              onText(`<t id="${m[1]}">译:${m[2]} 瘟疫</t>`)
            resolve({ finishReason: 'stop', usage: { prompt: 10, completion: 5 } })
          },
        })
      }),
  )
  const handle: EngineHandle = {
    runner: { run },
    provider: 'deepseek',
    model: 'deepseek-flash',
    params: 'p',
    costText: () => '约 ¥0.0001',
  }
  return { run, calls, handle }
}

function deps(over: Partial<ControllerDeps> & { raw?: unknown } = {}) {
  const { view, calls } = fakeView()
  const store = createMemoryStore({ capacityBytes: 1e7, now: () => 1 })
  const base: ControllerDeps = {
    extract: async () => over.raw ?? twoStages,
    dictionary: async () => dict,
    translateLine: (line) => (line === '+80 to maximum Life' ? '+80 最大生命' : null),
    store,
    prefs: async () => DEFAULT_PREFS,
    engine: async () => null,
    view,
    random: () => 'R',
  }
  return { d: { ...base, ...over }, view, calls, store }
}

describe('createController', () => {
  it('CoE、PoE1、空页面给出说明，不调引擎', async () => {
    for (const [reason, text] of [
      ['coe', 'CoE'],
      ['poe1', 'PoE1'],
      ['empty', '没有读到正文'],
    ] as const) {
      const engine = vi.fn()
      const { d, calls } = deps({ raw: { ok: false, reason }, engine })
      await createController(d).start()
      expect(calls.some((c) => c.startsWith('B error') && c.includes(text))).toBe(true)
      expect(engine).not.toHaveBeenCalled()
    }
  })
  it('读取失败（页面已更换）', async () => {
    const { d, calls } = deps({
      extract: async () => {
        throw new Error('Cannot access contents of the page')
      },
    })
    await createController(d).start()
    expect(calls).toContain('B error 页面已更换或无法读取，请在攻略页重新点扩展图标。')
  })
  it('未配置服务：词缀行走词典，显示配置横幅', async () => {
    const { d, calls } = deps()
    await createController(d).start()
    expect(calls).toContain('T m dictionary +80 最大生命')
    expect(calls.some((c) => c.startsWith('B setup'))).toBe(true)
  })
  it('只自动翻当前阶段；切到其他阶段再翻', async () => {
    const { run, handle } = fakeEngine()
    const { d, calls } = deps({ engine: async () => handle })
    const c = createController(d)
    await c.start()
    expect(run).toHaveBeenCalledTimes(1)
    expect(calls.some((x) => x.startsWith('T a engine'))).toBe(true)
    expect(calls.some((x) => x.startsWith('T b'))).toBe(false)
    await c.translateStage('s2')
    expect(calls.some((x) => x.startsWith('T b engine'))).toBe(true)
  })
  it('第二次打开命中缓存，不再请求', async () => {
    const { run, handle } = fakeEngine()
    const first = deps({ engine: async () => handle })
    await createController(first.d).start()
    const second = deps({ engine: async () => handle, store: first.store })
    await createController(second.d).start()
    expect(run).toHaveBeenCalledTimes(1)
    expect(second.calls.some((x) => x.startsWith('T a cache'))).toBe(true)
  })
  it('词典版本变化后不命中旧缓存', async () => {
    const { run, handle } = fakeEngine()
    const first = deps({ engine: async () => handle })
    await createController(first.d).start()
    const second = deps({
      engine: async () => handle,
      store: first.store,
      dictionary: async () => ({ ...dict, hash: 'h2' }),
    })
    await createController(second.d).start()
    expect(run).toHaveBeenCalledTimes(2)
  })
  it('同一原文新增实体标记后重新请求，重开同一实体版本仍命中缓存', async () => {
    const { run, handle } = fakeEngine()
    const text = 'Use Unknown Crown before the next stage.'
    const b = { id: 'e', kind: 'paragraph', text }
    const first = deps({ raw: doc([b]), engine: async () => handle })
    await createController(first.d).start()
    const second = deps({
      raw: doc([{ ...b, entities: [[4, 17]] }]),
      store: first.store,
      engine: async () => handle,
    })
    await createController(second.d).start()
    expect(run).toHaveBeenCalledTimes(2)
    expect(run.mock.calls[1]?.[0][1]?.content).toContain(
      '<s id="e">Use ⟦0⟧ before the next stage.</s>',
    )
    expect(second.calls).toContain('T e engine 译:Use Unknown Crown before the next stage. 瘟疫')
    await createController(second.d).start()
    expect(run).toHaveBeenCalledTimes(2)
    expect(second.calls.some((s) => s.startsWith('T e cache'))).toBe(true)
  })
  it('超过字数上限且用户取消时不发送', async () => {
    const { run, handle } = fakeEngine()
    const { d, view } = deps({
      engine: async () => handle,
      prefs: async () => ({ ...DEFAULT_PREFS, charLimit: 1000 }),
    })
    const big = doc([{ id: 'x', kind: 'paragraph', text: `Contagion ${'word '.repeat(300)}` }])
    view.ask.mockResolvedValueOnce(false)
    await createController({ ...d, extract: async () => big }).start()
    expect(view.ask).toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })
  it('模型漏段时标记未返回', async () => {
    const { handle } = fakeEngine({ drop: 'a' })
    const { d, calls } = deps({ engine: async () => handle })
    await createController(d).start()
    expect(calls).toContain('S a missing')
  })
  it('Key 无效时显示配置横幅（直达设置）并停止后续块', async () => {
    const { run, handle } = fakeEngine({ fail: new EngineError('auth', 'Key 无效或没有权限') })
    const many = doc(
      Array.from({ length: 25 }, (_, i) => ({
        id: `p${i}`,
        kind: 'paragraph',
        text: `Contagion paragraph number ${i}.`,
      })),
    )
    const { d, calls } = deps({ engine: async () => handle, raw: many })
    await createController(d).start()
    expect(run).toHaveBeenCalledTimes(1)
    expect(calls).toContain('B setup Key 无效或没有权限')
  })
  it('余额不足或限流重试后仍失败时报错并停止后续块', async () => {
    for (const fail of [
      new EngineError('balance', '账户余额不足'),
      new EngineError('rate', '请求太频繁，稍后重试'),
    ]) {
      const { run, handle } = fakeEngine({ fail })
      const many = doc(
        Array.from({ length: 25 }, (_, i) => ({
          id: `p${i}`,
          kind: 'paragraph',
          text: `Contagion paragraph number ${i}.`,
        })),
      )
      const { d, calls } = deps({ engine: async () => handle, raw: many })
      await createController(d).start()
      expect(run).toHaveBeenCalledTimes(1)
      expect(calls).toContain(`B error ${fail.message}`)
    }
  })
  it('切换阶段时旧任务结束不会隐藏新任务的停止按钮', async () => {
    const { run, calls: engineCalls, handle } = gatedEngine()
    const { d, view } = deps({ engine: async () => handle })
    const c = createController(d)
    const first = c.start()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const second = c.translateStage('s2')
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    engineCalls[0]?.release()
    await first
    expect(view.setBusy.mock.calls.at(-1)).toEqual([true])
    engineCalls[1]?.release()
    await second
    expect(view.setBusy.mock.calls.at(-1)).toEqual([false])
    expect(view.setStageState).toHaveBeenCalledWith('s2', 'done')
  })
  it('重新读取后旧任务的译文不会写进新文档，新文档同号段落照常翻译', async () => {
    const { run, calls: engineCalls, handle } = gatedEngine()
    const oldDoc = doc([{ id: 'a', kind: 'paragraph', text: 'Old Contagion text one.' }])
    const newDoc = doc([{ id: 'a', kind: 'paragraph', text: 'New Contagion text two.' }])
    let reads = 0
    const { d, view, calls } = deps({
      engine: async () => handle,
      extract: async () => (reads++ === 0 ? oldDoc : newDoc),
    })
    view.showDocument.mockImplementation(() => calls.push('D'))
    const c = createController(d)
    const first = c.start()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const second = c.start()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    engineCalls[0]?.release()
    engineCalls[1]?.release()
    await Promise.all([first, second])
    const after = calls.slice(calls.lastIndexOf('D'))
    expect(after.some((x) => x.includes('Old'))).toBe(false)
    expect(after.some((x) => x.startsWith('T a engine') && x.includes('New'))).toBe(true)
  })
  it('等待字数确认时切换阶段：旧确认按取消结束，新阶段照常确认并完成', async () => {
    const { run, handle } = fakeEngine()
    const { d, view, calls } = deps({
      engine: async () => handle,
      prefs: async () => ({ ...DEFAULT_PREFS, charLimit: 10 }),
    })
    const answers: { promise: Promise<boolean>; resolve(v: boolean): void }[] = []
    view.ask.mockImplementation((_m: string, _l: string, signal?: AbortSignal) => {
      let resolve: (v: boolean) => void = () => {}
      const promise = new Promise<boolean>((r) => {
        resolve = r
        signal?.addEventListener('abort', () => r(false), { once: true })
      })
      answers.push({ promise, resolve })
      return promise
    })
    const c = createController(d)
    const first = c.start()
    await vi.waitFor(() => expect(view.ask).toHaveBeenCalledTimes(1))
    const second = c.translateStage('s2')
    await expect(answers[0]?.promise).resolves.toBe(false)
    await vi.waitFor(() => expect(view.ask).toHaveBeenCalledTimes(2))
    answers[1]?.resolve(true)
    await Promise.all([first, second])
    expect(run).toHaveBeenCalledTimes(1)
    expect(calls.some((x) => x.startsWith('T b engine'))).toBe(true)
    expect(calls.some((x) => x.startsWith('T a'))).toBe(false)
    expect(calls.some((x) => x.startsWith('B info'))).toBe(false)
    expect(view.setStageState).toHaveBeenCalledWith('s2', 'done')
  })
  it('缓存读取失败按未命中处理，仍走引擎翻译', async () => {
    const { run, handle } = fakeEngine()
    const { d, calls, store } = deps({ engine: async () => handle })
    vi.spyOn(store, 'getCached').mockRejectedValue(new Error('IndexedDB 不可用'))
    await createController(d).start()
    expect(run).toHaveBeenCalledTimes(1)
    expect(calls.some((x) => x.startsWith('T a engine'))).toBe(true)
  })
  it('服务未返回用量时按已收到的译文估算输出 tokens', async () => {
    const { handle } = fakeEngine({ noUsage: true })
    const { d, view } = deps({ engine: async () => handle })
    await createController(d).start()
    const last = String(view.setUsage.mock.calls.at(-1)?.[0])
    expect(Number(/本次约 \d+\+(\d+) tokens/.exec(last)?.[1])).toBeGreaterThan(0)
  })
  it('阶段任务进行中点单段重试：排队到当前任务结束后执行，不中止阶段', async () => {
    const { run, calls: engineCalls, handle } = gatedEngine()
    const { d, view, calls } = deps({ engine: async () => handle })
    const c = createController(d)
    const first = c.start()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const retry = c.retryBlock('b')
    await new Promise((r) => setTimeout(r, 0))
    expect(run).toHaveBeenCalledTimes(1) // 重试在排队，没有中止阶段任务
    expect(calls).toContain('S b pending')
    engineCalls[0]?.release()
    await first
    expect(calls.some((x) => x.startsWith('T a engine'))).toBe(true)
    expect(view.setStageState).toHaveBeenCalledWith('s1', 'done')
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    expect(engineCalls[1]?.user).toContain('<s id="b">')
    engineCalls[1]?.release()
    await retry
    expect(calls.some((x) => x.startsWith('T b engine'))).toBe(true)
  })
  it('停止时排队中的重试一并取消，段落回到原来的失败状态', async () => {
    let n = 0
    const gate = gatedEngine()
    const run = vi.fn(
      async (messages: readonly ChatMessage[], onText: (d: string) => void, s: AbortSignal) => {
        if (n++ === 0) throw new EngineError('network', '网络错误')
        return gate.handle.runner.run(messages, onText, s)
      },
    )
    const { d, calls } = deps({ engine: async () => ({ ...gate.handle, runner: { run } }) })
    const c = createController(d)
    await c.start() // a 失败
    expect(calls).toContain('S a failed')
    const stage = c.translateStage('s2') // b 挂起
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    const retry = c.retryBlock('a')
    await new Promise((r) => setTimeout(r, 0))
    c.stop()
    await retry
    expect(run).toHaveBeenCalledTimes(2)
    expect(calls.filter((x) => x.startsWith('S a ')).at(-1)).toBe('S a failed')
    gate.calls[0]?.release()
    await stage
  })
  it('失败或未返回的段在停止、切换阶段后保留错误状态', async () => {
    const many = (stage: string, from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `p${from + i}`,
        kind: 'paragraph',
        text: `Contagion paragraph number ${from + i}.`,
        stageId: stage,
      }))
    const raw = doc(
      [...many('s1', 0, 12), ...many('s2', 12, 1)],
      [
        { id: 's1', name: 'L', current: true },
        { id: 's2', name: 'E', current: false },
      ],
    )
    for (const how of ['stop', 'stage'] as const) {
      let n = 0
      const gate = gatedEngine()
      const run = vi.fn(
        async (messages: readonly ChatMessage[], onText: (d: string) => void, s: AbortSignal) => {
          if (n++ === 0) throw new EngineError('network', '网络错误')
          return gate.handle.runner.run(messages, onText, s)
        },
      )
      const { d, calls } = deps({ raw, engine: async () => ({ ...gate.handle, runner: { run } }) })
      const c = createController(d)
      void c.start() // 第一块（p0–p9）失败，第二块（p10、p11）挂起
      await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
      if (how === 'stop') c.stop()
      else void c.translateStage('s2')
      const last = (id: string) => calls.filter((x) => x.startsWith(`S ${id} `)).at(-1)
      expect(last('p0')).toBe('S p0 failed')
      expect(last('p9')).toBe('S p9 failed')
      expect(last('p10')).toBe('S p10 idle')
    }
  })
  it('重新读取失败时清空视图，之后点阶段不会把空目标标为已翻译', async () => {
    const { run, handle } = fakeEngine()
    let reads = 0
    const { d, view, calls } = deps({
      engine: async () => handle,
      extract: async () => {
        if (reads++ === 0) return twoStages
        throw new Error('Cannot access contents of the page')
      },
    })
    const c = createController(d)
    await c.start()
    expect(run).toHaveBeenCalledTimes(1)
    view.setStageState.mockClear()
    await c.start()
    expect(calls).toContain('CLEAR')
    await c.translateStage('s2')
    await c.retryBlock('a')
    expect(run).toHaveBeenCalledTimes(1)
    expect(view.setStageState).not.toHaveBeenCalled()
  })
  it('读取进行中点阶段不发送，也不改阶段状态', async () => {
    const { run, handle } = fakeEngine()
    let release: (v: unknown) => void = () => {}
    let reads = 0
    const { d, view } = deps({
      engine: async () => handle,
      extract: () =>
        reads++ === 0 ? Promise.resolve(twoStages) : new Promise((r) => (release = r)),
    })
    const c = createController(d)
    await c.start()
    view.setStageState.mockClear()
    const again = c.start()
    await c.translateStage('s2')
    expect(view.setStageState).not.toHaveBeenCalled()
    release(twoStages)
    await again
    expect(run).toHaveBeenCalledTimes(1) // 新文档的 s1 命中缓存
  })
  it('词典或设置读取失败时显示错误横幅', async () => {
    const bad = deps({
      dictionary: async () => {
        throw new Error('404')
      },
    })
    await createController(bad.d).start()
    expect(bad.calls.some((x) => x.startsWith('B error'))).toBe(true)
    const { handle } = fakeEngine()
    const badPrefs = deps({
      engine: async () => handle,
      prefs: async () => {
        throw new Error('storage')
      },
    })
    await createController(badPrefs.d).start()
    expect(badPrefs.calls.some((x) => x.startsWith('B error'))).toBe(true)
  })
})
