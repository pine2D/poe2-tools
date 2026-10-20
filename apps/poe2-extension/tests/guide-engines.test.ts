// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { classifyStatus, EngineError, endpoint, streamChat } from '../src/guide/engines/openai'
import { DEEPSEEK, deepseekPeak, estimateCost } from '../src/guide/engines/presets'
import { withRetry } from '../src/guide/engines/retry'

const sse = (events: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(new TextEncoder().encode(e))
        c.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
const cfg = { ...DEEPSEEK, apiKey: 'sk-secret-123456' }
const msgs = [{ role: 'user' as const, content: 'hi' }]

describe('endpoint', () => {
  it('补全或保留 /chat/completions', () => {
    expect(endpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/chat/completions')
    expect(endpoint('https://x.example/v1/')).toBe('https://x.example/v1/chat/completions')
    expect(endpoint('https://x.example/v1/chat/completions')).toBe(
      'https://x.example/v1/chat/completions',
    )
  })
})

describe('streamChat', () => {
  it('拼接流式增量，返回结束原因与用量；DeepSeek 关闭思考', async () => {
    const fetchImpl = vi.fn(async () =>
      sse([
        'data: {"choices":[{"delta":{"content":"<t id=\\"b1\\">你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好</t>"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":5}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    let text = ''
    const r = await streamChat(cfg, msgs, {
      signal: new AbortController().signal,
      onText: (d) => (text += d),
      fetchImpl,
    })
    expect(text).toBe('<t id="b1">你好</t>')
    expect(r).toEqual({ finishReason: 'stop', usage: { prompt: 12, completion: 5 } })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-123456')
    // 不跟随重定向：Key 只发往配置的地址
    expect(init.redirect).toBe('error')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      stream: true,
      temperature: 0.2,
      thinking: { type: 'disabled' },
    })
  })
  it('自定义接口不带 thinking，合并额外参数', async () => {
    const fetchImpl = vi.fn(async () => sse(['data: [DONE]\n\n']))
    await streamChat(
      {
        provider: 'custom',
        baseUrl: 'https://x.example/v1',
        model: 'm',
        apiKey: 'k',
        extraBody: { top_p: 0.9 },
      },
      msgs,
      { signal: new AbortController().signal, onText: () => {}, fetchImpl },
    )
    const body = JSON.parse(
      String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    )
    expect(body.thinking).toBeUndefined()
    expect(body.top_p).toBe(0.9)
  })
  it('非流式 JSON 响应也能取到正文', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '<t id="a">一</t>' }, finish_reason: 'length' }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    let text = ''
    const r = await streamChat(cfg, msgs, {
      signal: new AbortController().signal,
      onText: (d) => (text += d),
      fetchImpl,
    })
    expect(text).toBe('<t id="a">一</t>')
    expect(r.finishReason).toBe('length')
  })
  it('非流式响应无法解析或读取时归类为引擎错误', async () => {
    const bad = vi.fn(
      async () =>
        new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    await expect(
      streamChat(cfg, msgs, {
        signal: new AbortController().signal,
        onText: () => {},
        fetchImpl: bad,
      }),
    ).rejects.toMatchObject({ kind: 'network' })
    const ac = new AbortController()
    const aborted = vi.fn(async () => {
      const res = new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      res.json = async () => {
        ac.abort()
        throw new DOMException('aborted', 'AbortError')
      }
      return res
    })
    await expect(
      streamChat(cfg, msgs, { signal: ac.signal, onText: () => {}, fetchImpl: aborted }),
    ).rejects.toMatchObject({ kind: 'aborted' })
  })
  it('网络失败与取消', async () => {
    const fail = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(
      streamChat(cfg, msgs, {
        signal: new AbortController().signal,
        onText: () => {},
        fetchImpl: fail,
      }),
    ).rejects.toMatchObject({ kind: 'network' })
    const ac = new AbortController()
    ac.abort()
    await expect(
      streamChat(cfg, msgs, { signal: ac.signal, onText: () => {}, fetchImpl: fail }),
    ).rejects.toMatchObject({ kind: 'aborted' })
  })
  it('超时与用户取消分开提示', async () => {
    const ac = new AbortController()
    const slow = vi.fn(async () => {
      ac.abort(new DOMException('signal timed out', 'TimeoutError'))
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    await expect(
      streamChat(cfg, msgs, { signal: ac.signal, onText: () => {}, fetchImpl: slow }),
    ).rejects.toMatchObject({ kind: 'network', message: '连接超时' })
  })
  it('服务地址发生跳转时拒绝发送，归类为网络错误', async () => {
    const redirected = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') })
    })
    await expect(
      streamChat(cfg, msgs, {
        signal: new AbortController().signal,
        onText: () => {},
        fetchImpl: redirected,
      }),
    ).rejects.toMatchObject({ kind: 'network', message: '服务地址发生跳转，已拒绝发送' })
    // fetch 实现没有遵守 redirect 选项时也不读取跳转后的响应
    const followed = vi.fn(async () => {
      const res = sse(['data: [DONE]\n\n'])
      Object.defineProperty(res, 'redirected', { value: true })
      return res
    })
    await expect(
      streamChat(cfg, msgs, {
        signal: new AbortController().signal,
        onText: () => {},
        fetchImpl: followed,
      }),
    ).rejects.toMatchObject({ kind: 'network', message: '服务地址发生跳转，已拒绝发送' })
  })
})

describe('classifyStatus', () => {
  it('按状态码分类，错误信息不含 Key', () => {
    expect(classifyStatus(401, null, '', 'k').kind).toBe('auth')
    expect(classifyStatus(403, null, '', 'k').kind).toBe('auth')
    expect(classifyStatus(402, null, '', 'k').kind).toBe('balance')
    const rate = classifyStatus(429, '3', '', 'k')
    expect([rate.kind, rate.retryAfterMs]).toEqual(['rate', 3000])
    expect(classifyStatus(503, null, '', 'k').kind).toBe('server')
    const bad = classifyStatus(
      400,
      null,
      '{"error":{"message":"Incorrect key sk-secret-123456 for model"}}',
      'sk-secret-123456',
    )
    expect(bad.kind).toBe('bad-request')
    expect(bad.message).not.toContain('sk-secret')
  })
})

describe('withRetry', () => {
  it('429 等待后只重试一次', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi
      .fn()
      .mockRejectedValueOnce(new EngineError('rate', 'x', 3000))
      .mockResolvedValueOnce('ok')
    await expect(withRetry(run, sleep)).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(3000, undefined)
    const always = vi.fn().mockRejectedValue(new EngineError('rate', 'x', null))
    await expect(withRetry(always, sleep)).rejects.toMatchObject({ kind: 'rate' })
    expect(sleep).toHaveBeenLastCalledWith(5000, undefined)
    const auth = vi.fn().mockRejectedValue(new EngineError('auth', 'x'))
    await expect(withRetry(auth, sleep)).rejects.toMatchObject({ kind: 'auth' })
    expect(auth).toHaveBeenCalledTimes(1)
  })
  it('Retry-After 超过 60 秒直接停止，不等待', async () => {
    const sleep = vi.fn(async () => {})
    const run = vi.fn().mockRejectedValue(new EngineError('rate', 'x', 61_000))
    await expect(withRetry(run, sleep)).rejects.toMatchObject({
      kind: 'rate',
      message: '请求太频繁，服务要求等待 61 秒（超过 60 秒），已停止，请稍后再试',
    })
    expect(sleep).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
    const edge = vi.fn().mockRejectedValueOnce(new EngineError('rate', 'x', 60_000))
    edge.mockResolvedValueOnce('ok')
    await expect(withRetry(edge, sleep)).resolves.toBe('ok')
    expect(sleep).toHaveBeenCalledWith(60_000, undefined)
  })
  it('等待期间停止立即生效，不再重试', async () => {
    const ac = new AbortController()
    const sleep = vi.fn(() => new Promise<void>(() => {}))
    const run = vi.fn().mockRejectedValue(new EngineError('rate', 'x', 30_000))
    const pending = withRetry(run, sleep, ac.signal)
    await vi.waitFor(() => expect(sleep).toHaveBeenCalled())
    ac.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' })
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('presets', () => {
  it('高峰时段（工作日 UTC 01–04、06–10）与费用估算', () => {
    expect(deepseekPeak(new Date('2026-10-07T02:00:00Z'))).toBe(true)
    expect(deepseekPeak(new Date('2026-10-07T05:00:00Z'))).toBe(false)
    expect(deepseekPeak(new Date('2026-10-10T02:00:00Z'))).toBe(false) // 周六
    expect(estimateCost(1_000_000, 1_000_000, false).usd).toBeCloseTo(0.75)
    expect(estimateCost(1_000_000, 1_000_000, true).usd).toBeCloseTo(1.5)
  })
})

it('用量字段缺失或非法时不补零，保持未知供调用方保守估算', async () => {
  for (const usage of [
    { prompt_tokens: 10 },
    { completion_tokens: 2 },
    { prompt_tokens: -1, completion_tokens: 2 },
    { prompt_tokens: '10', completion_tokens: 2 },
  ]) {
    const r = await streamChat(cfg, msgs, {
      signal: new AbortController().signal,
      onText: () => {},
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage,
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    })
    expect(r.usage).toBeNull()
  }
})

it('最后一帧用量不完整时不沿用早先帧的旧计数', async () => {
  const body =
    'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":1}}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":10}}\n\ndata: [DONE]\n\n'
  const r = await streamChat(cfg, msgs, {
    signal: new AbortController().signal,
    onText: () => {},
    fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
  })
  expect(r.usage).toBeNull()
})
