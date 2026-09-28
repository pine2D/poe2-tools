import type {
  CraftDefinitionRoutes,
  CraftResult,
  planTargetDefinitionRoutes,
} from '@poe2-tools/item-core'

/** 每次点击独立 worker；终止后丢弃所有迟到消息，不在主线程降级运行搜索。 */
export function requestTargetRoutes(
  args: Parameters<typeof planTargetDefinitionRoutes>,
  onResult: (result: CraftResult<CraftDefinitionRoutes>) => void,
): () => void {
  const worker = new Worker(new URL('./targetRoutes.worker.ts', import.meta.url), {
    type: 'module',
  })
  let active = true
  const cancel = () => {
    active = false
    worker.terminate()
  }
  worker.onmessage = (event: MessageEvent<CraftResult<CraftDefinitionRoutes>>) => {
    if (!active) return
    cancel()
    onResult(event.data)
  }
  const fail = () => {
    if (!active) return
    cancel()
    onResult({ ok: false, error: '路线计算失败，请重试。' })
  }
  worker.onerror = fail
  worker.onmessageerror = fail
  try {
    worker.postMessage(args)
  } catch (error) {
    cancel()
    throw error
  }
  return cancel
}
