import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 攻略翻译用的正文术语词典。与 CoE 用的 assets/dictionary.json 分开打包，侧边栏打开时才读取。
const sha = (text) => createHash('sha256').update(text).digest('hex')

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function rejected(en, zh) {
  if (!en || !zh || en === zh) return true
  if (/\[\[|\]\]|\{\{|\}\}/.test(en) || /\[\[|\]\]|\{\{|\}\}/.test(zh)) return true
  return en.length > 1 && /^[A-Z0-9 ]+$/.test(en)
}

async function readJson(root, file, sources, tierOverride) {
  const text = await readFile(path.join(root, file), 'utf8')
  const data = JSON.parse(text)
  const tier = tierOverride ?? data._meta?.tier
  if (!['primary', 'gray', 'manual'].includes(tier)) throw new Error(`词典来源等级缺失：${file}`)
  sources.push({
    path: file,
    sha256: sha(text),
    tier,
    version: data._meta?.gameVersion ?? 'unknown',
  })
  return { data, tier }
}

export async function buildGuideDictionary(root, output, { allowGray = true } = {}) {
  const sources = []
  const entries = []
  const seen = new Set()
  const push = (id, en, zh, kind, tier, extra = {}) => {
    const e = clean(en)
    const z = clean(zh)
    if (rejected(e, z)) return
    const key = id
    if (seen.has(key)) return
    seen.add(key)
    entries.push({ id, en: e, zh: z, kind, tier, ...extra })
  }
  const gray = async (file) => {
    const { data, tier } = await readJson(root, file, sources)
    if (tier === 'gray' && !allowGray) {
      sources.pop()
      return null
    }
    return { data, tier }
  }

  // 各来源身份均保留；相同表面词的语义由正文匹配器按上下文处理。
  const asc = await readJson(root, 'data/dict/_overrides/ascendancies.json', sources, 'manual')
  for (const [code, v] of Object.entries(asc.data.entries))
    push(`asc:${code}`, v.en, v['zh-CN'], 'ascendancy', 'manual')
  const cls = await readJson(root, 'data/dict/_overrides/classes.json', sources, 'manual')
  for (const [code, v] of Object.entries(cls.data.entries))
    push(`class:${code}`, v.en, v['zh-CN'], 'class', 'manual')
  const gems = await gray('data/dict/zh-CN/gems.json')
  if (gems)
    for (const [id, v] of Object.entries(gems.data.entries))
      push(`gem:${id}`, v.en, v.text, 'gem', gems.tier)
  const passives = await gray('data/dict/zh-CN/passives.json')
  if (passives)
    for (const [id, v] of Object.entries(passives.data.entries))
      push(`passive:${id}`, v.en, v.text, 'passive', passives.tier)
  const items = await gray('data/dict/zh-CN/items.json')
  if (items) {
    for (const [en, zh] of Object.entries(items.data.bases ?? {}))
      push(`base:${en}`, en, zh, 'base', items.tier)
    for (const [en, zh] of Object.entries(items.data.uniques ?? {}))
      push(`unique:${en}`, en, zh, 'unique', items.tier)
  }
  const terms = await readJson(root, 'data/l10n/guide/terms.zh-CN.json', sources)
  // 排除名单：人工审定为不该作为名称识别的英文（如与修饰词重叠的天赋名），只去掉非手工条目
  const exclude = terms.data.exclude ?? []
  if (!Array.isArray(exclude) || exclude.some((x) => typeof x !== 'string' || !x.trim()))
    throw new Error('攻略术语排除名单必须是非空字符串数组')
  const excludedNames = new Set(exclude.map((x) => x.trim().toLowerCase()))
  const before = entries.length
  const kept = entries.filter((e) => e.tier === 'manual' || !excludedNames.has(e.en.toLowerCase()))
  entries.splice(0, entries.length, ...kept)
  const excluded = before - entries.length
  const ids = new Set(entries.map((e) => e.id))
  for (const t of terms.data.entries) {
    if (!['keyword', 'jargon'].includes(t.kind)) throw new Error(`攻略术语类型无效：${t.id}`)
    if (ids.has(t.id)) throw new Error(`攻略术语身份重复：${t.id}`)
    ids.add(t.id)
    if (
      t.matchWithoutContext !== undefined &&
      (t.matchWithoutContext !== true || t.kind !== 'keyword')
    )
      throw new Error(`攻略术语匹配例外无效：${t.id}`)
    const extra =
      Array.isArray(t.aliasesEn) && t.aliasesEn.length ? { aliasesEn: t.aliasesEn.map(clean) } : {}
    // 手工表不参与“同 en 同 zh 去重”：它要压过 gray 表的同名歧义
    const en = clean(t.en)
    const zh = clean(t.zh)
    if (rejected(en, zh)) throw new Error(`攻略术语无效：${t.id}`)
    entries.push({
      id: t.id,
      en,
      zh,
      kind: t.kind,
      tier: 'manual',
      ...extra,
      ...(t.matchWithoutContext === true ? { matchWithoutContext: true } : {}),
    })
  }
  const abbr = await readJson(root, 'data/l10n/guide/abbreviations.zh-CN.json', sources)
  const abbreviations = abbr.data.entries.map((a) => ({ en: clean(a.en), note: clean(a.note) }))
  if (abbreviations.some((a) => !a.en || !a.note)) throw new Error('简称表存在空字段')

  const sourceFiles = {
    ascendancy: 'data/dict/_overrides/ascendancies.json',
    class: 'data/dict/_overrides/classes.json',
    gem: 'data/dict/zh-CN/gems.json',
    passive: 'data/dict/zh-CN/passives.json',
    base: 'data/dict/zh-CN/items.json',
    unique: 'data/dict/zh-CN/items.json',
    keyword: 'data/l10n/guide/terms.zh-CN.json',
    jargon: 'data/l10n/guide/terms.zh-CN.json',
  }
  for (const entry of entries) {
    const source = sources.find((s) => s.path === sourceFiles[entry.kind])
    entry.provenance = {
      path: source.path,
      sha256: source.sha256,
      sourceId: ['keyword', 'jargon'].includes(entry.kind)
        ? entry.id
        : entry.id.slice(entry.id.indexOf(':') + 1),
      version: source.version,
      locale: 'zh-CN',
      purpose: 'guide-name',
    }
  }
  const ruleVersion = 'guide-terms-v2'
  const hash = sha(JSON.stringify({ ruleVersion, entries, abbreviations })).slice(0, 16)
  const result = {
    schemaVersion: 1,
    locale: 'zh-CN',
    ruleVersion,
    hash,
    entries,
    abbreviations,
    sources,
    allowGray,
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result)}\n`)
  // excluded 只供命令行报告，不写进词典文件
  return { ...result, excluded }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appRoot = fileURLToPath(new URL('../', import.meta.url))
  const repoRoot = path.join(appRoot, '../..')
  const output = path.join(appRoot, 'dist/assets/guide-dictionary.json')
  const result = await buildGuideDictionary(repoRoot, output, {
    allowGray: !process.argv.includes('--no-gray'),
  })
  console.log(
    `攻略词典：${result.entries.length} 条（手工 ${result.entries.filter((e) => e.tier === 'manual').length}，排除 ${result.excluded}），${result.abbreviations.length} 条简称，hash ${result.hash}`,
  )
}
