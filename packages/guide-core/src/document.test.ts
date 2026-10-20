import { describe, expect, it } from 'vitest'
import { parseExtractResult, parseGuideDocument } from './document'

const valid = {
  version: 1,
  game: 'poe2',
  targetLocale: 'zh-CN',
  source: {
    url: 'https://example.com/guide',
    title: 'Guide',
    siteId: 'generic',
    extractedAt: '2026-10-07T00:00:00.000Z',
    scope: 'full',
  },
  stages: [{ id: 's1', name: 'Act 1', current: true }],
  blocks: [
    { id: 'b0', kind: 'heading', text: 'Intro' },
    {
      id: 'b1',
      kind: 'paragraph',
      text: 'Use Contagion.',
      stageId: 's1',
      entities: [[4, 13]],
      emphasis: [],
    },
  ],
}

describe('parseGuideDocument', () => {
  it('接受合法文档并原样返回字段', () => {
    expect(parseGuideDocument(valid)).toEqual(valid)
  })
  it('拒绝非 PoE2、非 zh-CN、未知版本', () => {
    expect(parseGuideDocument({ ...valid, game: 'poe1' })).toBeNull()
    expect(parseGuideDocument({ ...valid, targetLocale: 'zh-TW' })).toBeNull()
    expect(parseGuideDocument({ ...valid, version: 2 })).toBeNull()
  })
  it('拒绝重复块 id、未知 kind、越界范围、空文本', () => {
    const dup = { ...valid, blocks: [valid.blocks[0], valid.blocks[0]] }
    expect(parseGuideDocument(dup)).toBeNull()
    const kind = { ...valid, blocks: [{ id: 'x', kind: 'script', text: 'a' }] }
    expect(parseGuideDocument(kind)).toBeNull()
    const range = {
      ...valid,
      blocks: [{ id: 'x', kind: 'paragraph', text: 'abc', entities: [[1, 9]] }],
    }
    expect(parseGuideDocument(range)).toBeNull()
    const empty = { ...valid, blocks: [{ id: 'x', kind: 'paragraph', text: '   ' }] }
    expect(parseGuideDocument(empty)).toBeNull()
  })
  it('块的 stageId 必须指向已声明的阶段', () => {
    const bad = { ...valid, blocks: [{ id: 'x', kind: 'paragraph', text: 'a', stageId: 'nope' }] }
    expect(parseGuideDocument(bad)).toBeNull()
  })
  it('超过 5000 块或单块超过 20000 字符时拒绝', () => {
    const many = {
      ...valid,
      blocks: Array.from({ length: 5001 }, (_, i) => ({
        id: `b${i}`,
        kind: 'paragraph',
        text: 'a',
      })),
    }
    expect(parseGuideDocument(many)).toBeNull()
    const long = { ...valid, blocks: [{ id: 'x', kind: 'paragraph', text: 'a'.repeat(20001) }] }
    expect(parseGuideDocument(long)).toBeNull()
  })
  it('丢弃未知多余字段', () => {
    const extra = {
      ...valid,
      secret: 'x',
      blocks: [{ id: 'b0', kind: 'heading', text: 'Intro', html: '<b>' }],
    }
    expect(parseGuideDocument(extra)).toEqual({
      ...valid,
      blocks: [{ id: 'b0', kind: 'heading', text: 'Intro' }],
    })
  })
  it('回退标记只认 true', () => {
    const source = (fallback: unknown) => ({ ...valid, source: { ...valid.source, fallback } })
    expect(parseGuideDocument(source(true))?.source.fallback).toBe(true)
    expect(parseGuideDocument(source('yes'))?.source).toEqual(valid.source)
  })
})

describe('parseExtractResult', () => {
  it('识别成功与三种失败原因', () => {
    expect(parseExtractResult({ ok: true, doc: valid })).toEqual({ ok: true, doc: valid })
    expect(parseExtractResult({ ok: false, reason: 'coe' })).toEqual({ ok: false, reason: 'coe' })
    expect(parseExtractResult({ ok: false, reason: 'other' })).toBeNull()
    expect(parseExtractResult(undefined)).toBeNull()
  })
})

it('验证结构元数据、保护范围与诊断，不接收伪造的跨范围标题引用', () => {
  const block = {
    id: 'b1',
    kind: 'paragraph',
    text: 'Life code',
    breaks: [5],
    verbatim: [[5, 9]],
    context: { headingIds: ['b0'], listId: 'l1' },
    truncated: true,
  }
  const input = {
    ...valid,
    blocks: [valid.blocks[0], block],
    diagnostics: [{ kind: 'text-truncated', blockId: 'b1' }],
  }
  expect(parseGuideDocument(input)).toEqual(input)
  for (const extra of [
    { breaks: [99] },
    { verbatim: [[3, 99]] },
    { context: { headingIds: ['outside'] } },
    { context: { column: -1 } },
  ]) {
    expect(
      parseGuideDocument({ ...valid, blocks: [valid.blocks[0], { ...block, ...extra }] }),
    ).toBeNull()
  }
})
