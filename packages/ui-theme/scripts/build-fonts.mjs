// 界面字体分片（spec §7.3）：只手动运行（pnpm ui-theme:fonts），常规构建与 CI 不运行。
// dict-builder 之外唯一联网的脚本：只请求 raw.githubusercontent.com 上 docs/data-sources.md
// 登记的固定提交的 6 个文件，下载后先按登记的 SHA-256 校验。
// 用法：node packages/ui-theme/scripts/build-fonts.mjs [--offline] [--cache-dir <目录>]
// 退出码：0 成功；1 一般错误；2 源文件或一级字表的 SHA-256 与登记不符；3 首页预算守卫（不写产物）；4 CoE 注入衬线子集超出 L1_FONT_BUDGET（不写产物）
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import subsetFont from 'subset-font'
import { l1Shard, planShards, popupShard, unicodeRange } from '../src/charsets.ts'
import { readNameRecords, readSfntTables } from '../src/font-tables.ts'
import {
  assertLicenseText,
  L1_FONT_BUDGET,
  LICENSE_REQUIRED_LINES,
  parseFontSources,
  parseLevel1Registration,
  REPO_ROOT,
  sha256,
} from './compliance.mjs'

const USER_AGENT = 'poe2-tools-ui-theme (github.com/pine2D/poe2-tools)'
const BUDGET = 122_880
const PKG_DIR = resolve(REPO_ROOT, 'packages/ui-theme')
const FONTS_DIR = resolve(PKG_DIR, 'fonts')
const FAMILIES = {
  'PoE2 Serif SC': {
    name: 'Noto Serif SC',
    dir: 'ofl/notoserifsc',
    font: 'ofl/notoserifsc/NotoSerifSC[wght].ttf',
    ofl: 'ofl/notoserifsc/OFL.txt',
    license: 'NotoSerifSC-OFL.txt',
    nameIds: [0, 1, 4, 6, 7, 13, 14],
  },
  'PoE2 Serif TC': {
    name: 'Noto Serif TC',
    dir: 'ofl/notoseriftc',
    font: 'ofl/notoseriftc/NotoSerifTC[wght].ttf',
    ofl: 'ofl/notoseriftc/OFL.txt',
    license: 'NotoSerifTC-OFL.txt',
    nameIds: [0, 1, 4, 6, 7, 13, 14],
  },
  'PoE2 Cinzel': {
    name: 'Cinzel',
    dir: 'ofl/cinzel',
    font: 'ofl/cinzel/Cinzel[wght].ttf',
    ofl: 'ofl/cinzel/OFL.txt',
    license: 'Cinzel-OFL.txt',
    nameIds: [0, 1, 4, 6, 13, 14],
  },
}

class ExitError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function parseArgs(argv) {
  const options = { offline: false, cacheDir: resolve(REPO_ROOT, 'data/cache/ui-fonts') }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--offline') options.offline = true
    else if (arg === '--cache-dir' && argv[i + 1] !== undefined) {
      options.cacheDir = resolve(argv[i + 1])
      i += 1
    } else throw new ExitError(1, `未知参数：${arg}（用法：[--offline] [--cache-dir <目录>]）`)
  }
  return options
}

// 仓库内的收字 IO（charsets.ts 的 CharsetIO）：路径相对仓库根、POSIX 分隔
const repoIO = {
  listFiles(dirRel) {
    const abs = resolve(REPO_ROOT, dirRel)
    return readdirSync(abs, { recursive: true, encoding: 'utf8' })
      .map((name) => join(abs, name))
      .filter((path) => statSync(path).isFile())
      .map((path) => relative(REPO_ROOT, path).split(sep).join('/'))
  },
  readText(fileRel) {
    return readFileSync(resolve(REPO_ROOT, fileRel), 'utf8')
  },
}

async function loadSource(options, commit, path, expected) {
  const cached = join(options.cacheDir, commit, path)
  let data
  if (existsSync(cached)) {
    data = await readFile(cached)
  } else {
    if (options.offline) throw new ExitError(1, `--offline：缓存里没有 ${cached}`)
    const url = `https://raw.githubusercontent.com/google/fonts/${commit}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(300_000),
    })
    if (!response.ok) throw new ExitError(1, `下载失败（HTTP ${response.status}）：${url}`)
    data = Buffer.from(await response.arrayBuffer())
  }
  const actual = sha256(data)
  if (actual !== expected) {
    throw new ExitError(
      2,
      `${path} 的 SHA-256 为 ${actual}，与 data-sources.md 登记的 ${expected} 不符`,
    )
  }
  if (!existsSync(cached)) {
    await mkdir(dirname(cached), { recursive: true })
    await writeFile(cached, data)
  }
  return data
}

function previousCoverage() {
  const path = join(FONTS_DIR, 'coverage.json')
  if (!existsSync(path)) return null
  const coverage = JSON.parse(readFileSync(path, 'utf8'))
  const group = (name) =>
    new Set(
      coverage.shards.filter((shard) => shard.group === name).flatMap((shard) => [...shard.chars]),
    )
  return {
    scNames: group('sc-names'),
    scCommon: group('sc-common'),
    tcNames: group('tc-names'),
    cinzel: group('cinzel'),
  }
}

function sourceNames(family, font) {
  const names = readNameRecords(readSfntTables(font).get('name') ?? new Uint8Array())
  const out = {}
  for (const id of family.nameIds) {
    const value = names.get(id)
    if (value === undefined) throw new ExitError(1, `${family.name} 的 name 表缺少 ID ${id}`)
    out[String(id)] = value
  }
  return out
}

function licenseText(family, names, oflText, commit) {
  const lines = [family.name, names['0']]
  if (names['7'] !== undefined) lines.push(names['7'])
  lines.push('')
  const upstreamHead = oflText.split(/\r?\n/)[0] ?? ''
  if (upstreamHead !== names['0']) {
    lines.push(
      '以上版权行取自字体 name 表。上游 OFL.txt 头部写的是下面这一行，与 name 表不一致，两行都保留：',
      upstreamHead,
      '',
    )
  }
  lines.push(
    `来源：https://github.com/google/fonts/tree/${commit}/${family.dir}`,
    '',
    '----- 以下为上游 OFL.txt 全文 -----',
    '',
    oflText.trimEnd(),
    '',
  )
  const text = lines.join('\n')
  assertLicenseText(family.license, text, LICENSE_REQUIRED_LINES[family.license])
  return text
}

function fontFace(spec) {
  return [
    '@font-face {',
    `  font-family: "${spec.family}";`,
    `  src: url("./${spec.file}") format("woff2");`,
    `  font-weight: ${spec.weight};`,
    '  font-style: normal;',
    '  font-display: swap;',
    `  unicode-range: ${unicodeRange(spec.chars)};`,
    '}',
  ].join('\n')
}

// 扩展设置弹窗只加载自己的独立子集（spec §6.8、§7.6；扩展 0.3.2 起与 shard0 解耦），收字见 scripts/popup-text.txt。
// 这一片不写进 fonts.css：网站不下载它，也不会和 shard0 的 unicode-range 重叠导致重复请求。
// 字体文件由扩展构建复制进包，许可文件随包发布
function popupFontsCss(popup) {
  return `${[
    '/* 由 packages/ui-theme/scripts/build-fonts.mjs 生成，勿手改。',
    '   扩展设置弹窗专用（spec §6.8、§7.6）：只含弹窗独立子集 serif-sc-popup（收字见 scripts/popup-text.txt），不进 fonts.css。',
    '   字体 Noto Serif SC 以 SIL Open Font License 1.1 授权，扩展包内附 NotoSerifSC-OFL.txt；项目的 MIT 许可不覆盖字体文件。 */',
    fontFace(popup.spec),
  ].join('\n')}\n`
}

function fontsCss(shards) {
  const head = [
    '/* 由 packages/ui-theme/scripts/build-fonts.mjs 生成，勿手改。',
    '   字体：Noto Serif SC、Noto Serif TC、Cinzel，均以 SIL Open Font License 1.1 授权，项目的 MIT 许可不覆盖本目录。',
    '   许可文件：/fonts/NotoSerifSC-OFL.txt、/fonts/NotoSerifTC-OFL.txt、/fonts/Cinzel-OFL.txt',
    '   页面用站点私有别名 "PoE2 Serif SC"、"PoE2 Serif TC"、"PoE2 Cinzel"，分片里没有的字回退到本机字体。 */',
  ]
  const faces = shards.map(({ spec }) => fontFace(spec))
  return `${[...head, ...faces].join('\n')}\n`
}

async function subset(spec, sources) {
  const data = await subsetFont(sources[spec.family].font, spec.chars.join(''), {
    targetFormat: 'woff2',
    variationAxes: { wght: spec.weight },
    preserveNameIds: [7, 13, 14],
  })
  console.log(`${spec.file}\t${data.length}\t${spec.chars.length}`)
  return { spec, data }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const md = await readFile(resolve(REPO_ROOT, 'docs/data-sources.md'), 'utf8')
  const { commit, files } = parseFontSources(md)
  const level1Path = resolve(PKG_DIR, 'scripts/tongyong-level1.txt')
  const level1Text = await readFile(level1Path, 'utf8')
  const level1Sha = sha256(level1Text)
  if (level1Sha !== parseLevel1Registration(md)) {
    throw new ExitError(
      2,
      `tongyong-level1.txt 的 SHA-256 为 ${level1Sha}，与 data-sources.md 登记不符`,
    )
  }

  const sources = {}
  const sourceHashes = {}
  const names = {}
  for (const [alias, family] of Object.entries(FAMILIES)) {
    for (const path of [family.font, family.ofl]) {
      if (!files.has(path)) throw new ExitError(1, `data-sources.md 没有登记 ${path}`)
      sourceHashes[path] = files.get(path)
    }
    const font = await loadSource(options, commit, family.font, files.get(family.font))
    const ofl = await loadSource(options, commit, family.ofl, files.get(family.ofl))
    names[family.name] = sourceNames(family, font)
    sources[alias] = { font, ofl: ofl.toString('utf8') }
  }

  const specs = planShards({
    shard0Text: await readFile(resolve(PKG_DIR, 'scripts/shard0-text.txt'), 'utf8'),
    level1: level1Text.split(/\r?\n/).filter((line) => line !== ''),
    io: repoIO,
    previous: previousCoverage(),
  })

  // 首页预算守卫先算：serif-sc-0 + cinzel 超出 120KB 时不写任何产物
  const first = specs.filter(
    (spec) => spec.file === 'serif-sc-0.woff2' || spec.file === 'cinzel.woff2',
  )
  const done = new Map()
  for (const spec of first) done.set(spec.file, await subset(spec, sources))
  const budget = [...done.values()].reduce((sum, { data }) => sum + data.length, 0)
  console.log(`shard0+cinzel=${budget}/${BUDGET}`)
  if (budget > BUDGET) {
    throw new ExitError(3, '首页字体预算超出 122,880 字节：精简 shard0-text.txt 后重跑')
  }
  const outputs = []
  for (const spec of specs) outputs.push(done.get(spec.file) ?? (await subset(spec, sources)))
  // 扩展弹窗独立子集：不计入首页预算、不进 fonts.css，只写 popup.css，并登记在 coverage.json 末尾
  const popup = await subset(
    popupShard(await readFile(resolve(PKG_DIR, 'scripts/popup-text.txt'), 'utf8')),
    sources,
  )

  // CoE 注入衬线子集（扩展 0.4.0）：内容脚本以 FontFace 注册，不写 CSS，登记在 coverage.json 末尾；
  // 超出预算时在写盘前终止，现有产物一律不动
  const l1 = await subset(l1Shard(repoIO), sources)
  if (l1.data.length > L1_FONT_BUDGET) {
    throw new ExitError(
      4,
      `L1 字体预算超出 131,072 字节（实际 ${l1.data.length}）：检查 l1Shard 的收字范围（是否误收 ASCII 或 adapters），不要直接放宽 L1_FONT_BUDGET`,
    )
  }
  // 临时目录放在已忽略的 data/cache/ 下：脚本被中断时残留的 woff2 不会变成未跟踪文件；
  // 与仓库同一文件系统，rename 不跨设备
  await mkdir(resolve(REPO_ROOT, 'data/cache'), { recursive: true })
  const tmp = await mkdtemp(resolve(REPO_ROOT, 'data/cache/ui-fonts-out-'))
  try {
    await mkdir(join(tmp, 'LICENSES'))
    for (const { spec, data } of [...outputs, popup, l1])
      await writeFile(join(tmp, spec.file), data)
    await writeFile(join(tmp, 'fonts.css'), fontsCss(outputs))
    await writeFile(join(tmp, 'popup.css'), popupFontsCss(popup))
    for (const [alias, family] of Object.entries(FAMILIES)) {
      const text = licenseText(family, names[family.name], sources[alias].ofl, commit)
      await writeFile(join(tmp, 'LICENSES', family.license), text)
    }
    const coverage = {
      version: 1,
      sourceCommit: commit,
      sources: sourceHashes,
      sourceNames: names,
      shards: [...outputs, popup, l1].map(({ spec, data }) => ({
        file: spec.file,
        family: spec.family,
        group: spec.group,
        weight: spec.weight,
        bytes: data.length,
        sha256: sha256(data),
        chars: spec.chars.join(''),
      })),
    }
    await writeFile(join(tmp, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`)
    await rm(FONTS_DIR, { recursive: true, force: true })
    await rename(tmp, FONTS_DIR)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
  console.log(
    `已写入 ${relative(REPO_ROOT, FONTS_DIR)}：${outputs.length} 个网站分片，1 个弹窗分片，1 个注入分片`,
  )
  // 契约 §3.6：标准输出末行为 shard0+cinzel=<字节数>/122880
  console.log(`shard0+cinzel=${budget}/${BUDGET}`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof ExitError ? error.message : error)
  process.exit(error instanceof ExitError ? error.code : 1)
}
