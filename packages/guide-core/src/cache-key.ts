import type { TermSpan } from './types'

export interface CacheKeyParts {
  text: string
  game: 'poe2'
  locale: 'zh-CN'
  dictHash: string
  terms: readonly TermSpan[]
  provider: string
  model: string
  params: string
  promptVersion: string
}

// 任何会改变译文的因素都进缓存键：原文、词典版本、本段术语、服务与参数、提示词版本。
export async function cacheKey(p: CacheKeyParts): Promise<string> {
  const canonical = JSON.stringify([
    p.text.replace(/\s+/g, ' ').trim(),
    p.game,
    p.locale,
    p.dictHash,
    p.terms.map((t) => `${t.en}=${t.zh}:${t.status}:${(t.candidates ?? []).join('/')}`).join('|'),
    p.provider,
    p.model,
    p.params,
    p.promptVersion,
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
