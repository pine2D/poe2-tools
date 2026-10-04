import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PageStateReply } from '../src/protocol'

type Counted = (() => void) & { count(): number }
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  answer: vi.fn(),
  attach: vi.fn<(...args: unknown[]) => Counted>(),
  stat: vi.fn<(...args: unknown[]) => Counted>(),
}))
vi.mock('../src/platform', () => ({
  defaults: { enabled: true, bilingual: false },
  platform: {
    resource: (path: string) => path,
    read: mocks.read,
    subscribe: mocks.subscribe,
    answer: mocks.answer,
  },
}))
vi.mock('../src/content/text-layer', () => ({ attachTextLayer: mocks.attach }))
vi.mock('../src/content/attribute-layer', () => ({ attachAttributeLayer: () => () => {} }))
vi.mock('../src/content/stat-layer', () => ({ attachStatLayer: mocks.stat }))
vi.mock('../src/content/search-controller', () => ({ attachSearch: () => () => {} }))
vi.mock('../src/content/import-controller', () => ({ attachImport: () => () => {} }))
vi.mock('../src/content/instruction-layout', () => ({ attachInstructionLayout: () => () => {} }))
vi.mock('../src/content/page-labels', () => ({ attachPageLabels: () => () => {} }))
vi.mock('../src/content/language-notice', () => ({ createLanguageNotice: () => ({ update() {} }) }))
vi.mock('../src/adapters/coe-beta/context', () => ({ pageStatus: () => 'supported' }))
beforeEach(() => {
  // 文本层 3 处、词缀层 2 处：已翻译处数应为 5
  mocks.attach.mockImplementation(() => Object.assign(vi.fn(), { count: () => 3 }))
  mocks.stat.mockImplementation(() => Object.assign(vi.fn(), { count: () => 2 }))
})
afterEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const OK_DICTIONARY = {
  ok: true,
  json: async () => ({ schemaVersion: 1, locale: 'zh-CN', terms: [] }),
}
function quietObserver() {
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  )
}
function reply(): PageStateReply {
  expect(mocks.answer).toHaveBeenCalledOnce()
  expect(mocks.answer.mock.calls[0]?.[0]).toBe('poe2-l10n/page-state')
  return mocks.answer.mock.calls[0]?.[1]()
}
it('初始读取未完成时收到停用事件，不被随后返回的旧启用值覆盖', async () => {
  let resolve!: (value: { enabled: boolean; bilingual: boolean }) => void
  mocks.read.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, locale: 'zh-CN', terms: [] }),
    }),
  )
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  )
  await import('../src/content/index')
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalled())
  expect(mocks.subscribe).toHaveBeenCalledOnce()
  const changed = mocks.subscribe.mock.calls[0]?.[0]
  changed({ enabled: false, bilingual: true })
  resolve({ enabled: true, bilingual: false })
  await new Promise((done) => setTimeout(done, 0))
  expect(mocks.attach).not.toHaveBeenCalled()
  changed({ enabled: true, bilingual: true })
  expect(mocks.attach).toHaveBeenCalledOnce()
  expect(mocks.attach.mock.calls[0]?.[2]).toBe(true)
})

it.each([true, false])('无并发变化时使用初始 enabled=%s 设置', async (enabled) => {
  mocks.read.mockResolvedValue({ enabled, bilingual: true })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ schemaVersion: 1, locale: 'zh-CN', terms: [] }),
    }),
  )
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe() {}
    },
  )
  await import('../src/content/index')
  await vi.waitFor(() => expect(mocks.read).toHaveBeenCalled())
  await new Promise((done) => setTimeout(done, 0))
  expect(mocks.attach).toHaveBeenCalledTimes(enabled ? 1 : 0)
  if (enabled) expect(mocks.attach.mock.calls[0]?.[2]).toBe(true)
})

it('应答器在第一个 await 之前注册：词典未返回时回 starting，首轮 reconcile 后转 ready 并带已翻译处数', async () => {
  let respond!: (value: typeof OK_DICTIONARY) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise((done) => {
          respond = done
        }),
    ),
  )
  quietObserver()
  mocks.read.mockResolvedValue({ enabled: true, bilingual: false })
  await import('../src/content/index')
  expect(reply()).toMatchObject({ v: 1, phase: 'starting', error: null, translated: 0 })
  respond(OK_DICTIONARY)
  await vi.waitFor(() => expect(reply().phase).toBe('ready'))
  expect(reply()).toEqual({
    v: 1,
    phase: 'ready',
    error: null,
    page: 'supported',
    enabled: true,
    translated: 5,
    search: 'none',
    searchMissing: [],
  })
})

it.each([
  ['fetch reject', () => vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))],
  ['HTTP 404', () => vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })],
  [
    'schemaVersion 不符',
    () =>
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ schemaVersion: 2, locale: 'zh-CN', terms: [] }),
      }),
  ],
  [
    'JSON 损坏',
    () =>
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      }),
  ],
])('词典失败（%s）→ failed/dictionary；照旧写控制台，不再读设置', async (_name, makeFetch) => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', makeFetch())
  quietObserver()
  await import('../src/content/index')
  await vi.waitFor(() => expect(reply().phase).toBe('failed'))
  expect(reply()).toMatchObject({ error: 'dictionary', translated: 0 })
  expect(error).toHaveBeenCalledWith('[PoE2 中文助手]', expect.any(String))
  expect(mocks.read).not.toHaveBeenCalled()
})

it('设置读取失败 → failed/settings，不挂任何层', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK_DICTIONARY))
  quietObserver()
  mocks.read.mockRejectedValue(new Error('no storage'))
  await import('../src/content/index')
  await vi.waitFor(() => expect(reply().phase).toBe('failed'))
  expect(reply().error).toBe('settings')
  expect(mocks.attach).not.toHaveBeenCalled()
})

it('挂层抛错 → failed/other，不被随后的 ready 覆盖', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK_DICTIONARY))
  quietObserver()
  mocks.read.mockResolvedValue({ enabled: true, bilingual: false })
  mocks.attach.mockImplementation(() => {
    throw new Error('boom')
  })
  await import('../src/content/index')
  await vi.waitFor(() => expect(mocks.attach).toHaveBeenCalled())
  await new Promise((done) => setTimeout(done, 0))
  expect(reply()).toMatchObject({ phase: 'failed', error: 'other' })
  expect(error).toHaveBeenCalledWith('[PoE2 中文助手]', 'boom')
})

it('关闭时仍应答 enabled=false、translated=0；打开后计数恢复，再关闭归零', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(OK_DICTIONARY))
  quietObserver()
  mocks.read.mockResolvedValue({ enabled: false, bilingual: false })
  await import('../src/content/index')
  await vi.waitFor(() => expect(reply().phase).toBe('ready'))
  expect(reply()).toMatchObject({ enabled: false, translated: 0, search: 'none' })
  const changed = mocks.subscribe.mock.calls[0]?.[0]
  changed({ enabled: true, bilingual: false })
  expect(reply()).toMatchObject({ phase: 'ready', enabled: true, translated: 5 })
  changed({ enabled: false, bilingual: false })
  expect(reply()).toMatchObject({ enabled: false, translated: 0 })
})
