import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildStatsDict, parseTrade2Stats } from './trade2Stats'

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url))
const en = parseTrade2Stats(JSON.parse(readFileSync(`${fixtures}trade2-stats-en.json`, 'utf8')))
const zh = parseTrade2Stats(JSON.parse(readFileSync(`${fixtures}trade2-stats-zh-CN.json`, 'utf8')))
const meta = { source: 'trade2', gameVersion: '0.5', fetchedAt: '2026-09-07T00:00:00Z' }

describe('parseTrade2Stats', () => {
  it('拒绝不合法形态并指出位置', () => {
    expect(() =>
      parseTrade2Stats({ result: [{ id: 'x', label: 'x', entries: [{ id: 1 }] }] }),
    ).toThrow('result[0].entries[0].id')
    expect(() => parseTrade2Stats({})).toThrow('result')
  })
})

describe('buildStatsDict', () => {
  const { dict, audit } = buildStatsDict({
    en,
    target: zh,
    locale: 'zh-CN',
    // 不带 #k 的键作用于第 0 个变体；带 #1 的键只作用于第 1 个变体
    orderOverrides: { 'explicit.stat_recover': [1, 0], 'explicit.stat_strongbox#1': [0] },
    meta,
  })

  it('按 id 对齐、剥离后缀，同键同译文的跨组重复只留一条', () => {
    expect(dict.entries).toEqual([
      { id: 'explicit.stat_life', en: '+# to maximum Life', text: '+# 最大生命' },
      { id: 'explicit.stat_armour_local', en: '#% increased Armour', text: '护甲提高 #%' },
      {
        id: 'explicit.stat_strongbox',
        en: 'Area contains an additional Strongbox',
        text: '区域内有一个额外的保险箱',
      },
      {
        id: 'explicit.stat_strongbox',
        en: 'Map contains # additional Strongboxes',
        text: '地图包含 # 个额外的保险箱',
        order: [0],
      },
      {
        id: 'explicit.stat_recover',
        en: 'Recover #% of Life over # seconds',
        text: '在 # 秒内回复 #% 生命',
        order: [1, 0],
      },
    ])
    expect(dict._meta).toEqual({ ...meta, tier: 'primary', count: 5 })
  })

  it('审计计数', () => {
    expect(audit).toEqual({
      enIds: 7,
      targetIds: 6,
      joined: 5,
      missingInTarget: 1,
      groupMismatch: 0,
      placeholderMismatch: ['pseudo.pseudo_desecrated#0'],
      duplicateIds: 1,
      multiPlaceholder: 1,
      multiPlaceholderIds: [
        {
          key: 'explicit.stat_recover#0',
          en: 'Recover #% of Life over # seconds',
          text: '在 # 秒内回复 #% 生命',
        },
      ],
      orderApplied: 2,
      residualSuffix: [],
      mergedSameText: 1,
    })
  })
})
