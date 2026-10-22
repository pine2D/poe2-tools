import { EngineError } from './openai'

/** 服务要求等待超过这个时长就不再自动重试 */
export const MAX_RETRY_WAIT_MS = 60_000

// 只对 429 自动重试一次；其他错误交给界面逐段重试。等待期间停止立即生效。
export async function withRetry<T>(
  run: () => Promise<T>,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof EngineError) || error.kind !== 'rate') throw error
    const wait = error.retryAfterMs ?? 5000
    if (wait > MAX_RETRY_WAIT_MS)
      throw new EngineError(
        'rate',
        `请求太频繁，服务要求等待 ${Math.ceil(wait / 1000)} 秒（超过 60 秒），已停止，请稍后再试`,
        wait,
      )
    await new Promise<void>((resolve, reject) => {
      const stopped = () => reject(new EngineError('aborted', '已停止'))
      if (signal?.aborted) return stopped()
      signal?.addEventListener('abort', stopped, { once: true })
      sleep(wait, signal).then(
        () => {
          signal?.removeEventListener('abort', stopped)
          resolve()
        },
        (e: unknown) => {
          signal?.removeEventListener('abort', stopped)
          reject(e)
        },
      )
    })
    return run()
  }
}
