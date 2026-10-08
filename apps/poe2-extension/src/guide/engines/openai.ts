import type { ChatMessage } from '@poe2-tools/guide-core'
import { REQUEST_PARAMS } from './presets'
import { readSse } from './sse'

export type Provider = 'deepseek' | 'custom'

export interface EngineConfig {
  provider: Provider
  baseUrl: string
  model: string
  apiKey: string
  extraBody?: Record<string, unknown>
}

export interface ChunkResult {
  finishReason: string | null
  usage: { prompt: number; completion: number } | null
}

export type EngineErrorKind =
  | 'auth'
  | 'balance'
  | 'rate'
  | 'network'
  | 'server'
  | 'bad-request'
  | 'aborted'

export class EngineError extends Error {
  kind: EngineErrorKind
  retryAfterMs: number | null
  constructor(kind: EngineErrorKind, message: string, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'EngineError'
    this.kind = kind
    this.retryAfterMs = retryAfterMs
  }
}

export function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

// 有的服务商会在错误信息里回显部分 Key，展示前一律抹掉。
export function redact(text: string, apiKey: string): string {
  let out = text
  if (apiKey) out = out.split(apiKey).join('***')
  return out.replace(/sk-[A-Za-z0-9_-]{4,}/g, 'sk-***')
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

export function classifyStatus(
  status: number,
  retryAfter: string | null,
  body: string,
  apiKey: string,
): EngineError {
  if (status === 401 || status === 403) return new EngineError('auth', 'Key 无效或没有权限')
  if (status === 402) return new EngineError('balance', '账户余额不足')
  if (status === 429)
    return new EngineError('rate', '请求太频繁，稍后重试', retryAfterMs(retryAfter))
  if (status >= 500) return new EngineError('server', `服务暂时不可用（${status}）`)
  let message = body
  try {
    const json = JSON.parse(body) as { error?: { message?: unknown } }
    if (typeof json.error?.message === 'string') message = json.error.message
  } catch {}
  return new EngineError(
    'bad-request',
    `请求被拒绝（${status}）：${redact(message, apiKey).slice(0, 200)}`,
  )
}

export interface StreamOptions {
  signal: AbortSignal
  onText: (delta: string) => void
  fetchImpl?: typeof fetch
}

interface Choice {
  delta?: { content?: unknown }
  message?: { content?: unknown }
  finish_reason?: unknown
}
interface Payload {
  choices?: Choice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const usageOf = (p: Payload): ChunkResult['usage'] =>
  p.usage
    ? { prompt: p.usage.prompt_tokens ?? 0, completion: p.usage.completion_tokens ?? 0 }
    : null

export async function streamChat(
  cfg: EngineConfig,
  messages: readonly ChatMessage[],
  opts: StreamOptions,
): Promise<ChunkResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const body = {
    model: cfg.model,
    messages,
    stream: true,
    ...REQUEST_PARAMS,
    ...(cfg.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
    ...(cfg.extraBody ?? {}),
  }
  if (opts.signal.aborted) throw new EngineError('aborted', '已停止')
  let res: Response
  try {
    res = await fetchImpl(endpoint(cfg.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify(body),
      signal: opts.signal,
    })
  } catch {
    throw opts.signal.aborted
      ? new EngineError('aborted', '已停止')
      : new EngineError('network', '网络错误，或请求被浏览器拦截')
  }
  if (!res.ok)
    throw classifyStatus(
      res.status,
      res.headers.get('retry-after'),
      await res.text().catch(() => ''),
      cfg.apiKey,
    )

  if (!(res.headers.get('content-type') ?? '').includes('text/event-stream') || !res.body) {
    const json = (await res.json()) as Payload
    const choice = json.choices?.[0]
    const content = choice?.message?.content
    if (typeof content === 'string') opts.onText(content)
    return {
      finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : null,
      usage: usageOf(json),
    }
  }

  let finishReason: string | null = null
  let usage: ChunkResult['usage'] = null
  try {
    await readSse(res.body, (data) => {
      if (data === '[DONE]') return
      let json: Payload
      try {
        json = JSON.parse(data) as Payload
      } catch {
        return
      }
      const choice = json.choices?.[0]
      const delta = choice?.delta?.content
      if (typeof delta === 'string' && delta) opts.onText(delta)
      if (typeof choice?.finish_reason === 'string') finishReason = choice.finish_reason
      usage = usageOf(json) ?? usage
    })
  } catch {
    throw opts.signal.aborted
      ? new EngineError('aborted', '已停止')
      : new EngineError('network', '连接中断')
  }
  return { finishReason, usage }
}
