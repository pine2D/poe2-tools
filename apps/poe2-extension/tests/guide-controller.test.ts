import type { ChatMessage, GuideDictionary } from '@poe2-tools/guide-core'
import { describe, expect, it, vi } from 'vitest'
import { type ControllerDeps, createController, type EngineHandle } from '../src/guide/controller'
import { EngineError } from '../src/guide/engines/openai'
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
    showStage: vi.fn(),
    setTranslation: vi.fn((id: string, text: string, origin: string) =>
      calls.push(`T ${id} ${origin} ${text}`),
    ),
    setBlockState: vi.fn((id: string, state: string) => calls.push(`S ${id} ${state}`)),
    setStageState: vi.fn(),
    setBanner: vi.fn((kind: string, msg: string) => calls.push(`B ${kind} ${msg}`)),
    ask: vi.fn(async () => true),
    setUsage: vi.fn(),
    setBusy: vi.fn(),
  }
  return { view: view as unknown as ReadingView & typeof view, calls }
}

// 假引擎：按收到的 <s id> 原样回 “译:<原文>”，可注入错误或漏段
function fakeEngine(opts: { fail?: EngineError; drop?: string } = {}) {
  const run = vi.fn(async (messages: readonly ChatMessage[], onText: (d: string) => void) => {
    if (opts.fail) throw opts.fail
    const user = messages[1]?.content ?? ''
    for (const m of user.matchAll(/<s id="([^"]+)">([\s\S]*?)<\/s>/g)) {
      if (m[1] === opts.drop) continue
      onText(`<t id="${m[1]}">译:${m[2]} 瘟疫</t>`)
    }
    return { finishReason: 'stop', usage: { prompt: 10, completion: 5 } }
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
})
