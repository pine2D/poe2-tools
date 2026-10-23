import { describe, expect, it } from 'vitest'
import { type CacheKeyParts, cacheKey } from './cache-key'
import { PROMPT_VERSION } from './prompt'
import type { TermSpan } from './types'

const base: CacheKeyParts = {
  text: 'Cast  Contagion\n',
  protectedText: 'Cast  Contagion\n',
  tokens: [],
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
  it('术语类型只影响侧栏显示，不改变缓存键，旧缓存继续命中', async () => {
    const k = await cacheKey(base)
    expect(
      await cacheKey({ ...base, terms: [{ ...(base.terms[0] as TermSpan), kind: 'gem' }] }),
    ).toBe(k)
  })
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

it('相同原文的实体保护位置与恢复内容参与缓存键', async () => {
  const common = { ...base, text: 'Use Unknown Crown or Unknown Crown.', terms: [] }
  const plain = await cacheKey({ ...common, protectedText: common.text, tokens: [] })
  const first = await cacheKey({
    ...common,
    protectedText: 'Use ⟦0⟧ or Unknown Crown.',
    tokens: ['Unknown Crown'],
  })
  const last = await cacheKey({
    ...common,
    protectedText: 'Use Unknown Crown or ⟦0⟧.',
    tokens: ['Unknown Crown'],
  })
  expect(new Set([plain, first, last]).size).toBe(3)
  expect(
    await cacheKey({
      ...common,
      protectedText: 'Use ⟦0⟧ or Unknown Crown.',
      tokens: ['Unknown  Crown'],
    }),
  ).not.toBe(first)
})

it('未知实体保护启用后不复用 guide-v6 旧结果', async () => {
  expect(await cacheKey({ ...base, promptVersion: PROMPT_VERSION })).not.toBe(
    await cacheKey({ ...base, promptVersion: 'guide-v6' }),
  )
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

it('角色、实体、规则、引用恢复与语境都参与缓存，排除未消费的 UI/TW 数据', async () => {
  const processing = {
    kind: 'paragraph' as const,
    entities: [],
    emphasis: [],
    verbatim: [],
    breaks: [],
    rules: { route: 'r1', matcher: 'm1', checker: 'c1', context: 'x1', stats: 's1' },
    contextFingerprint: 'ctx1',
  }
  const key = await cacheKey({ ...base, processing, restoreTokens: [] })
  const variants = [
    { ...processing, kind: 'list-item' as const },
    { ...processing, entities: [[0, 3]] as const },
    { ...processing, rules: { ...processing.rules, checker: 'c2' } },
    { ...processing, contextFingerprint: 'ctx2' },
    { ...processing, rules: { ...processing.rules, stats: 's2' } },
  ]
  for (const next of variants)
    expect(await cacheKey({ ...base, processing: next, restoreTokens: [] })).not.toBe(key)
  expect(await cacheKey({ ...base, processing, restoreTokens: ['目标'] })).not.toBe(key)
  expect(
    await cacheKey({
      ...base,
      processing,
      restoreTokens: [],
      uiHash: 'other',
      twHash: 'other',
    } as CacheKeyParts),
  ).toBe(key)
})
