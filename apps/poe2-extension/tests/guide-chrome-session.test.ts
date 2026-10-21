import { afterEach, expect, it, vi } from 'vitest'
import { guideChrome } from '../src/guide/chrome'

afterEach(() => {
  vi.unstubAllGlobals()
})
it('注入与命令只传所选范围和译文，定位模式恢复复用隔离会话', async () => {
  const page = {
    read: vi.fn(() => ({ ok: false, reason: 'empty' })),
    pickRegion: vi.fn(async () => null),
    cancelPicker: vi.fn(),
    setMode: vi.fn(),
    locate: vi.fn(() => ({ state: 'located', message: '' })),
    render: vi.fn(() => ({ state: 'inline', message: '' })),
    clear: vi.fn(),
    status: vi.fn(() => ({ snapshotId: 's', stale: false, changedIds: [] })),
  }
  vi.stubGlobal('__poe2GuideSession', page)
  const executeScript = vi.fn(
    async (injection: { func?: (...args: unknown[]) => unknown; args?: unknown[] }) => [
      { result: await injection.func?.(...(injection.args ?? [])) },
    ],
  )
  vi.stubGlobal('chrome', { scripting: { executeScript } })
  await guideChrome.extract(7, 'selection')
  expect(executeScript.mock.calls[0]?.[0]).toEqual({ target: { tabId: 7 }, files: ['extract.js'] })
  expect(page.cancelPicker).toHaveBeenCalledOnce()
  expect(page.read).toHaveBeenCalledWith({ scope: 'selection' })
  await guideChrome.extract(7, 'region')
  expect(page.pickRegion).toHaveBeenCalledOnce()
  const translation = { id: 'a', text: '译文', origin: 'engine' as const, issues: [] }
  await guideChrome.render(7, 's', translation)
  expect(page.render).toHaveBeenCalledWith('s', translation)
  await guideChrome.locate(7, 's', 'a')
  expect(page.locate).toHaveBeenCalledWith('s', 'a')
  await guideChrome.mode(7, 'sidebar')
  expect(page.setMode).toHaveBeenCalledWith('sidebar')
  expect(await guideChrome.status(7)).toEqual({ snapshotId: 's', stale: false, changedIds: [] })
  await guideChrome.clear(7)
  expect(page.clear).toHaveBeenCalledOnce()
})
