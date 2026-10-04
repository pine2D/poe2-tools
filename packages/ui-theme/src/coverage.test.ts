// 字体分片覆盖（spec §7.3）：名称、一级字、站点固定文案都要落在对应分片里。失败时运行 pnpm ui-theme:fonts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../scripts/compliance.mjs'
import {
  type CharsetIO,
  COMMON_SHARD_SIZE,
  enNames,
  l1Shard,
  nonAsciiChars,
  SHARD_SIZE,
  siteFixedChars,
  unicodeRange,
  zhNames,
} from './charsets'
import { parseRules } from './testing/css'

interface CoverageShard {
  file: string
  family: string
  group: string
  weight: number
  chars: string
}

const FONTS = join(REPO_ROOT, 'packages/ui-theme/fonts')
const shards = (
  JSON.parse(readFileSync(join(FONTS, 'coverage.json'), 'utf8')) as { shards: CoverageShard[] }
).shards
const HINT = '运行 pnpm ui-theme:fonts 重新生成字体分片，并与本次改动放在同一个提交里'
/** 只属于扩展的字体分组：网站覆盖与 fonts.css 都不含它们 */
const EXTENSION_GROUPS = ['sc-popup', 'sc-l1']
const L1_HINT =
  '运行 pnpm ui-theme:fonts --offline 重新生成；L1 子集变化会改变扩展 zip：与扩展版本、扩展 CHANGELOG、release.json 放进同一提交——该版本尚未推送时可用 EXTENSION_RELEASE_AMEND=1 pnpm extension:release，已发布则必须升版本'
/** 原站 Fontin 位置上已知会出现的译文（selectors.md 样例）：兜住 adapters 写进 Fontin 位置的字 */
const FONTIN_SAMPLES = [
  '制作',
  '数据',
  '背包',
  '导入装备',
  '重置',
  '流程模拟',
  '模拟此结果',
  '创建模拟流程',
  '编辑',
  '百科',
  '导出',
  '保存',
  '主要功能',
  '使用方法',
  '制作演练',
  '计算器',
  '可自定义',
  '最新版本',
]

const io: CharsetIO = {
  listFiles(dirRel) {
    const abs = join(REPO_ROOT, dirRel)
    return readdirSync(abs, { recursive: true, encoding: 'utf8' })
      .map((name) => join(abs, name))
      .filter((path) => statSync(path).isFile())
      .map((path) => relative(REPO_ROOT, path).split(sep).join('/'))
  },
  readText: (fileRel) => readFileSync(join(REPO_ROOT, fileRel), 'utf8'),
}

function charsOf(test: (shard: CoverageShard) => boolean): Set<string> {
  return new Set(shards.filter(test).flatMap((shard) => [...shard.chars]))
}

function missing(text: Iterable<string>, have: ReadonlySet<string>): string {
  return [...new Set(text)].filter((ch) => !/\s/.test(ch) && !have.has(ch)).join('')
}

const level1 = readFileSync(
  join(REPO_ROOT, 'packages/ui-theme/scripts/tongyong-level1.txt'),
  'utf8',
)
  .split('\n')
  .filter((line) => line !== '')

describe('分片覆盖（spec §7.3）', () => {
  // 扩展的两片（弹窗子集、注入衬线子集）网站不加载，不计入网站覆盖
  const sc = charsOf(
    (shard) => shard.family === 'PoE2 Serif SC' && !EXTENSION_GROUPS.includes(shard.group),
  )

  it('zh-CN 名称的字符 ⊆ SC 全部分片', () => {
    expect(missing(zhNames(io, 'zh-CN').join(''), sc), HINT).toBe('')
  })

  it('《通用规范汉字表》一级字 ⊆ SC 全部分片', () => {
    expect(missing(level1, sc), HINT).toBe('')
  })

  it('zh-TW 名称的非 ASCII 字符 ⊆ TC 全部分片', () => {
    const tc = charsOf((shard) => shard.family === 'PoE2 Serif TC')
    expect(missing(nonAsciiChars(zhNames(io, 'zh-TW').join('')), tc), HINT).toBe('')
  })

  it('英文名字符 ⊆ Cinzel', () => {
    expect(
      missing(
        enNames(io).join(''),
        charsOf((shard) => shard.group === 'cinzel'),
      ),
      HINT,
    ).toBe('')
  })

  it('站点固定文案 ⊆ shard0 ∪ shard1', () => {
    const fixed = charsOf((shard) => shard.group === 'sc-fixed' || shard.group === 'sc-site')
    expect(missing(siteFixedChars(io), fixed), HINT).toBe('')
  })
})

describe('CoE 注入衬线子集（扩展 0.4.0，裁定 14）', () => {
  const l1 = charsOf((shard) => shard.group === 'sc-l1')

  it('ui.zh-CN.json 译文与内容脚本固定文案的非 ASCII 字符 ⊆ sc-l1', () => {
    expect(missing(l1Shard(io).chars, l1), L1_HINT).toBe('')
  })

  it('原站 Fontin 位置的样例文案 ⊆ sc-l1', () => {
    expect(missing(FONTIN_SAMPLES.join(''), l1), L1_HINT).toBe('')
  })
})

describe('字表与 fonts.css', () => {
  it('tongyong-level1.txt 为 3500 个互不相同的单字', () => {
    expect(level1).toHaveLength(3500)
    expect(new Set(level1).size).toBe(3500)
    for (const line of level1) expect([...line]).toHaveLength(1)
  })

  it('fonts.css 每片一条 @font-face，顺序、family、weight、swap 与 unicode-range 与 coverage.json 一致（扩展两片除外）', () => {
    const siteShards = shards.filter((shard) => !EXTENSION_GROUPS.includes(shard.group))
    const faces = parseRules(readFileSync(join(FONTS, 'fonts.css'), 'utf8')).filter((rule) =>
      rule.selectors.includes('@font-face'),
    )
    expect(
      faces.map((face) => face.declarations.get('src')),
      HINT,
    ).toEqual(siteShards.map((shard) => `url("./${shard.file}") format("woff2")`))
    for (const [i, shard] of siteShards.entries()) {
      const face = faces[i]?.declarations
      expect(face?.get('font-family')).toBe(`"${shard.family}"`)
      expect(face?.get('font-weight')).toBe(String(shard.weight))
      expect(face?.get('font-style')).toBe('normal')
      expect(face?.get('font-display')).toBe('swap')
      expect(face?.get('unicode-range'), shard.file).toBe(unicodeRange(shard.chars))
    }
  })
})

// ---- M3：常用字片每片约 100 字（spec §7.3；附录 B.8 的 B19 决定）----
describe('分片切片大小（spec §7.3）', () => {
  // 按组取 coverage.json 里的分片（保持登记顺序）
  const ofGroup = (group: string) => shards.filter((shard) => shard.group === group)
  function expectChunked(group: string, size: number) {
    const sizes = ofGroup(group).map((shard) => [...shard.chars].length)
    const total = sizes.reduce((sum, n) => sum + n, 0)
    const detail = `${group}：${sizes.join('、')}；${HINT}`
    expect(sizes.length, detail).toBe(Math.ceil(total / size))
    expect(
      sizes.slice(0, -1).every((n) => n === size),
      detail,
    ).toBe(true)
    expect((sizes.at(-1) ?? 0) <= size, detail).toBe(true)
  }

  it('常用字片每片 COMMON_SHARD_SIZE（100）字，最后一片是余数，片名从 serif-sc-common-0 连续编号', () => {
    expectChunked('sc-common', COMMON_SHARD_SIZE)
    expect(ofGroup('sc-common').map((shard) => shard.file)).toEqual(
      ofGroup('sc-common').map((_, i) => `serif-sc-common-${i}.woff2`),
    )
  })

  it('名称分片与繁体分片仍每片 SHARD_SIZE（300）字', () => {
    expectChunked('sc-names', SHARD_SIZE)
    expectChunked('tc-names', SHARD_SIZE)
  })
})
