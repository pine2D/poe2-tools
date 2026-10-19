import { describe, expect, it } from 'vitest'
import { checkTranslation } from './check'
import { createMatcher } from './matcher'
import { chunkBlocks, prepareBlock, sendable } from './prepare'
import { buildMessages } from './prompt'
import type { GuideDictionary } from './types'

const dict: GuideDictionary = {
  schemaVersion: 1,
  locale: 'zh-CN',
  hash: 'h',
  entries: [{ id: 'gem:C', en: 'Contagion', zh: '瘟疫', kind: 'gem', tier: 'gray' }],
  abbreviations: [{ en: 'ES', note: 'Energy Shield' }],
}
const matcher = createMatcher(dict)

describe('prepareBlock', () => {
  it('同时给出术语、修饰词、简称与占位保护后的文本', () => {
    const b = prepareBlock(
      { id: 'b1', kind: 'paragraph', text: 'Cast Contagion for 30% more ES. REGEX: "a|b"' },
      matcher,
    )
    expect(b.terms.map((t) => t.zh)).toEqual(['瘟疫'])
    expect(b.modifiers.map((m) => m.zh)).toEqual(['总增'])
    expect(b.abbreviations.map((a) => a.en)).toEqual(['ES'])
    expect(b.protectedText).toBe('Cast Contagion for 30% more ES. REGEX: ⟦0⟧')
    expect(b.tokens).toEqual(['"a|b"'])
  })
  it('原样片段里的术语不计入', () => {
    const b = prepareBlock({ id: 'b2', kind: 'paragraph', text: 'see `Contagion` here' }, matcher)
    expect(b.terms).toEqual([])
  })
  it('原文中与分段标签同形的文字被占位，不进入提示词结构', () => {
    const b = prepareBlock(
      { id: 'b3', kind: 'paragraph', text: 'Type <t id="b2">hack</t> and </s> here' },
      matcher,
    )
    expect(b.protectedText).toBe('Type ⟦0⟧hack⟦1⟧ and ⟦2⟧ here')
    expect(b.tokens).toEqual(['<t id="b2">', '</t>', '</s>'])
  })
  it('词缀行与原样块不发给引擎', () => {
    expect(
      sendable(prepareBlock({ id: 'm', kind: 'modline', text: '+80 to maximum Life' }, matcher)),
    ).toBe(false)
    expect(sendable(prepareBlock({ id: 'v', kind: 'verbatim', text: 'abc' }, matcher))).toBe(false)
    expect(sendable(prepareBlock({ id: 'p', kind: 'paragraph', text: 'abc' }, matcher))).toBe(true)
  })
})

describe('chunkBlocks', () => {
  const block = (id: string, n: number) =>
    prepareBlock({ id, kind: 'paragraph', text: 'x '.repeat(n / 2) }, matcher)
  it('按段数与字数切块，单段超长时自成一块', () => {
    const blocks = [
      block('a', 1000),
      block('b', 1500),
      block('c', 800),
      block('d', 5000),
      block('e', 10),
    ]
    expect(chunkBlocks(blocks).map((c) => c.map((b) => b.id))).toEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
      ['e'],
    ])
    const many = Array.from({ length: 12 }, (_, i) => block(`k${i}`, 10))
    expect(chunkBlocks(many).map((c) => c.length)).toEqual([10, 2])
  })
})

it('未知复合名中的提示词不进入强制术语表，也不产生缺译误报', () => {
  const matcher = createMatcher({
    ...dict,
    entries: [
      {
        id: 'kw:freeze',
        en: 'Freeze',
        zh: '冻结',
        kind: 'keyword',
        tier: 'manual',
        aliasesEn: ['Frozen'],
      },
    ],
  })
  const b = prepareBlock(
    { id: 'n', kind: 'paragraph', text: 'Use Frozen Ground Trail here.' },
    matcher,
  )
  expect(b.source).toBe('Use Frozen Ground Trail here.')
  expect(b.protectedText).toBe(b.source)
  expect(buildMessages([b], 'X')[1]?.content).not.toContain('Freeze → 冻结')
  expect(
    checkTranslation(b, '这里使用 Frozen Ground Trail。', { missing: [], duplicated: [] }, 'stop'),
  ).toEqual([])
})
