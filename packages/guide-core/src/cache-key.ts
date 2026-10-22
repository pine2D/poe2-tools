import type { ProcessingIdentity } from './prepare'
import type { TermSpan } from './types'

export interface CacheKeyParts {
  text: string
  protectedText: string
  tokens: readonly string[]
  game: 'poe2'
  locale: 'zh-CN'
  dictHash: string
  terms: readonly TermSpan[]
  provider: string
  model: string
  params: string
  promptVersion: string
  processing?: ProcessingIdentity
  restoreTokens?: readonly string[]
}

// 原文相同但实体标记不同，也可能改变译文；占位位置与恢复内容一并参与缓存。
export async function cacheKey(p: CacheKeyParts): Promise<string> {
  const canonical = JSON.stringify([
    p.text.replace(/\s+/g, ' ').trim(),
    p.protectedText.replace(/\s+/g, ' ').trim(),
    p.tokens,
    p.restoreTokens ?? p.tokens,
    p.processing ?? null,
    p.game,
    p.locale,
    p.dictHash,
    p.terms
      .map((t) => `${t.entryId}:${t.en}=${t.zh}:${t.status}:${(t.candidates ?? []).join('/')}`)
      .join('|'),
    p.provider,
    p.model,
    p.params,
    p.promptVersion,
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
