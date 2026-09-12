import type { CraftCatalog } from '@poe2-tools/item-core'

type Locale = 'zh-CN' | 'zh-TW'
interface StaticEntry {
  text: string
  image?: string
}
interface NameAudit {
  candidates: number
  joined: number
  missing: string[]
  extra: string[]
  names: number
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseStatic(value: unknown, locale: string): Map<string, StaticEntry> {
  if (!record(value) || !Array.isArray(value.result))
    throw new Error(`${locale} static 缺少 result 数组`)
  const entries = new Map<string, StaticEntry>()
  for (const group of value.result) {
    if (
      !record(group) ||
      typeof group.id !== 'string' ||
      !group.id ||
      !Array.isArray(group.entries)
    )
      throw new Error(`${locale} static 分组格式不合法`)
    for (const entry of group.entries) {
      if (!record(entry) || typeof entry.id !== 'string' || !entry.id)
        throw new Error(`${locale} static 条目缺少 id`)
      if (entry.id === 'sep') continue
      if (
        typeof entry.text !== 'string' ||
        (entry.image !== undefined && typeof entry.image !== 'string')
      )
        throw new Error(`${locale} static 条目格式不合法：${entry.id}`)
      if (!entry.text.trim()) continue
      const key = JSON.stringify([group.id, entry.id])
      if (entries.has(key)) throw new Error(`${locale} static 重复稳定键：${key}`)
      entries.set(key, {
        text: entry.text,
        ...(entry.image === undefined ? {} : { image: entry.image }),
      })
    }
  }
  return entries
}

/** 只做精确身份关联；简繁独立生成，缺项审计，不猜名称。 */
export function buildCraftNames(input: { en: unknown; 'zh-CN': unknown; 'zh-TW': unknown }): {
  localizedNames: NonNullable<CraftCatalog['localizedNames']>
  audit: Record<Locale, NameAudit>
} {
  const en = parseStatic(input.en, 'en')
  const localizedNames = { 'zh-CN': {}, 'zh-TW': {} }
  const audit = {} as Record<Locale, NameAudit>
  for (const locale of ['zh-CN', 'zh-TW'] as const) {
    const target = parseStatic(input[locale], locale)
    const names = new Map<string, string>()
    const counts: NameAudit = {
      candidates: en.size,
      joined: 0,
      missing: [],
      extra: [...target.keys()].filter((key) => !en.has(key)).sort(),
      names: 0,
    }
    for (const [key, source] of en) {
      const match = target.get(key)
      if (!match) {
        counts.missing.push(key)
        continue
      }
      if (source.image !== undefined && match.image !== undefined && source.image !== match.image)
        throw new Error(`${locale} static 图片身份冲突：${key}`)
      if (names.has(source.text) && names.get(source.text) !== match.text)
        throw new Error(`${locale} static 英文名称冲突：${source.text}（${key}）`)
      names.set(source.text, match.text)
      counts.joined += 1
    }
    counts.missing.sort()
    counts.names = names.size
    localizedNames[locale] = Object.fromEntries(
      [...names].sort(([a], [b]) => a.localeCompare(b, 'en')),
    )
    audit[locale] = counts
  }
  return { localizedNames, audit }
}
