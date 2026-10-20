import { describe, expect, it } from 'vitest'
import { buildStatCatalog, type CanonicalDecision } from './statCatalog'
import { parseTrade2Stats } from './trade2Stats'

const response = (texts: string[]) =>
  parseTrade2Stats({
    result: [
      {
        id: 'explicit',
        label: 'Explicit',
        entries: texts.map((text, i) => ({ id: `explicit.${i}`, text, type: 'explicit' })),
      },
    ],
  })
const input = {
  en: response([
    '#% increased Spirit',
    '#% increased Spirit',
    'Recover #% of Life every 4 seconds',
  ]),
  target: response(['该装备精魂提高 #%', '精魂提高 #%', '每 4 秒回复 #% 生命']),
  locale: 'zh-CN' as const,
  orderOverrides: {},
  sources: [
    {
      locale: 'en',
      url: 'https://example.org/en',
      sha256: 'a'.repeat(64),
      fetchedAt: '2026-10-20',
      gameVersion: 'unknown',
    },
    {
      locale: 'zh-CN',
      url: 'https://example.org/cn',
      sha256: 'b'.repeat(64),
      fetchedAt: '2026-10-20',
      gameVersion: 'unknown',
    },
  ],
}
const decision: CanonicalDecision = {
  en: '#% increased Spirit',
  sourceId: 'explicit.1',
  reason: '展示无局部语境时用通用译文；局部原文保留供反向导入。',
}

describe('扩展原始词缀契约', () => {
  it('保留两侧快照、固定条件及显式裁决，不删除另一语境', () => {
    const catalog = buildStatCatalog({ ...input, decisions: [decision] })
    expect(catalog._meta.sources).toEqual(input.sources)
    expect(catalog._meta.decisions).toEqual([decision])
    expect(catalog.entries).toContainEqual({
      id: 'explicit.2',
      en: 'Recover #% of Life every 4 seconds',
      text: '每 4 秒回复 #% 生命',
    })
    expect(catalog.entries.filter((e) => e.preferred).map((e) => e.id)).toEqual(['explicit.1'])
    expect(catalog.entries.some((e) => e.text === '该装备精魂提高 #%')).toBe(true)
    expect(catalog.audit.unresolved).toEqual([])
  })

  it('未审定的冲突不依赖数组顺序默选', () => {
    const catalog = buildStatCatalog({ ...input, decisions: [] })
    expect(catalog.entries.every((e) => !e.preferred)).toBe(true)
    expect(catalog.audit.unresolved).toEqual([
      { en: '#% increased spirit', sourceIds: ['explicit.0', 'explicit.1'] },
    ])
  })

  it('失效、重复或无理由的裁决阻断生成', () => {
    expect(() =>
      buildStatCatalog({ ...input, decisions: [{ ...decision, sourceId: 'missing' }] }),
    ).toThrow('裁决')
    expect(() => buildStatCatalog({ ...input, decisions: [decision, decision] })).toThrow('裁决')
    expect(() => buildStatCatalog({ ...input, decisions: [{ ...decision, reason: '' }] })).toThrow(
      '裁决',
    )
  })

  it('没有独立目标语言快照不能生成，错误哈希也不能冒充溯源', () => {
    expect(() =>
      buildStatCatalog({ ...input, sources: input.sources.slice(0, 1), decisions: [] }),
    ).toThrow('快照')
    expect(() =>
      buildStatCatalog({
        ...input,
        sources: input.sources.map((s) => ({ ...s, sha256: '' })),
        decisions: [],
      }),
    ).toThrow('快照')
  })
})
