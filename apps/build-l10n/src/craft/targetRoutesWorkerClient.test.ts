import type { planTargetDefinitionRoutes } from '@poe2-tools/item-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTargetRoutes } from './targetRoutesWorkerClient'

class FakeWorker {
  static current: FakeWorker
  constructor() {
    FakeWorker.current = this
  }
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  postMessage = vi.fn()
}
afterEach(() => vi.unstubAllGlobals())
describe('路线 Worker 生命周期', () => {
  const args = [] as unknown as Parameters<typeof planTargetDefinitionRoutes>
  it('仅按请求创建worker，取消后忽略迟到结果', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const callback = vi.fn()
    const cancel = requestTargetRoutes(args, callback)
    expect(FakeWorker.current.postMessage).toHaveBeenCalledWith(args)
    cancel()
    FakeWorker.current.onmessage?.({ data: { ok: true } })
    expect(callback).not.toHaveBeenCalled()
    expect(FakeWorker.current.terminate).toHaveBeenCalledTimes(1)
  })
  it('完成或错误后终止，可再次生成；反序列化错误也可重试', () => {
    vi.stubGlobal('Worker', FakeWorker)
    const callback = vi.fn()
    requestTargetRoutes(args, callback)
    FakeWorker.current.onmessage?.({ data: { ok: true } })
    expect(callback).toHaveBeenCalledWith({ ok: true })
    expect(FakeWorker.current.terminate).toHaveBeenCalled()
    requestTargetRoutes(args, callback)
    FakeWorker.current.onerror?.()
    expect(callback).toHaveBeenLastCalledWith({ ok: false, error: expect.any(String) })
    requestTargetRoutes(args, callback)
    FakeWorker.current.onmessageerror?.()
    expect(FakeWorker.current.terminate).toHaveBeenCalled()
  })
})
