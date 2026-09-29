// 收字规则的单元用例（spec §7.3）
import { describe, expect, it } from 'vitest'
import {
  ASCII_PRINTABLE,
  type CharsetIO,
  chunk,
  enNames,
  nonAsciiChars,
  planShards,
  rankChars,
  shard0Chars,
  siteFixedChars,
  stripComments,
  unicodeRange,
  zhNames,
} from './charsets'

function memoryIO(files: Record<string, string>): CharsetIO {
  return {
    listFiles: (dir) => Object.keys(files).filter((path) => path.startsWith(`${dir}/`)),
    readText: (path) => {
      const text = files[path]
      if (text === undefined) throw new Error(`没有文件 ${path}`)
      return text
    },
  }
}

const dict = (
  locale: string,
  names: { base: string; unique: string; gem: string; passive: string },
) => ({
  [`data/dict/${locale}/items.json`]: JSON.stringify({
    _meta: { source: '元' },
    bases: { 'Iron Ring': names.base },
    uniques: { 'Blackheart Ö': names.unique },
  }),
  [`data/dict/${locale}/gems.json`]: JSON.stringify({
    entries: { a: { en: 'Fireball', text: names.gem } },
  }),
  [`data/dict/${locale}/passives.json`]: JSON.stringify({
    entries: { b: { en: 'Heart ó', text: names.passive } },
  }),
  [`data/dict/${locale}/ascendancies.json`]: JSON.stringify({ entries: { c: '锐眼' } }),
  [`data/dict/${locale}/classes.json`]: JSON.stringify({ entries: { d: '游侠' } }),
  [`data/dict/${locale}/inventories.json`]: JSON.stringify({ entries: { e: '武器1' } }),
})

const io = memoryIO({
  'apps/site/index.html': '<!-- 注释里 --><p>首页</p>',
  'apps/site/build/index.html': '<p>构筑</p>',
  'apps/site/extension/index.html': '<p>扩展</p>',
  'apps/site/src/pages/home/HomePage.tsx':
    '{/* 忽略 */}<p>少查译名</p>\n  // 整行说明\nconst a = 1 // 行尾保留',
  'apps/site/src/pages/home/HomePage.test.tsx': '<p>测试不扫</p>',
  'apps/site/src/shared/styles/site.css': '/* 样式 */ .a { content: "→"; }',
  'apps/site/src/shared/README.md': '不扫描的扩展名',
  ...dict('zh-CN', { base: '铁戒指', unique: '黑心', gem: '火球', passive: '心' }),
  ...dict('zh-TW', { base: '鐵戒指', unique: '黑心', gem: '火球', passive: '心' }),
})

describe('收字工具函数', () => {
  it('stripComments 删四种注释，保留行尾注释所在行的代码', () => {
    const out = stripComments('a/* x */b\n{/* y */}c\n<!-- z -->d\n  // 整行\ne // 尾')
    expect(out).toBe('ab\nc\nd\n\ne // 尾')
  })

  it('nonAsciiChars 只取码位 > U+007F 的非空白字符', () => {
    expect([...nonAsciiChars('ab 中　文→é\n')]).toEqual(['中', '文', '→', 'é'])
  })

  it('shard0Chars 含 95 个 ASCII 可打印字符，忽略注释行与空行', () => {
    expect(ASCII_PRINTABLE).toHaveLength(95)
    const chars = shard0Chars('# 注释\n\n构筑汉化\n打开 →\n')
    for (const ch of ASCII_PRINTABLE) expect(chars.has(ch)).toBe(true)
    expect(chars.has('构')).toBe(true)
    expect(chars.has('→')).toBe(true)
    expect(chars.has('注')).toBe(false)
    expect(chars.size).toBe(95 + 7)
  })

  it('rankChars 次数降序、码位升序；exclude 去掉；keep 中未出现的字计 0 次排末尾', () => {
    expect(rankChars(['乙甲', '甲', '甲', '丙'], new Set(['丙']), new Set(['丁', '乙']))).toEqual([
      '甲',
      '乙',
      '丁',
    ])
    // 名称先去重：重复的 '甲' 只算一次，'甲'(1) 与 '乙'(1) 同次数时按码位
    expect(rankChars(['甲', '甲', '乙'], new Set(), new Set())).toEqual(['乙', '甲'].sort())
  })

  it('chunk 默认 300 一片，最后一片是余数', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk(Array.from({ length: 601 }, (_, i) => i)).map((part) => part.length)).toEqual([
      300, 300, 1,
    ])
  })

  it('unicodeRange 按码位排序并压缩连续区间', () => {
    expect(unicodeRange(['丁', ' ', '…', '一', ...'!"#'])).toBe('U+20-23, U+2026, U+4E00-4E01')
  })
})

describe('名称与站点文案', () => {
  it('siteFixedChars 扫描三个目录的 ts/tsx/css 与三个 index.html，排除测试与注释', () => {
    const chars = siteFixedChars(io)
    for (const ch of '首页构筑扩展少查译名→行尾保留') expect(chars.has(ch), ch).toBe(true)
    for (const ch of '忽略整说明测试不扫描样式注释里') expect(chars.has(ch), ch).toBe(false)
  })

  it('zhNames 取六张表的名称字符串；enNames 取两个 locale 的英文名并去重', () => {
    expect(zhNames(io, 'zh-CN')).toEqual(['铁戒指', '黑心', '火球', '心', '锐眼', '游侠', '武器1'])
    expect(enNames(io).sort()).toEqual(['Blackheart Ö', 'Fireball', 'Heart ó', 'Iron Ring'])
  })
})

describe('planShards（契约 §3.7.3）', () => {
  const shards = planShards({
    shard0Text: '构筑汉化\n',
    level1: ['的', '一', '心', '是'],
    io,
    previous: null,
  })

  it('分片按固定顺序命名：shard0、站点、名称、常用字、繁体、Cinzel', () => {
    expect(shards.map((shard) => [shard.file, shard.group, shard.family, shard.weight])).toEqual([
      ['serif-sc-0.woff2', 'sc-fixed', 'PoE2 Serif SC', 700],
      ['serif-sc-1.woff2', 'sc-site', 'PoE2 Serif SC', 700],
      ['serif-sc-2.woff2', 'sc-names', 'PoE2 Serif SC', 700],
      ['serif-sc-common-0.woff2', 'sc-common', 'PoE2 Serif SC', 700],
      ['serif-tc-0.woff2', 'tc-names', 'PoE2 Serif TC', 700],
      ['cinzel.woff2', 'cinzel', 'PoE2 Cinzel', 400],
    ])
  })

  it('各组互不重叠：站点减 shard0，名称减站点，常用字减名称；TC 不含 ASCII；Cinzel 含 ASCII 与英文名的非 ASCII', () => {
    const byGroup = Object.fromEntries(shards.map((shard) => [shard.group, shard.chars]))
    expect(byGroup['sc-site']).not.toContain('构')
    expect(byGroup['sc-names']).toContain('铁')
    expect(byGroup['sc-names']).not.toContain('首')
    expect(byGroup['sc-common']).toEqual(['一', '是', '的'].sort())
    expect(byGroup['tc-names']).toContain('鐵')
    expect(byGroup['tc-names']).not.toContain('1')
    expect(byGroup.cinzel).toContain('Ö')
    expect(byGroup.cinzel).toContain('ó')
    expect(byGroup.cinzel?.length).toBe(95 + 2)
    for (const shard of shards) {
      expect(shard.chars).toEqual(
        [...shard.chars].sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0)),
      )
    }
  })

  it('覆盖只增不减：上次收过、这次词典里没有的字保留', () => {
    const again = planShards({
      shard0Text: '构筑汉化\n',
      level1: ['的', '一', '心', '是'],
      io,
      previous: {
        scNames: new Set(['旧']),
        scCommon: new Set(['昔']),
        tcNames: new Set(['舊']),
        cinzel: new Set(['é']),
      },
    })
    const byGroup = Object.fromEntries(again.map((shard) => [shard.group, shard.chars]))
    expect(byGroup['sc-names']).toContain('旧')
    expect(byGroup['sc-common']).toContain('昔')
    expect(byGroup['tc-names']).toContain('舊')
    expect(byGroup.cinzel).toContain('é')
  })
})
