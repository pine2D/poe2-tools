import { resolveConfig } from './config'
import type { EngineHandle } from './controller'
import { streamChat } from './engines/openai'
import { DEEPSEEK, deepseekPeak, estimateCost, REQUEST_PARAMS } from './engines/presets'
import type { GuidePrefs } from './prefs'
import { keyForConfig } from './store/keys'
import type { GuideStore } from './store/types'

export async function guideEngine(
  prefs: GuidePrefs,
  store: GuideStore,
): Promise<EngineHandle | null> {
  const record = await store.getKey()
  const baseUrl = prefs.provider === 'custom' ? prefs.customBaseUrl : DEEPSEEK.baseUrl
  const apiKey = keyForConfig(record, baseUrl)
  if (!record || !apiKey) return null
  const resolved = resolveConfig(
    {
      provider: prefs.provider,
      baseUrl,
      model: prefs.customModel,
      apiKey,
      extraBody: prefs.extraBody,
      confirmOrigin: false,
    },
    record,
    prefs.confirmedOrigins,
  )
  if (!resolved.ok) return null
  const cfg = resolved.config
  return {
    provider: cfg.provider,
    model: cfg.model,
    params: JSON.stringify([REQUEST_PARAMS, cfg.extraBody ?? null]),
    outputLimit: Math.max(
      REQUEST_PARAMS.max_tokens,
      ...[cfg.extraBody?.max_tokens, cfg.extraBody?.max_completion_tokens].filter(
        (n): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0,
      ),
    ),
    runner: {
      run: (messages, onText, signal) => streamChat(cfg, messages, { signal, onText }),
    },
    costText: (prompt, completion) => {
      if (cfg.provider !== 'deepseek') return '费用以服务商账单为准'
      const peak = deepseekPeak(new Date())
      return `估算 ¥${estimateCost(prompt, completion, peak).cny.toFixed(4)}${peak ? '（高峰价）' : ''}`
    },
  }
}
