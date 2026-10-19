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
  it('译文额外重复原有数字时提示核对，不改写译文', () => {
    const block = prepareBlock(
      { id: 'b3', kind: 'paragraph', text: 'Prepare a 5-mod item.' },
      createMatcher(dict),
    )
    expect(checkTranslation(block, '准备一件 5 词缀物品。', ok, 'stop')).toEqual([])
    expect(checkTranslation(block, '第 5 阶段：准备一件 5 词缀物品。', ok, 'stop')).toEqual([
      { kind: 'number-mismatch', detail: '译文重复了原文数字：5' },
    ])
  })
  it('网址后紧跟中文标点或汉字不算新增网址', () => {
    expect(kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x，然后')).toEqual([])
    expect(kinds('施放瘟疫获得 30% 总增伤害，见 https://a.example/x。')).toEqual([])
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

it('标出模型残留的修饰词标记，允许原文逐字保护的同形标签', () => {
  expect(kinds('施放瘟疫获得 30% <M zh="总增">总增</M>伤害，见 https://a.example/x')).toContain(
    'placeholder',
  )
  expect(kinds('施放瘟疫获得 30% <m zh="总增">总增</m>伤害，见 https://a.example/x')).toContain(
    'placeholder',
  )
  const source = '<m zh="原样">示例</m>'
  const block = prepareBlock({ id: 'x', kind: 'paragraph', text: source }, createMatcher(dict))
  expect(checkTranslation(block, source, ok, 'stop')).toEqual([])
})
