import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  for (const [relative, kind] of [
    ['data/dict/zh-CN/items.json', 'items'],
    ['data/dict/zh-CN/stats.json', 'stats'],
    ['data/l10n/coe-beta/tablets.zh-CN.json', 'items'],
  ]) {
    const entry = await read(relative)
    const { _meta: meta } = entry.data
    if (!['primary', 'gray', 'manual'].includes(meta?.tier))
      throw new Error(`词典来源等级缺失：${relative}`)
    if (!allowGray && meta.tier === 'gray') continue
    sources.push({
      path: entry.path,
      sha256: entry.sha256,
      tier: meta.tier,
      source: meta.source,
      version: meta.gameVersion,
    })
    if (kind === 'items') {
      for (const [field, domain] of [
        ['bases', 'base'],
        ['uniques', 'unique'],
      ]) {
        for (const [en, zh] of Object.entries(entry.data[field]))
          add(`${domain}:${en}`, en, zh, domain, entry.path, meta.gameVersion)
      }
    } else {
      for (const stat of entry.data.entries)
        add(
          `stat:${stat.id}:${createHash('sha256')
            .update(JSON.stringify([stat.en, stat.text, stat.order ?? null]))
            .digest('hex')
            .slice(0, 16)}`,
          stat.en,
          stat.text,
          'stat',
          entry.path,
          meta.gameVersion,
          { sourceId: stat.id, ...(stat.order ? { order: stat.order } : {}) },
        )
    }
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
