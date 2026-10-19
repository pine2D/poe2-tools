import { describe, expect, it } from 'vitest'
import { checkTranslation } from './check'
import { createMatcher } from './matcher'
import { chunkBlocks, prepareBlock, sendable } from './prepare'
import { buildMessages } from './prompt'
import type { GuideDictionary } from './types'
import { restore } from './verbatim'

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
    expect(b.protectedText).toBe('Cast Contagion for ⟦0⟧ more ES. REGEX: ⟦1⟧')
    expect(b.tokens).toEqual(['30%', '"a|b"'])
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

// 这些断言捕获数字仍暴露给翻译模型、保护范围误吞术语，以及还原缺失未提示。
describe('数字保真', () => {
  it('保护带符号、小数、千位分隔、缩写与范围的完整数值，并可按原样恢复', () => {
    const source = 'Keep -12.5%, +8.3K, 300,000+, 40-70k, 20%–30%, and −2; Act 2.'
    const b = prepareBlock({ id: 'n', kind: 'paragraph', text: source }, matcher)
    expect(b.source).toBe(source)
    expect(b.tokens).toEqual(['-12.5%', '+8.3K', '300,000+', '40-70k', '20%–30%', '−2', '2'])
    expect(b.protectedText).toBe('Keep ⟦0⟧, ⟦1⟧, ⟦2⟧, ⟦3⟧, ⟦4⟧, and ⟦5⟧; Act ⟦6⟧.')
    expect(restore(b.protectedText, b.tokens)).toEqual({
      text: source,
      missing: [],
      duplicated: [],
    })
  })
  it('不拆开数字型名称和已确认术语中的数字', () => {
    const named = createMatcher({
      ...dict,
      entries: [
        ...dict.entries,
        { id: 'gem:2', en: 'Flame 2', zh: '火焰二', kind: 'gem', tier: 'gray' },
      ],
    })
    const b = prepareBlock(
      {
        id: 'n',
        kind: 'paragraph',
        text: 'Use Flame 2 at T15 with PoE2 notes, 3rd choice and 5-mod items.',
      },
      named,
    )
    expect(b.terms[0]?.zh).toBe('火焰二')
    expect(b.protectedText).toBe(
      'Use Flame 2 at T15 with PoE2 notes, 3rd choice and ⟦0⟧-mod items.',
    )
    expect(b.tokens).toEqual(['5'])
  })
  it('逐字片段与原文占位符不冲突，修饰词位置仍对应原文', () => {
    const source = 'Type ⟦0⟧; use `20% less Life` and 10% less Life; REGEX: "3|4"'
    const b = prepareBlock({ id: 'n', kind: 'paragraph', text: source }, matcher)
    expect(b.tokens).toEqual(['⟦0⟧', '`20% less Life`', '10%', '"3|4"'])
    expect(b.protectedText).toBe('Type ⟦0⟧; use ⟦1⟧ and ⟦2⟧ less Life; REGEX: ⟦3⟧')
    expect(buildMessages([b], 'X')[1]?.content).toContain('⟦2⟧ <m zh="总降">less</m> Life')
    expect(restore(b.protectedText, b.tokens).text).toBe(source)
  })
  it('数字占位缺失与重复沿用恢复后的核对提示，不静默丢弃', () => {
    const b = prepareBlock(
      { id: 'n', kind: 'paragraph', text: 'Keep 12 gold and 3 charges.' },
      matcher,
    )
    const restored = restore('保留 ⟦0⟧ 金币和 ⟦0⟧ 次充能。', b.tokens)
    expect(restored).toEqual({ text: '保留 12 金币和 12 次充能。', missing: [1], duplicated: [0] })
    expect(checkTranslation(b, restored.text, restored, 'stop').map((i) => i.kind)).toEqual([
      'number-mismatch',
      'placeholder',
    ])
  })
})

it('数值前导小数点、正负号和范围空白必须一起保护，避免恢复后改变数值', () => {
  const b = prepareBlock(
    {
      id: 'n',
      kind: 'paragraph',
      text: 'Gain .5%, ±5%, + 12.5 and 40 - 70k; lose -.25% or (10-20)%.',
    },
    matcher,
  )
  expect(b.tokens).toEqual(['.5%', '±5%', '+ 12.5', '40 - 70k', '-.25%', '(10-20)%'])
  expect(b.protectedText).toBe('Gain ⟦0⟧, ⟦1⟧, ⟦2⟧ and ⟦3⟧; lose ⟦4⟧ or ⟦5⟧.')
  expect(restore('获得 ⟦0⟧，损失 ⟦4⟧。', b.tokens).text).toBe('获得 .5%，损失 -.25%。')
})

it('未支持的数字后缀与点分名称不做半截保护', () => {
  const source = 'Deals 1.5x damage; use 10.5ms, A1.5b, 2,500ms and 12.5%.'
  const b = prepareBlock({ id: 'n', kind: 'paragraph', text: source }, matcher)
  expect(b.protectedText).toBe('Deals 1.5x damage; use 10.5ms, A1.5b, 2,500ms and ⟦0⟧.')
  expect(b.tokens).toEqual(['12.5%'])
})
