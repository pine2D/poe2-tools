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
  signature: 'fd44cda36f522d5b0ac438c9cffd0adbf030572f9fe87612a6cea0b4c934acdb',
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

it('同来源 ID 的中文变化后旧裁决必须失效', () => {
  expect(() =>
    buildStatCatalog({
      ...input,
      target: response(['该装备精魂提高 #%', '精魂降低 #%', '每 4 秒回复 #% 生命']),
      decisions: [decision],
    }),
  ).toThrow('裁决')
})

it('裁决签名缺失或不匹配时不能继续沿用', () => {
  expect(() => buildStatCatalog({ ...input, decisions: [{ ...decision, signature: '' }] })).toThrow(
    '裁决',
  )
  expect(() =>
    buildStatCatalog({ ...input, decisions: [{ ...decision, signature: 'a'.repeat(64) }] }),
  ).toThrow('裁决')
})

it('相同中英文的占位顺序变化也要求重新审定', () => {
  const args = {
    ...input,
    en: response(['Gain # Life and # Mana', 'Gain # Life and # Mana']),
    target: response(['获得 # 生命和 # 魔力', '获得 # 点生命和 # 点魔力']),
    decisions: [
      {
        en: 'Gain # Life and # Mana',
        sourceId: 'explicit.1',
        signature: 'd8b4dd0d7f60b0a27b6ebc99bf6e3683ae08d53336e94a020cb9d4498c2bb744',
        reason: '自造数值顺序审定',
      },
    ],
  }
  expect(() => buildStatCatalog(args)).not.toThrow()
  expect(() => buildStatCatalog({ ...args, orderOverrides: { 'explicit.1': [1, 0] } })).toThrow(
    '裁决',
  )
})
