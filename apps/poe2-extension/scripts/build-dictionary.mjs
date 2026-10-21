import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { statTerm, validateStatSource } from './stat-source.mjs'

export async function buildDictionary(root, output, { allowGray = true } = {}) {
  const terms = []
  const sources = []
  async function read(relative) {
    const bytes = await readFile(path.join(root, relative))
    return {
      data: JSON.parse(bytes.toString()),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      path: relative,
    }
  }
  function add(id, en, zh, domain, source, version, extra = {}) {
    terms.push({ id, en, zh, domain, source, version, ...extra })
  }
  const decisions = await read('data/l10n/stat-decisions.json')
  sources.push({
    path: decisions.path,
    sha256: decisions.sha256,
    tier: 'manual',
    source: decisions.data._meta.source,
    version: decisions.data._meta.updatedAt,
  })
  for (const [relative, kind, inputOnly = false] of [
    ['data/dict/zh-CN/items.json', 'items'],
    ['data/l10n/stats/zh-CN.json', 'stats'],
    ['data/l10n/coe-beta/tablets.zh-CN.json', 'items'],
    ['data/dict/zh-TW/items.json', 'items', true],
    ['data/l10n/stats/zh-TW.json', 'stats', true],
  ]) {
    const entry = await read(relative)
    const { _meta: meta } = entry.data
    if (!['primary', 'gray', 'manual'].includes(meta?.tier))
      throw new Error(`词典来源等级缺失：${relative}`)
    if (!allowGray && meta.tier === 'gray') continue
    if (kind === 'stats') {
      const locale = inputOnly ? 'zh-TW' : 'zh-CN'
      validateStatSource(entry.data, decisions.data.entries[locale], locale)
    }
    sources.push({
      path: entry.path,
      sha256: entry.sha256,
      tier: meta.tier,
      source: meta.source,
      version: meta.gameVersion,
      ...(kind === 'stats' ? { snapshots: meta.sources, decisions: meta.decisions } : {}),
    })
    if (kind === 'items') {
      for (const [field, domain] of [
        ['bases', 'base'],
        ['uniques', 'unique'],
      ]) {
        for (const [en, zh] of Object.entries(entry.data[field]))
          add(
            `${inputOnly ? 'input:zh-TW:' : ''}${domain}:${en}`,
            en,
            zh,
            domain,
            entry.path,
            meta.gameVersion,
            inputOnly ? { inputOnly: true } : {},
          )
      }
    } else {
      for (const stat of entry.data.entries)
        terms.push(statTerm(stat, entry.path, meta.gameVersion, { inputOnly }))
    }
  }
  // 从已验证的原始国服结构投影分类名，保留来源身份；不从台服或自由文本猜译。
  for (const term of [...terms]) {
    if (term.inputOnly || term.domain !== 'stat') continue
    const roll = /^Can roll (.+) modifiers$/i.exec(term.en)
    const rollZh = /^可以(?:重置|选取)(.+)词缀$/.exec(term.zh)
    const tribute =
      /^Glorifying the defilement of # souls in tribute to (\w+) Passives in radius/.exec(term.en)
    const tributeZh = /^赞颂以(.+?)之名亵渎的/.exec(term.zh)
    const pair =
      roll && rollZh
        ? [roll[1], rollZh[1]]
        : tribute && tributeZh
          ? [tribute[1], tributeZh[1]]
          : null
    if (pair)
      add(`ui-label:${term.id}`, pair[0], pair[1], 'ui', term.source, term.version, {
        sourceId: term.sourceId,
      })
  }
  const variants = await read('data/l10n/coe-beta/stat-variants.zh-CN.json')
  sources.push({
    path: variants.path,
    sha256: variants.sha256,
    tier: 'manual',
    source: variants.data._meta.source,
    version: variants.data._meta.updatedAt,
  })
  for (const variant of variants.data.entries) {
    if (
      !variant.evidence ||
      !variant.reason ||
      !terms.some(
        (t) =>
          !t.inputOnly &&
          t.domain === 'stat' &&
          t.sourceId === variant.sourceId &&
          t.en === variant.sourceEn &&
          t.zh === variant.sourceZh,
      )
    )
      throw new Error(`展示变体缺少仍有效的原始来源：${variant.id}`)
    add(
      `stat-variant:${variant.id}`,
      variant.en,
      variant.zh,
      'stat',
      variants.path,
      variants.data._meta.gameVersion,
      { sourceId: variant.sourceId },
    )
  }
  // 官方静态名称的版本独立于制作目录；这里只裁剪名称，不携带规则与候选池。
  const catalog = await read('data/craft/catalog.json')
  const nameSources = catalog.data._meta.nameSources.filter(
    (s) => s.locale === 'en' || s.locale === 'zh-CN',
  )
  if (nameSources.length !== 2) throw new Error('缺少英文／国服名称来源')
  sources.push({
    path: catalog.path,
    sha256: catalog.sha256,
    tier: 'primary',
    source: nameSources,
    version: 'unknown',
  })
  for (const [en, zh] of Object.entries(catalog.data.localizedNames['zh-CN']))
    add(`item:${en}`, en, zh, 'item', catalog.path, 'unknown')
  const affixes = await read('data/l10n/coe-beta/affix-names.zh-CN.json')
  sources.push({
    path: affixes.path,
    sha256: affixes.sha256,
    tier: 'manual',
    source: affixes.data._meta.source,
    version: affixes.data._meta.gameVersion,
  })
  for (const entry of affixes.data.entries) {
    const source = catalog.data.modifiers?.find((mod) => mod.id === entry.id)
    if (
      !source ||
      source.name !== entry.en ||
      source.kind !== entry.kind ||
      !['prefix', 'suffix'].includes(entry.kind) ||
      !entry.zh?.trim()
    )
      throw new Error(`词缀名称缺少仍有效的来源身份：${entry.id}`)
    const prefix = entry.kind === 'prefix'
    add(
      `affix-name:${entry.id}`,
      `${prefix ? 'Prefix' : 'Suffix'} modifier "${entry.en}"`,
      `${prefix ? '前缀属性' : '后缀属性'} "${entry.zh}"`,
      'ui',
      affixes.path,
      affixes.data._meta.gameVersion,
      { sourceId: entry.id },
    )
  }
  const ui = await read('data/l10n/coe-beta/ui.zh-CN.json')
  sources.push({
    path: ui.path,
    sha256: ui.sha256,
    tier: 'manual',
    source: ui.data._meta.source,
    version: ui.data._meta.gameVersion,
  })
  for (const [en, zh] of Object.entries(ui.data.entries))
    add(`ui:${en}`, en, zh, 'ui', ui.path, ui.data._meta.gameVersion)
  const aliases = await read('data/l10n/aliases.zh-CN.json')
  sources.push({
    path: aliases.path,
    sha256: aliases.sha256,
    tier: 'manual',
    source: 'manual',
    version: '1',
  })
  for (const entry of aliases.data.entries) {
    const term = terms.find((t) => t.id === entry.id)
    if (!term) throw new Error(`别名缺少对应身份：${entry.id}`)
    term.aliases = entry.aliases
  }
  const result = { schemaVersion: 1, locale: 'zh-CN', terms, sources, allowGray }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result)}\n`)
  return result
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../../', import.meta.url))
  const result = await buildDictionary(
    root,
    path.join(root, 'apps/poe2-extension/dist/assets/dictionary.json'),
    { allowGray: !process.argv.includes('--no-gray') },
  )
  console.log(`扩展词典：${result.terms.length} 条，${result.sources.length} 项来源`)
}
