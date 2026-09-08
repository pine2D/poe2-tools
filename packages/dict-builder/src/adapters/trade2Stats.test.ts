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
    // 不带 #k 的键作用于第 0 个变体；带 #1 的键只作用于第 1 个变体；stat_nope 覆盖表里没有对应条目
    orderOverrides: {
      'explicit.stat_recover': [1, 0],
      'explicit.stat_strongbox#1': [0],
      'explicit.stat_nope': [0],
    },
    winners: {},
    meta,
  })

  it('按 id 对齐、剥离后缀，同键同译文的跨组重复只留一条，pseudo 组整组跳过，多行词条折成单行', () => {
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
      {
        id: 'explicit.stat_literal',
        en: 'Recover #% of Life every 4 seconds',
        text: '每 4 秒回复 #% 生命',
      },
    ])
    expect(dict._meta).toEqual({ ...meta, tier: 'primary', count: 6 })
  })

  it('审计计数', () => {
    expect(audit).toEqual({
      enIds: 8,
      targetIds: 7,
      joined: 6,
      missingInTarget: 1,
      groupMismatch: 0,
      placeholderMismatch: ['explicit.stat_charm_slot#0'],
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
      excludedEntries: 1,
      literalNumber: 1,
      literalNumberIds: [
        {
          key: 'explicit.stat_literal#0',
          en: 'Recover #% of Life every 4 seconds',
          text: '每 4 秒回复 #% 生命',
        },
      ],
      untranslatedSameAsEn: 0,
      untranslatedDemoted: 0,
      unusedOrderKeys: ['explicit.stat_nope'],
      unusedWinnerKeys: [],
    })
  })
})

describe('buildStatsDict：winners 仲裁同键冲突', () => {
  const enTwo = parseTrade2Stats({
    result: [
      {
        id: 'explicit',
        label: 'Explicit',
        entries: [
          { id: 'a.first', text: '#% increased Spirit', type: 'explicit' },
          { id: 'b.second', text: '#% increased Spirit', type: 'explicit' },
        ],
      },
    ],
  })
  const zhTwo = parseTrade2Stats({
    result: [
      {
        id: 'explicit',
        label: '固定',
        entries: [
          { id: 'a.first', text: '本装备精魂提高 #%', type: 'explicit' },
          { id: 'b.second', text: '精魂提高 #%', type: 'explicit' },
        ],
      },
    ],
  })

  it('winners 命中时把指定 id 移到同一模板键最前', () => {
    const { dict, audit } = buildStatsDict({
      en: enTwo,
      target: zhTwo,
      locale: 'zh-CN',
      orderOverrides: {},
      winners: { '#% increased spirit': 'b.second' },
      meta,
    })
    expect(dict.entries.map((e) => e.id)).toEqual(['b.second', 'a.first'])
    expect(audit.unusedWinnerKeys).toEqual([])
  })

  it('winners 键找不到对应条目时记入 unusedWinnerKeys', () => {
    const { audit } = buildStatsDict({
      en: enTwo,
      target: zhTwo,
      locale: 'zh-CN',
      orderOverrides: {},
      winners: { nokey: 'x' },
      meta,
    })
    expect(audit.unusedWinnerKeys).toEqual(['nokey'])
  })
})

describe('buildStatsDict：同键未翻译条目降位', () => {
  const en = parseTrade2Stats({
    result: [
      {
        id: 'explicit',
        label: 'Explicit',
        entries: [
          { id: 'opt.value', text: 'Eldritch Battery', type: 'explicit' },
          { id: 'keystone.real', text: 'Eldritch Battery', type: 'explicit' },
          { id: 'lonely.same', text: 'Only English', type: 'explicit' },
        ],
      },
    ],
  })
  const zh = parseTrade2Stats({
    result: [
      {
        id: 'explicit',
        label: '固定',
        entries: [
          { id: 'opt.value', text: 'Eldritch Battery', type: 'explicit' },
          { id: 'keystone.real', text: '异能魔力', type: 'explicit' },
          { id: 'lonely.same', text: 'Only English', type: 'explicit' },
        ],
      },
    ],
  })

  it('未翻译条目排到有译文的同键条目之后；没有同键译文的未翻译条目原地不动', () => {
    const { dict, audit } = buildStatsDict({
      en,
      target: zh,
      locale: 'zh-CN',
      orderOverrides: {},
      winners: {},
      meta,
    })
    expect(dict.entries.map((e) => e.id)).toEqual(['keystone.real', 'lonely.same', 'opt.value'])
    expect(audit.untranslatedDemoted).toBe(1)
    expect(audit.untranslatedSameAsEn).toBe(2)
  })
})
