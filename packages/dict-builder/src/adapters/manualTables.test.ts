import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseOverrideTable,
  parseStatOrder,
  parseStatWinners,
  parseVersions,
  toNamesTable,
} from './manualTables'

const overrides = fileURLToPath(new URL('../../../../data/dict/_overrides/', import.meta.url))
const read = (file: string): unknown => JSON.parse(readFileSync(`${overrides}${file}`, 'utf8'))

describe('parseOverrideTable', () => {
  it('入库的三张手工表都能解析且行数正确', () => {
    expect(
      Object.keys(parseOverrideTable('ascendancies', read('ascendancies.json')).entries),
    ).toHaveLength(23)
    expect(Object.keys(parseOverrideTable('classes', read('classes.json')).entries)).toHaveLength(8)
    expect(
      Object.keys(parseOverrideTable('inventories', read('inventories.json')).entries),
    ).toHaveLength(14)
  })
  it('升华表每行的 class 都在职业表里', () => {
    const asc = parseOverrideTable('ascendancies', read('ascendancies.json'))
    const classes = parseOverrideTable('classes', read('classes.json'))
    for (const row of Object.values(asc.entries)) {
      expect(classes.entries[row.class ?? '']).toBeDefined()
    }
  })
  it('缺列或非字符串时抛错并指出位置', () => {
    expect(() =>
      parseOverrideTable('x', {
        _meta: { note: '', updatedAt: '' },
        entries: { A: { en: 'a', 'zh-CN': 'b' } },
      }),
    ).toThrow('x.entries.A.zh-TW')
    expect(() => parseOverrideTable('x', { entries: {} })).toThrow('x._meta')
  })
})

describe('toNamesTable', () => {
  it('按 locale 取列', () => {
    const table = parseOverrideTable('ascendancies', read('ascendancies.json'))
    const zhCN = toNamesTable(table, 'zh-CN', '_overrides/ascendancies.json', '0.5')
    const zhTW = toNamesTable(table, 'zh-TW', '_overrides/ascendancies.json', '0.5.5')
    expect(zhCN.entries.Sorceress3).toBe('瓦拉煞的门徒')
    expect(zhTW.entries.Sorceress3).toBe('瓦拉什塔門徒')
    expect(zhCN._meta).toEqual({
      source: '_overrides/ascendancies.json',
      tier: 'manual',
      gameVersion: '0.5',
      fetchedAt: '2026-09-07',
      count: 23,
    })
  })
})

describe('versions 与 stat-order', () => {
  it('parseVersions 忽略 _meta 并要求字符串', () => {
    expect(parseVersions(read('versions.json'))).toEqual({
      en: '0.5.5',
      'zh-CN': '0.5.5',
      'zh-TW': '0.5.5',
    })
    expect(() => parseVersions({ 'zh-CN': 1 })).toThrow('zh-CN')
  })
  it('parseStatOrder 按 locale 分节并校验数字数组', () => {
    expect(parseStatOrder(read('stat-order.json'))).toEqual({ 'zh-CN': {}, 'zh-TW': {} })
    expect(parseStatOrder({ entries: { 'zh-CN': { 'a.b#0': [1, 0] } } })).toEqual({
      'zh-CN': { 'a.b#0': [1, 0] },
      'zh-TW': {},
    })
    expect(() => parseStatOrder({ entries: { 'zh-TW': { 'a.b': ['x'] } } })).toThrow('zh-TW.a.b')
  })
  it('parseStatWinners 按 locale 分节并校验字符串值', () => {
    expect(parseStatWinners(read('stat-winners.json'))).toEqual({
      'zh-CN': {
        '#% increased spirit': 'explicit.stat_1416406066',
        '#% of armour also applies to lightning damage': 'rune.stat_2200571612',
      },
      'zh-TW': {
        '#% of armour also applies to lightning damage': 'rune.stat_2200571612',
        '#% increased attack speed per # dexterity': 'explicit.stat_720908147',
      },
    })
    expect(
      parseStatWinners({ entries: { 'zh-CN': { '#% increased spirit': 'b.second' } } }),
    ).toEqual({
      'zh-CN': { '#% increased spirit': 'b.second' },
      'zh-TW': {},
    })
    expect(() => parseStatWinners({ entries: { 'zh-TW': { k: 1 } } })).toThrow('zh-TW.k')
    expect(() => parseStatWinners({})).toThrow('entries')
  })
})
