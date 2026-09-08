import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  lookupName,
  mergeLists,
  newJoinAudit,
  parseListPage,
  slugOf,
  unescapeHtml,
} from './poe2dbList'

const fixtures = fileURLToPath(new URL('../../fixtures/', import.meta.url))
const page = (file: string): string => readFileSync(`${fixtures}${file}`, 'utf8')

describe('slugOf', () => {
  it('删撇号与逗号、空白折成下划线、连字符与非 ASCII 保留', () => {
    expect(slugOf("Beira's Anguish")).toBe('Beiras_Anguish')
    expect(slugOf('Kelari, the Tainted Sands')).toBe('Kelari,_the_Tainted_Sands')
    expect(slugOf('Ice-Tipped Arrows')).toBe('Ice-Tipped_Arrows')
    expect(slugOf('Mjölner')).toBe('Mjölner')
    expect(slugOf('  Two  Spaces ')).toBe('Two_Spaces')
    expect(slugOf('Mórrigan’s Insight')).toBe('Mórrigans_Insight')
  })
})

describe('unescapeHtml', () => {
  it('还原命名实体与十进制 / 十六进制数字实体', () => {
    expect(unescapeHtml('&#39;a&amp;b&#246;&#xe9;&quot;')).toBe('\'a&böé"')
    expect(unescapeHtml('&unknown;')).toBe('&unknown;')
  })
})

describe('parseListPage', () => {
  it('宝石页：只取带文本的 gem_* 锚点，去掉 /lang/ 前缀并解码 percent 编码，重复同文本不算冲突', () => {
    const us = parseListPage(page('poe2db-list-gem-us.html'), 'gem')
    expect([...us.names.entries()]).toEqual([
      ['Flameblast', 'Flameblast'],
      ['Considered_Casting', 'Considered Casting'],
      ['Mórrigans_Insight', "Mórrigan's Insight"],
      ['Unleash', 'Unleash'],
      ['Coming_Soon', 'Coming Soon'],
      ['Renamed_Gem', 'Renamed Gem Two'],
      ['Only_English', 'Only English'],
    ])
    expect(us.conflicts).toEqual([])
    const cn = parseListPage(page('poe2db-list-gem-cn.html'), 'gem')
    expect(cn.names.get('Mórrigans_Insight')).toBe('莫丽根的洞察')
    expect(cn.names.size).toBe(6)
  })

  it('传奇页：取 uniqueName，跳过图标锚点，实体还原', () => {
    const us = parseListPage(page('poe2db-list-unique-us.html'), 'unique')
    expect([...us.names.entries()]).toEqual([
      ['Beiras_Anguish', "Beira's Anguish"],
      ['The_Fall_of_the_Axe', 'The Fall of the Axe'],
      ['Mjölner', 'Mjölner'],
    ])
    expect(
      parseListPage(page('poe2db-list-unique-cn.html'), 'unique').names.get('Beiras_Anguish'),
    ).toBe('贝拉的苦楚')
  })

  it('分类页：相对路径 href，只取 whiteitem 锚点', () => {
    const us = parseListPage(page('poe2db-list-base-us.html'), 'base')
    expect([...us.names.entries()]).toEqual([
      ['Cryptic_Crown', 'Cryptic Crown'],
      ['Runeforged_Cryptic_Crown', 'Runeforged Cryptic Crown'],
      ['Commander_Gauntlets', 'Commander Gauntlets'],
    ])
    expect(parseListPage(page('poe2db-list-base-cn.html'), 'base').names.get('Cryptic_Crown')).toBe(
      '隐秘之冠',
    )
  })

  it('同一 slug 出现不同文本记入 conflicts，保留先出现的', () => {
    const html =
      '<a class="gem_red" href="/cn/X">甲</a><a class="gem_red" href="/cn/X">乙</a><a class="gem_red" href="/cn/X">甲</a>'
    const parsed = parseListPage(html, 'gem')
    expect(parsed.names.get('X')).toBe('甲')
    expect(parsed.conflicts).toEqual(['X'])
  })

  it('软 404 页面解析不到任何条目', () => {
    expect(parseListPage(page('poe2db-list-empty.html'), 'base').names.size).toBe(0)
  })
})

describe('mergeLists', () => {
  it('合并多页，跨页同 slug 不同文本记冲突', () => {
    const a = {
      names: new Map([
        ['A', '甲'],
        ['B', '乙'],
      ]),
      conflicts: ['Z'],
    }
    const b = {
      names: new Map([
        ['B', '丙'],
        ['C', '丁'],
      ]),
      conflicts: [],
    }
    const merged = mergeLists([a, b])
    expect([...merged.names.entries()]).toEqual([
      ['A', '甲'],
      ['B', '乙'],
      ['C', '丁'],
    ])
    expect(merged.conflicts).toEqual(['Z', 'B'])
  })
})

describe('lookupName', () => {
  const en = new Map([
    ['Flameblast', 'Flameblast'],
    ['Renamed_Gem', 'Renamed Gem Two'],
    ['Only_English', 'Only English'],
    ['Same', 'Same'],
  ])
  const target = new Map([
    ['Flameblast', '烈焰爆破'],
    ['Renamed_Gem', '改名宝石'],
    ['Same', 'Same'],
  ])

  it('us 页英文名相等且目标页有文本才采纳，其余分别计数', () => {
    const audit = newJoinAudit()
    expect(lookupName('Flameblast', en, target, audit)).toBe('烈焰爆破')
    expect(lookupName('Not There', en, target, audit)).toBeNull()
    expect(lookupName('Renamed Gem', en, target, audit)).toBeNull()
    expect(lookupName('Only English', en, target, audit)).toBeNull()
    expect(lookupName('Same', en, target, audit)).toBe('Same')
    expect(audit).toEqual({
      candidates: 5,
      joined: 2,
      missingInEn: 1,
      enMismatch: ['Renamed_Gem: Renamed Gem ≠ Renamed Gem Two'],
      missingInTarget: 1,
      sameAsEn: 1,
    })
  })
})
