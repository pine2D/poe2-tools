import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  subscribe: vi.fn(),
  attach: vi.fn<(...args: unknown[]) => () => void>(() => vi.fn()),
}))
vi.mock('../src/platform', () => ({
  defaults: { enabled: true, bilingual: false },
  platform: { resource: (path: string) => path, read: mocks.read, subscribe: mocks.subscribe },
}))
vi.mock('../src/content/text-layer', () => ({ attachTextLayer: mocks.attach }))
vi.mock('../src/content/attribute-layer', () => ({ attachAttributeLayer: () => () => {} }))
vi.mock('../src/content/stat-layer', () => ({ attachStatLayer: () => () => {} }))
vi.mock('../src/content/search-controller', () => ({ attachSearch: () => () => {} }))
vi.mock('../src/content/import-controller', () => ({ attachImport: () => () => {} }))
vi.mock('../src/content/page-labels', () => ({ attachPageLabels: () => () => {} }))
vi.mock('../src/content/language-notice', () => ({ createLanguageNotice: () => ({ update() {} }) }))
vi.mock('../src/adapters/coe-beta/context', () => ({ pageStatus: () => 'supported' }))
afterEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})
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
