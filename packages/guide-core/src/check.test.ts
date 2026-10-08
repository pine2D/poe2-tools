import { describe, expect, it } from 'vitest'
import { checkTranslation } from './check'
import { createMatcher } from './matcher'
import { prepareBlock } from './prepare'
import type { GuideDictionary } from './types'

const dict: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h',
  entries: [{ id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' }],
  abbreviations: [],
}
const b = prepareBlock(
  {
    id: 'b1',
    kind: 'paragraph',
    text: 'Cast Contagion for 30% more damage, see https://a.example/x',
  },
  createMatcher(dict),
)
const ok: { missing: number[]; duplicated: number[] } = { missing: [], duplicated: [] }
const kinds = (out: string, restored = ok, finish: string | null = 'stop') =>
  checkTranslation(b, out, restored, finish).map((i) => i.kind)

describe('checkTranslation', () => {
  it('合格译文无问题', () => {
    expect(kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x')).toEqual([])
  })
  it('术语缺失、修饰词写错、数字不符', () => {
    expect(kinds('施放传染病获得 30% 额外伤害，见 https://a.example/x')).toEqual([
      'term-missing',
      'modifier',
    ])
    expect(kinds('施放瘟疫获得 3% 总增伤害，见 https://a.example/x')).toEqual(['number-mismatch'])
  })
  it('单位换算只作提示', () => {
    const big = prepareBlock(
      { id: 'b2', kind: 'paragraph', text: 'Over 36000 DPS' },
      createMatcher(dict),
    )
    expect(checkTranslation(big, '超过 3.6万 DPS', ok, 'stop').map((i) => i.kind)).toEqual([
      'number-unit',
    ])
  })
  it('新增网址、未翻译、截断、占位符问题', () => {
    expect(kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x https://evil.example')).toEqual(
      ['url-added'],
    )
    expect(kinds('Cast Contagion for 30% more damage, see https://a.example/x')).toContain(
      'untranslated',
    )
    expect(kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x', ok, 'length')).toEqual([
      'truncated',
    ])
    expect(
      kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x', { missing: [0], duplicated: [] }),
    ).toEqual(['placeholder'])
  })
})
