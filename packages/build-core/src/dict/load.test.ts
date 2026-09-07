import { describe, expect, it } from 'vitest'
import { miniBundle } from '../testing/miniDict'
import { buildDictIndex } from './index'
import { parseDictBundle } from './load'

describe('parseDictBundle', () => {
  it('miniBundle 的 JSON 往返能解析成功，索引与 miniIndex 等价', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(miniBundle))
    const result = parseDictBundle(roundTripped, 'zh-CN')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const index = buildDictIndex(result.bundle)
    expect(index.statsByKey.size).toBe(miniBundle.stats?.entries.length)
    expect(index.bases.size).toBe(Object.keys(miniBundle.items?.bases ?? {}).length)
    expect(index.uniques.size).toBe(Object.keys(miniBundle.items?.uniques ?? {}).length)
    expect(index.gems.size).toBe(Object.keys(miniBundle.gems?.entries ?? {}).length)
    expect(index.passives.size).toBe(Object.keys(miniBundle.passives?.entries ?? {}).length)
    expect(index.ascendancies.size).toBe(Object.keys(miniBundle.ascendancies?.entries ?? {}).length)
    expect(index.inventories.size).toBe(Object.keys(miniBundle.inventories?.entries ?? {}).length)
    expect(index.classes.size).toBe(Object.keys(miniBundle.classes?.entries ?? {}).length)
    // 抽样几条
    expect(index.statsByKey.get('# to maximum life')?.id).toBe('explicit.stat_life')
    expect(index.bases.get('Pyrophyte Staff')).toBe('炎种长杖')
    expect(index.uniques.get('Surefooted Sigil')).toBe('稳步印记')
  })

  it('根不是对象时返回 error', () => {
    const result = parseDictBundle([], 'zh-CN')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('表缺 _meta 时返回 error 且含表名', () => {
    const result = parseDictBundle({ stats: { entries: [] } }, 'zh-CN')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('stats')
  })

  it('_meta.tier 非法时返回 error 且含表名', () => {
    const result = parseDictBundle(
      {
        stats: {
          _meta: { source: 't', tier: 'nope', gameVersion: '0', fetchedAt: '2026-09-07', count: 0 },
          entries: [],
        },
      },
      'zh-CN',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('stats')
  })

  it('entries[k].text 非字符串时返回 error 且含表名', () => {
    const result = parseDictBundle(
      {
        stats: {
          _meta: {
            source: 't',
            tier: 'manual',
            gameVersion: '0',
            fetchedAt: '2026-09-07',
            count: 1,
          },
          entries: [{ id: 'a', en: 'A', text: 123 }],
        },
      },
      'zh-CN',
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('stats')
  })

  it('classes 表按 NamesTable 校验', () => {
    const bad = parseDictBundle(
      {
        classes: {
          _meta: {
            source: 't',
            tier: 'manual',
            gameVersion: '0',
            fetchedAt: '2026-09-07',
            count: 1,
          },
          entries: { Witch: 1 },
        },
      },
      'zh-CN',
    )
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error).toContain('classes')
  })
})
