import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildItemsDict, parseTrade2Items } from './items'
import { parseListPage } from './poe2dbList'

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url))
const read = (file: string): string => readFileSync(`${fixtures}${file}`, 'utf8')
const names = parseTrade2Items(JSON.parse(read('trade2-items-en-mini.json')))
const lists = (kind: 'base' | 'unique') => ({
  en: parseListPage(read(`poe2db-list-${kind}-us.html`), kind).names,
  target: parseListPage(read(`poe2db-list-${kind}-cn.html`), kind).names,
})
const meta = { source: 'test', gameVersion: '0.5', fetchedAt: '2026-09-07T00:00:00Z' }

describe('parseTrade2Items', () => {
  it('基底取装备类分组的 type（含传奇条目的基底），传奇取 flags.unique 条目的 name，排序去重', () => {
    expect(names).toEqual({
      bases: [
        'Commander Gauntlets',
        'Cryptic Crown',
        'Dousing Charm',
        'Iron Ring',
        'Missing Helm',
        'Runeforged Cryptic Crown',
        'Silver Charm',
        'Slim Mace',
      ],
      uniques: ["Beira's Anguish", 'Lost Unique', 'Mjölner', 'The Fall of the Axe'],
    })
  })
  it('拒绝不合法形态并指出位置', () => {
    expect(() => parseTrade2Items({})).toThrow('result')
    expect(() => parseTrade2Items({ result: [{ id: 'armour', entries: [{}] }] })).toThrow(
      'result[0].entries[0].type',
    )
  })
})

describe('buildItemsDict', () => {
  const { dict, audit } = buildItemsDict({
    names,
    bases: lists('base'),
    uniques: lists('unique'),
    meta,
  })

  it('键为 trade2 英文规范名；列表页没有的不输出', () => {
    expect(dict.bases).toEqual({
      'Commander Gauntlets': '军官手甲',
      'Cryptic Crown': '隐秘之冠',
      'Runeforged Cryptic Crown': '符文隐秘之冠',
    })
    expect(dict.uniques).toEqual({
      "Beira's Anguish": '贝拉的苦楚',
      Mjölner: '姆约尔尼尔',
      'The Fall of the Axe': '落刃时刻',
    })
    expect(dict._meta).toEqual({ ...meta, tier: 'gray', count: 6 })
  })

  it('审计计数', () => {
    expect(audit.bases).toEqual({
      candidates: 8,
      joined: 3,
      missingInEn: 5,
      enMismatch: [],
      missingInTarget: 0,
      sameAsEn: 0,
    })
    expect(audit.uniques).toEqual({
      candidates: 4,
      joined: 3,
      missingInEn: 1,
      enMismatch: [],
      missingInTarget: 0,
      sameAsEn: 0,
    })
  })
})
