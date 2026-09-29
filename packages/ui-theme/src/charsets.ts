// 字体分片的收字规则（spec §7.3）：纯函数，文件访问由调用方注入。
// build-fonts.mjs 与 coverage.test.ts 共用；相对导入写 .ts 扩展名，Node 直接加载。

/** U+0020–U+007E，共 95 个字符 */
export const ASCII_PRINTABLE = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(0x20 + i),
).join('')
export const SHARD_SIZE = 300
export const SITE_SCAN_DIRS = [
  'apps/site/src/pages',
  'apps/site/src/features/build-l10n',
  'apps/site/src/shared',
] as const
export const SITE_SCAN_FILES = [
  'apps/site/index.html',
  'apps/site/build/index.html',
  'apps/site/extension/index.html',
] as const
/** 目录内的扫描扩展名；排除文件名含 '.test.' 的文件 */
export const SITE_SCAN_EXTENSIONS = ['.ts', '.tsx', '.css'] as const
export const NAME_TABLES = [
  'items.json',
  'gems.json',
  'passives.json',
  'ascendancies.json',
  'classes.json',
  'inventories.json',
] as const

/** 路径一律相对仓库根、POSIX 分隔 */
export interface CharsetIO {
  /** 递归列出目录下的全部文件（相对仓库根） */
  listFiles(dirRel: string): string[]
  readText(fileRel: string): string
}

/** 删除 /* … *\/、{/* … *\/}、<!-- … -->，以及首个非空白字符为 // 的整行 */
export function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/** 码位 > U+007F 且非空白的字符 */
export function nonAsciiChars(text: string): Set<string> {
  const out = new Set<string>()
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) > 0x7f && !/\s/.test(ch)) out.add(ch)
  }
  return out
}

/** shard0-text.txt 非注释行的全部非空白字符 ∪ ASCII_PRINTABLE（注释行以 # 开头，空行忽略） */
export function shard0Chars(shard0Text: string): Set<string> {
  const out = new Set<string>(ASCII_PRINTABLE)
  for (const line of shard0Text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    for (const ch of line) if (!/\s/.test(ch)) out.add(ch)
  }
  return out
}

/** 站点固定文案字符：SITE_SCAN_DIRS（按扩展名、排除测试）与 SITE_SCAN_FILES 经 stripComments 后的 nonAsciiChars */
export function siteFixedChars(io: CharsetIO): Set<string> {
  const files: string[] = [...SITE_SCAN_FILES]
  for (const dir of SITE_SCAN_DIRS) {
    for (const file of io.listFiles(dir)) {
      const scanned = SITE_SCAN_EXTENSIONS.some((ext) => file.endsWith(ext))
      if (scanned && !file.includes('.test.')) files.push(file)
    }
  }
  const out = new Set<string>()
  for (const file of files) {
    for (const ch of nonAsciiChars(stripComments(io.readText(file)))) out.add(ch)
  }
  return out
}

interface NameTable {
  bases?: Record<string, unknown>
  uniques?: Record<string, unknown>
  entries?: Record<string, unknown>
}

function readTable(io: CharsetIO, locale: string, table: string): NameTable {
  return JSON.parse(io.readText(`data/dict/${locale}/${table}`)) as NameTable
}

function field(value: unknown, key: 'text' | 'en'): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined
}

function strings(values: readonly unknown[]): string[] {
  return values.filter((value): value is string => typeof value === 'string')
}

/** data/dict/<locale>/ 的名称：items.bases 与 items.uniques 的值、gems/passives 的 entries.*.text、ascendancies/classes/inventories 的 entries 值；只取字符串 */
export function zhNames(io: CharsetIO, locale: 'zh-CN' | 'zh-TW'): string[] {
  const out: string[] = []
  for (const table of NAME_TABLES) {
    const data = readTable(io, locale, table)
    if (table === 'items.json') {
      out.push(
        ...strings(Object.values(data.bases ?? {})),
        ...strings(Object.values(data.uniques ?? {})),
      )
    } else if (table === 'gems.json' || table === 'passives.json') {
      out.push(...strings(Object.values(data.entries ?? {}).map((entry) => field(entry, 'text'))))
    } else {
      out.push(...strings(Object.values(data.entries ?? {})))
    }
  }
  return out
}

/** 两个 locale 的 items.bases 与 items.uniques 的键、gems/passives 的 entries.*.en；去重 */
export function enNames(io: CharsetIO): string[] {
  const out = new Set<string>()
  for (const locale of ['zh-CN', 'zh-TW'] as const) {
    const items = readTable(io, locale, 'items.json')
    for (const key of Object.keys(items.bases ?? {})) out.add(key)
    for (const key of Object.keys(items.uniques ?? {})) out.add(key)
    for (const table of ['gems.json', 'passives.json']) {
      const entries = Object.values(readTable(io, locale, table).entries ?? {})
      for (const name of strings(entries.map((entry) => field(entry, 'en')))) out.add(name)
    }
  }
  return [...out]
}

function byCodePoint(a: string, b: string): number {
  return (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0)
}

/** 名称去重后逐字符计数；去掉 exclude；keep 中本次未出现的字计 0 次；按次数降序、码位升序 */
export function rankChars(
  names: readonly string[],
  exclude: ReadonlySet<string>,
  keep: ReadonlySet<string>,
): string[] {
  const counts = new Map<string, number>()
  for (const name of new Set(names)) {
    for (const ch of name) {
      if (/\s/.test(ch) || exclude.has(ch)) continue
      counts.set(ch, (counts.get(ch) ?? 0) + 1)
    }
  }
  for (const ch of keep) {
    if (!exclude.has(ch) && !counts.has(ch)) counts.set(ch, 0)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || byCodePoint(a[0], b[0])).map(([ch]) => ch)
}

export function chunk<T>(items: readonly T[], size: number = SHARD_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 按码位排序后压缩为 CSS unicode-range，如 'U+20-7E, U+2026, U+4E00-4E01' */
export function unicodeRange(chars: Iterable<string>): string {
  const points = [...new Set([...chars].map((ch) => ch.codePointAt(0) ?? 0))].sort((a, b) => a - b)
  const ranges: string[] = []
  let i = 0
  while (i < points.length) {
    const start = points[i] ?? 0
    let end = start
    while (points[i + 1] === end + 1) {
      end += 1
      i += 1
    }
    const hex = (n: number) => n.toString(16).toUpperCase()
    ranges.push(start === end ? `U+${hex(start)}` : `U+${hex(start)}-${hex(end)}`)
    i += 1
  }
  return ranges.join(', ')
}

export type ShardGroup = 'sc-fixed' | 'sc-site' | 'sc-names' | 'sc-common' | 'tc-names' | 'cinzel'
export type FontFamilyAlias = 'PoE2 Serif SC' | 'PoE2 Serif TC' | 'PoE2 Cinzel'
export interface ShardSpec {
  /** 'serif-sc-0.woff2' 等（契约 §3.7.3） */
  file: string
  family: FontFamilyAlias
  group: ShardGroup
  weight: 700 | 400
  /** 该片收录的字符（码位升序） */
  chars: string[]
}
export interface PreviousCoverage {
  scNames: ReadonlySet<string>
  scCommon: ReadonlySet<string>
  tcNames: ReadonlySet<string>
  cinzel: ReadonlySet<string>
}

function sorted(chars: Iterable<string>): string[] {
  return [...chars].sort(byCodePoint)
}

export function planShards(input: {
  shard0Text: string
  level1: readonly string[]
  io: CharsetIO
  previous: PreviousCoverage | null
}): ShardSpec[] {
  const { io, previous } = input
  const sc = (file: string, group: ShardGroup, chars: Iterable<string>): ShardSpec => ({
    file,
    family: 'PoE2 Serif SC',
    group,
    weight: 700,
    chars: sorted(chars),
  })
  const fixed = shard0Chars(input.shard0Text)
  const site = [...siteFixedChars(io)].filter((ch) => !fixed.has(ch))
  const covered = new Set<string>([...fixed, ...site])
  const shards: ShardSpec[] = [
    sc('serif-sc-0.woff2', 'sc-fixed', fixed),
    sc('serif-sc-1.woff2', 'sc-site', site),
  ]

  const names = rankChars(zhNames(io, 'zh-CN'), covered, previous?.scNames ?? new Set())
  for (const [i, part] of chunk(names).entries())
    shards.push(sc(`serif-sc-${i + 2}.woff2`, 'sc-names', part))
  for (const ch of names) covered.add(ch)

  // 常用字片：按字表序号；名称分片已收的字移走；以前收过、现在仍未被覆盖的字保留在末尾
  const common = input.level1.filter((ch) => !covered.has(ch))
  const inCommon = new Set(common)
  for (const ch of previous?.scCommon ?? []) {
    if (!covered.has(ch) && !inCommon.has(ch)) {
      common.push(ch)
      inCommon.add(ch)
    }
  }
  for (const [i, part] of chunk(common).entries()) {
    shards.push(sc(`serif-sc-common-${i}.woff2`, 'sc-common', part))
  }

  const tcNames = zhNames(io, 'zh-TW').map((name) => [...nonAsciiChars(name)].join(''))
  const tc = rankChars(tcNames, new Set(), previous?.tcNames ?? new Set())
  for (const [i, part] of chunk(tc).entries()) {
    shards.push({
      file: `serif-tc-${i}.woff2`,
      family: 'PoE2 Serif TC',
      group: 'tc-names',
      weight: 700,
      chars: sorted(part),
    })
  }

  const cinzel = new Set<string>(ASCII_PRINTABLE)
  for (const ch of nonAsciiChars(enNames(io).join(''))) cinzel.add(ch)
  for (const ch of previous?.cinzel ?? []) cinzel.add(ch)
  shards.push({
    file: 'cinzel.woff2',
    family: 'PoE2 Cinzel',
    group: 'cinzel',
    weight: 400,
    chars: sorted(cinzel),
  })
  return shards
}
