// 合规判定的唯一实现（spec §8.6）：许可文件必含行、素材白名单三类判定、CSS url() 外链判定，
// 以及 docs/data-sources.md“界面字体与素材”一节的机读段落解析。纯 Node 标准库。
// 调用方：ui-theme 的 fonts / compliance / no-external-url 测试、apps/site 的 asset-whitelist 与
// no-external-url 测试、check-site.mjs、smoke-site.mjs、build-fonts.mjs；二期扩展检查复用。
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 由 import.meta.url 求本文件的文件系统路径（契约 C18）。apps/site 的 happy-dom 测试会直接导入本模块，
// 那里 Vite 把 import.meta.url 改写成 http://localhost/@fs/<绝对路径>；规则与 apps/site 的 fsPath.ts 相同，
// 在这里自写一份，不跨包导入，模块加载时不得抛错
function modulePath(url) {
  const parsed = new URL(url)
  if (parsed.protocol === 'file:') return fileURLToPath(parsed)
  const at = parsed.pathname.indexOf('/@fs')
  return decodeURIComponent(at === -1 ? parsed.pathname : parsed.pathname.slice(at + 4))
}

/** 本文件所在仓库根 */
export const REPO_ROOT = resolve(dirname(modulePath(import.meta.url)), '..', '..', '..')

export const FULL_DISCLAIMER =
  '非官方工具，与 Grinding Gear Games、腾讯及 Craft of Exile 无关联，也未获其认可。'

export const LICENSE_FILES = ['NotoSerifSC-OFL.txt', 'NotoSerifTC-OFL.txt', 'Cinzel-OFL.txt']

const NOTO_REQUIRED = [
  '(c) 2017-2024 Adobe (http://www.adobe.com/).',
  'Noto is a trademark of Google Inc.',
  'Copyright 2012 Google Inc. All Rights Reserved.',
  'SIL OPEN FONT LICENSE Version 1.1',
]

/** spec §8.6 的必含行，逐字、按子串判定 */
export const LICENSE_REQUIRED_LINES = {
  'NotoSerifSC-OFL.txt': NOTO_REQUIRED,
  'NotoSerifTC-OFL.txt': NOTO_REQUIRED,
  'Cinzel-OFL.txt': [
    'Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel)',
    'SIL OPEN FONT LICENSE Version 1.1',
  ],
}

/** 网站 NOTICE.txt 必含：完整声明与三份许可文件的站内路径 */
export const SITE_NOTICE_REQUIRED_LINES = [
  FULL_DISCLAIMER,
  '/fonts/NotoSerifSC-OFL.txt',
  '/fonts/NotoSerifTC-OFL.txt',
  '/fonts/Cinzel-OFL.txt',
]

export const ASSET_EXTENSIONS = ['png', 'jpg', 'webp', 'gif', 'svg', 'woff', 'woff2', 'ttf', 'otf']

/** 扩展弹窗专用字体分片（build-fonts.mjs 生成）：只由 fonts/popup.css 引用，不进 fonts.css，网站产物里不应出现 */
export const POPUP_FONT_FILE = 'serif-sc-popup.woff2'

/** CoE 注入界面的中文衬线子集（扩展 0.4.0，build-fonts.mjs 生成）：内容脚本以 FontFace 注册，不进 fonts.css，网站产物里不应出现 */
export const L1_FONT_FILE = 'serif-sc-l1.woff2'
/** 内容脚本注册 L1 子集时用的 family 名；与网站和弹窗的 "PoE2 Serif SC" 区分，避免同名 face 合并 */
export const L1_FONT_FAMILY = 'PoE2 Serif SC L1'
/** L1 子集体积上限（字节）：build-fonts.mjs 超出即以退出码 4 终止，扩展 check.mjs 在 dist 上再查一次 */
export const L1_FONT_BUDGET = 131_072
/** 只属于扩展的字体分片：assertFontSetEquals 不要求网站产物含它们，出现即拒绝 */
export const EXTENSION_FONT_FILES = [POPUP_FONT_FILE, L1_FONT_FILE]

/** spec §8.5 的检测正则 */
export const EXTERNAL_URL_RE = /url\(\s*['"]?\s*(?:https?:)?\/\//i

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

export function missingLines(text, required) {
  return required.filter((line) => !text.includes(line))
}

/** 缺行时抛 Error，消息列出 name 与缺失的每一行 */
export function assertLicenseText(name, text, required) {
  const missing = missingLines(text, required)
  if (missing.length > 0) {
    throw new Error(`${name} 缺少必含行：\n${missing.map((line) => `  ${line}`).join('\n')}`)
  }
}

/** 文件缺失或缺行时抛 Error */
export async function checkLicenseFile(path, required) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new Error(`缺少许可文件：${path}`)
  }
  assertLicenseText(path, text, required)
}

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** CSS 中全部 url() 目标（去引号与首尾空白，保持出现顺序）。带引号的目标整体跳过，内部的 url( 不再计入；
 *  未加引号的目标里，反斜杠转义的括号（压缩器会把 data URI 里的 ( ) 写成 \( \)）不算结束 */
export function cssUrlTargets(css) {
  const src = stripCssComments(css)
  const lower = src.toLowerCase()
  const targets = []
  let pos = 0
  for (;;) {
    const start = lower.indexOf('url(', pos)
    if (start < 0) return targets
    let i = start + 4
    while (/\s/.test(src[i] ?? '')) i += 1
    const quote = src[i] === '"' || src[i] === "'" ? src[i] : null
    const stop = quote ?? ')'
    let j = quote === null ? i : i + 1
    while (j < src.length && src[j] !== stop) j += src[j] === '\\' ? 2 : 1
    if (j >= src.length) return targets
    targets.push(src.slice(quote === null ? i : i + 1, j).trim())
    const end = quote === null ? j : src.indexOf(')', j)
    if (end < 0) return targets
    pos = end + 1
  }
}

/** 命中 EXTERNAL_URL_RE 的 url() 片段；data:image/svg+xml 内部的 xmlns 不算 */
export function externalUrls(css) {
  const src = stripCssComments(css)
  const global = new RegExp(EXTERNAL_URL_RE.source, 'gi')
  return [...src.matchAll(global)].map((match) => {
    const end = src.indexOf(')', match.index + match[0].length)
    return src.slice(match.index, end < 0 ? undefined : end + 1)
  })
}

const SECTION_TITLE = '# 界面字体与素材（2026-09-28 登记）'

// 从标题行起，到同级或更高级标题前止
function section(lines, title) {
  const start = lines.indexOf(title)
  if (start < 0) throw new Error(`data-sources.md 缺少“${title.replace(/^#+ /, '')}”一节`)
  const level = title.indexOf(' ')
  const out = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const heading = /^(#+) /.exec(lines[i])
    if (heading !== null && heading[1].length <= level) break
    out.push(lines[i])
  }
  return out
}

function subsection(md, title) {
  return section(section(md.split(/\r?\n/), SECTION_TITLE), title)
}

// 表格数据行：单元格去反引号与首尾空白，跳过表头与分隔行
function tableRows(lines) {
  const rows = []
  for (const line of lines) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.replaceAll('`', '').trim())
    if (cells.every((cell) => /^-*$/.test(cell))) continue
    if (cells[0] === '上游路径' || cells[0] === '路径') continue
    rows.push(cells)
  }
  return rows
}

function assertSha(value, where) {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${where} 的 SHA-256 格式不对：${value}`)
  return value
}

export function parseFontSources(dataSourcesMd) {
  const lines = subsection(dataSourcesMd, '## 字体源文件')
  const commitLine = lines.find((line) => line.startsWith('固定提交：'))
  const commit = /`([0-9a-f]{40})`/.exec(commitLine ?? '')?.[1]
  if (commit === undefined) throw new Error('data-sources.md 缺少 40 位“固定提交：”')
  const files = new Map()
  for (const [path = '', sha = ''] of tableRows(lines)) files.set(path, assertSha(sha, path))
  return { commit, files }
}

/** 一级字表登记：'packages/ui-theme/scripts/tongyong-level1.txt' 的 SHA-256 */
export function parseLevel1Registration(dataSourcesMd) {
  const path = 'packages/ui-theme/scripts/tongyong-level1.txt'
  const row = tableRows(subsection(dataSourcesMd, '## 通用规范汉字表一级字表')).find(
    ([cell]) => cell === path,
  )
  if (row === undefined) throw new Error(`data-sources.md 没有登记 ${path}`)
  return assertSha(row[1] ?? '', path)
}

/** 第 3 类白名单：路径 → SHA-256（一期为空表） */
export function parseRegisteredAssets(dataSourcesMd) {
  const assets = new Map()
  for (const [path = '', sha = ''] of tableRows(
    subsection(dataSourcesMd, '## 素材白名单（第 3 类）'),
  )) {
    assets.set(path, assertSha(sha, path))
  }
  return assets
}

const MOTIF_SVGS = [
  'packages/ui-theme/src/generated/favicon.svg',
  'packages/ui-theme/src/generated/logo.svg',
  'packages/ui-theme/src/generated/knot-full.svg',
  'apps/site/public/favicon.svg',
]

export async function loadWhitelist(paths = {}) {
  const repoRoot = paths.repoRoot ?? REPO_ROOT
  const coveragePath =
    paths.coveragePath ?? resolve(repoRoot, 'packages/ui-theme/fonts/coverage.json')
  const dataSourcesPath = paths.dataSourcesPath ?? resolve(repoRoot, 'docs/data-sources.md')
  const coverage = JSON.parse(await readFile(coveragePath, 'utf8'))
  const fontShards = new Map(coverage.shards.map((shard) => [shard.file, shard.sha256]))
  const motifSvgs = new Map()
  for (const path of MOTIF_SVGS)
    motifSvgs.set(path, sha256(await readFile(resolve(repoRoot, path))))
  const registered = parseRegisteredAssets(await readFile(dataSourcesPath, 'utf8'))
  return { fontShards, motifSvgs, registered }
}

function extension(path) {
  return /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ''
}

/** repo 模式：第 1 类还要求路径在 packages/ui-theme/fonts/ 下且文件名匹配；第 2 类要求路径即登记的生成物；
 *  第 3 类路径与哈希同时匹配。dist 模式只比 SHA-256。woff/ttf/otf 恒为 null */
export function classifyAsset(entry, whitelist, mode) {
  const ext = extension(entry.path)
  if (ext === 'woff' || ext === 'ttf' || ext === 'otf') return null
  const { path, sha256: sha } = entry
  if (ext === 'woff2') {
    if (mode === 'dist' && [...whitelist.fontShards.values()].includes(sha)) return 1
    const file = path.slice('packages/ui-theme/fonts/'.length)
    if (
      mode === 'repo' &&
      path.startsWith('packages/ui-theme/fonts/') &&
      !file.includes('/') &&
      whitelist.fontShards.get(file) === sha
    ) {
      return 1
    }
  }
  if (ext === 'svg') {
    if (mode === 'dist' && [...whitelist.motifSvgs.values()].includes(sha)) return 2
    if (mode === 'repo' && whitelist.motifSvgs.get(path) === sha) return 2
  }
  if (mode === 'dist' && [...whitelist.registered.values()].includes(sha)) return 3
  if (mode === 'repo' && whitelist.registered.get(path) === sha) return 3
  return null
}

/** 任一为 null 即抛 Error，列出路径与 SHA-256 */
export function assertAssets(entries, whitelist, mode) {
  const rejected = entries.filter((entry) => classifyAsset(entry, whitelist, mode) === null)
  if (rejected.length > 0) {
    throw new Error(
      `以下文件不在素材白名单（docs/data-sources.md“界面字体与素材”）：\n${rejected
        .map((entry) => `  ${entry.path}  ${entry.sha256}`)
        .join('\n')}`,
    )
  }
}

/** 网站 dist：dist/assets/*.woff2 的 SHA-256 集合必须与 coverage.json 完全相同；扩展的两片（EXTENSION_FONT_FILES）不属于网站，不计入 */
export function assertFontSetEquals(distWoff2Shas, whitelist) {
  const expected = new Set(
    [...whitelist.fontShards]
      .filter(([file]) => !EXTENSION_FONT_FILES.includes(file))
      .map(([, sha]) => sha),
  )
  const actual = new Set(distWoff2Shas)
  const missing = [...expected].filter((sha) => !actual.has(sha))
  const extra = [...actual].filter((sha) => !expected.has(sha))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `dist 的 woff2 与 coverage.json 不一致：缺少 ${missing.join(', ') || '无'}；多出 ${extra.join(', ') || '无'}`,
    )
  }
}
