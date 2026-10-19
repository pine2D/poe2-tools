import { describe, expect, it } from 'vitest'
import { type CacheKeyParts, cacheKey } from './cache-key'
import { PROMPT_VERSION } from './prompt'
import type { TermSpan } from './types'

const base: CacheKeyParts = {
  text: 'Cast  Contagion\n',
  game: 'poe2',
  locale: 'zh-CN',
  dictHash: 'abc',
  terms: [
    {
      start: 5,
      end: 14,
      en: 'Contagion',
      zh: '瘟疫',
      entryId: 'gem:C',
      tier: 'gray',
      status: 'confirmed',
    },
  ],
  provider: 'deepseek',
  model: 'deepseek-flash',
  params: 't0.2',
  promptVersion: 'guide-v1',
}

describe('cacheKey', () => {
  it('64 位十六进制，空白差异不影响', async () => {
    const k = await cacheKey(base)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
    expect(await cacheKey({ ...base, text: 'Cast Contagion' })).toBe(k)
  })
  it('词典、术语、模型、参数、提示词版本任一变化即变化', async () => {
    const k = await cacheKey(base)
    const variants: Partial<CacheKeyParts>[] = [
      { dictHash: 'abd' },
      { terms: [{ ...(base.terms[0] as TermSpan), zh: '传染' }] },
      { terms: [{ ...(base.terms[0] as TermSpan), status: 'hint' }] },
      { model: 'other' },
      { params: 't0.3' },
      { promptVersion: 'guide-v2' },
      { provider: 'custom' },
    ]
    for (const v of variants) expect(await cacheKey({ ...base, ...v })).not.toBe(k)
  })
})

it('数字保护启用后不读取旧 guide-v5 译文缓存', async () => {
  const old = await cacheKey({ ...base, text: 'Keep 300,000+ gold.', promptVersion: 'guide-v5' })
  const current = await cacheKey({
    ...base,
    text: 'Keep 300,000+ gold.',
    promptVersion: PROMPT_VERSION,
  })
  expect(current).not.toBe(old)
})
