import { EngineError } from './openai'

// 只对 429 自动重试一次；其他错误交给界面逐段重试。
export async function withRetry<T>(
  run: () => Promise<T>,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!(error instanceof EngineError) || error.kind !== 'rate') throw error
    await sleep(error.retryAfterMs ?? 5000)
    return run()
  }
}
