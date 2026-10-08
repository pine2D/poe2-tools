import type { EngineConfig, Provider } from './engines/openai'
import { DEEPSEEK } from './engines/presets'
import { keyForConfig, originOf } from './store/keys'
import type { KeyRecord } from './store/types'

export interface SettingsValues {
  provider: Provider
  baseUrl: string
  model: string
  apiKey: string
  extraBody: string
  confirmOrigin: boolean
}

export type Resolved =
  | { ok: true; config: EngineConfig; record: KeyRecord; origin: string }
  | { ok: false; error: string }

export function resolveConfig(
  values: SettingsValues,
  existing: KeyRecord | null,
  confirmedOrigins: readonly string[],
): Resolved {
  const custom = values.provider === 'custom'
  const baseUrl = custom ? values.baseUrl.trim() : DEEPSEEK.baseUrl
  const model = custom ? values.model.trim() : DEEPSEEK.model
  const origin = originOf(baseUrl)
  if (!origin)
    return { ok: false, error: '地址必须是 https，或本机的 http://localhost、http://127.0.0.1。' }
  if (!model) return { ok: false, error: '请填写模型名。' }
  let extraBody: Record<string, unknown> | undefined
  if (custom && values.extraBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(values.extraBody)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
      extraBody = parsed as Record<string, unknown>
    } catch {
      return { ok: false, error: '额外请求参数必须是 JSON 对象。' }
    }
  }
  if (custom && !values.confirmOrigin && !confirmedOrigins.includes(origin))
    return { ok: false, error: '首次使用这个地址，请勾选确认发送。' }
  const apiKey = values.apiKey.trim() || keyForConfig(existing, baseUrl)
  if (!apiKey) return { ok: false, error: '请填写 Key。' }
  const config: EngineConfig = { provider: values.provider, baseUrl, model, apiKey }
  if (extraBody) config.extraBody = extraBody
  return {
    ok: true,
    config,
    origin,
    record: { provider: values.provider, baseUrl, origin, model, apiKey },
  }
}
