// 词典数据的解析期校验：把 unknown（如 JSON.parse 的产物）安全收窄成 DictBundle。
// 只做结构校验，不做质量审计（质量审计见 audit.ts）。
import type {
  DictBundle,
  DictMeta,
  ItemsDict,
  Locale,
  NamedDict,
  NamedEntry,
  NamesTable,
  StatEntry,
  StatsDict,
} from './types'

export type ParseDictResult = { ok: true; bundle: DictBundle } | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMeta(table: string, raw: unknown): DictMeta | string {
  if (!isRecord(raw)) return `${table}._meta 不是对象`
  const { source, tier, gameVersion, fetchedAt, count } = raw
  if (typeof source !== 'string') return `${table}._meta.source 不是字符串`
  if (typeof gameVersion !== 'string') return `${table}._meta.gameVersion 不是字符串`
  if (typeof fetchedAt !== 'string') return `${table}._meta.fetchedAt 不是字符串`
  if (tier !== 'primary' && tier !== 'gray' && tier !== 'manual')
    return `${table}._meta.tier 不合法`
  if (typeof count !== 'number') return `${table}._meta.count 不是数字`
  return { source, tier, gameVersion, fetchedAt, count }
}

function parseStatEntry(index: number, raw: unknown): StatEntry | string {
  const table = `stats.entries[${index}]`
  if (!isRecord(raw)) return `${table} 不是对象`
  const { id, en, text, order } = raw
  if (typeof id !== 'string') return `${table}.id 不是字符串`
  if (typeof en !== 'string') return `${table}.en 不是字符串`
  if (typeof text !== 'string') return `${table}.text 不是字符串`
  if (order === undefined) return { id, en, text }
  if (!Array.isArray(order)) return `${table}.order 不是数字数组`
  const values: number[] = []
  for (const value of order) {
    if (typeof value !== 'number') return `${table}.order 不是数字数组`
    values.push(value)
  }
  return { id, en, text, order: values }
}

function parseStats(raw: unknown): StatsDict | string {
  if (!isRecord(raw)) return 'stats 不是对象'
  const meta = parseMeta('stats', raw._meta)
  if (typeof meta === 'string') return meta
  if (!Array.isArray(raw.entries)) return 'stats.entries 不是数组'
  const entries: StatEntry[] = []
  for (const [index, item] of raw.entries.entries()) {
    const entry = parseStatEntry(index, item)
    if (typeof entry === 'string') return entry
    entries.push(entry)
  }
  return { _meta: meta, entries }
}

function parseStringRecord(table: string, raw: unknown): Record<string, string> | string {
  if (!isRecord(raw)) return `${table} 不是对象`
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') return `${table}.${key} 不是字符串`
    result[key] = value
  }
  return result
}

function parseItems(raw: unknown): ItemsDict | string {
  if (!isRecord(raw)) return 'items 不是对象'
  const meta = parseMeta('items', raw._meta)
  if (typeof meta === 'string') return meta
  const bases = parseStringRecord('items.bases', raw.bases)
  if (typeof bases === 'string') return bases
  const uniques = parseStringRecord('items.uniques', raw.uniques)
  if (typeof uniques === 'string') return uniques
  return { _meta: meta, bases, uniques }
}

function parseNamedEntry(table: string, key: string, raw: unknown): NamedEntry | string {
  if (!isRecord(raw)) return `${table}.entries.${key} 不是对象`
  const { en, text } = raw
  if (typeof en !== 'string') return `${table}.entries.${key}.en 不是字符串`
  if (typeof text !== 'string') return `${table}.entries.${key}.text 不是字符串`
  return { en, text }
}

function parseNamedDict(table: string, raw: unknown): NamedDict | string {
  if (!isRecord(raw)) return `${table} 不是对象`
  const meta = parseMeta(table, raw._meta)
  if (typeof meta === 'string') return meta
  if (!isRecord(raw.entries)) return `${table}.entries 不是对象`
  const entries: Record<string, NamedEntry> = {}
  for (const [key, value] of Object.entries(raw.entries)) {
    const entry = parseNamedEntry(table, key, value)
    if (typeof entry === 'string') return entry
    entries[key] = entry
  }
  return { _meta: meta, entries }
}

function parseNamesTable(table: string, raw: unknown): NamesTable | string {
  if (!isRecord(raw)) return `${table} 不是对象`
  const meta = parseMeta(table, raw._meta)
  if (typeof meta === 'string') return meta
  const entries = parseStringRecord(`${table}.entries`, raw.entries)
  if (typeof entries === 'string') return entries
  return { _meta: meta, entries }
}

// raw 应为对象，可含键 stats/items/gems/passives/ascendancies/inventories（均可缺省，缺省即不
// 放进 bundle）；未知键忽略。逐表校验，失败时指出表名与第一处不合法的位置。
export function parseDictBundle(raw: unknown, locale: Locale): ParseDictResult {
  if (!isRecord(raw)) return { ok: false, error: '词典数据不是对象' }
  const bundle: DictBundle = { locale }
  if (raw.stats !== undefined) {
    const stats = parseStats(raw.stats)
    if (typeof stats === 'string') return { ok: false, error: stats }
    bundle.stats = stats
  }
  if (raw.items !== undefined) {
    const items = parseItems(raw.items)
    if (typeof items === 'string') return { ok: false, error: items }
    bundle.items = items
  }
  if (raw.gems !== undefined) {
    const gems = parseNamedDict('gems', raw.gems)
    if (typeof gems === 'string') return { ok: false, error: gems }
    bundle.gems = gems
  }
  if (raw.passives !== undefined) {
    const passives = parseNamedDict('passives', raw.passives)
    if (typeof passives === 'string') return { ok: false, error: passives }
    bundle.passives = passives
  }
  if (raw.ascendancies !== undefined) {
    const ascendancies = parseNamesTable('ascendancies', raw.ascendancies)
    if (typeof ascendancies === 'string') return { ok: false, error: ascendancies }
    bundle.ascendancies = ascendancies
  }
  if (raw.inventories !== undefined) {
    const inventories = parseNamesTable('inventories', raw.inventories)
    if (typeof inventories === 'string') return { ok: false, error: inventories }
    bundle.inventories = inventories
  }
  return { ok: true, bundle }
}
