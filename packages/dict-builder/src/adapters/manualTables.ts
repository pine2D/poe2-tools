// data/dict/_overrides/ 下的手工表：三语行表 → 各 locale 的 NamesTable；以及 versions / stat-order / stat-winners 三份配置。
import type { Locale, NamesTable } from '@poe2-tools/build-core'
import { LOCALES } from '../config'

export interface OverrideRow {
  en: string
  'zh-CN': string
  'zh-TW': string
  [extra: string]: string | undefined
}

export interface OverrideTable {
  note: string
  updatedAt: string
  entries: Record<string, OverrideRow>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, where: string): string {
  if (typeof value !== 'string') throw new Error(`手工表形态不对：${where} 不是字符串`)
  return value
}

export function parseOverrideTable(name: string, raw: unknown): OverrideTable {
  if (!isRecord(raw)) throw new Error(`手工表形态不对：${name} 不是对象`)
  if (!isRecord(raw._meta)) throw new Error(`手工表形态不对：${name}._meta 不是对象`)
  const note = requireString(raw._meta.note, `${name}._meta.note`)
  const updatedAt = requireString(raw._meta.updatedAt, `${name}._meta.updatedAt`)
  if (!isRecord(raw.entries)) throw new Error(`手工表形态不对：${name}.entries 不是对象`)
  const entries: Record<string, OverrideRow> = {}
  for (const [key, row] of Object.entries(raw.entries)) {
    const where = `${name}.entries.${key}`
    if (!isRecord(row)) throw new Error(`手工表形态不对：${where} 不是对象`)
    const parsed: OverrideRow = {
      en: requireString(row.en, `${where}.en`),
      'zh-CN': requireString(row['zh-CN'], `${where}.zh-CN`),
      'zh-TW': requireString(row['zh-TW'], `${where}.zh-TW`),
    }
    for (const [column, value] of Object.entries(row)) {
      if (column === 'en' || column === 'zh-CN' || column === 'zh-TW') continue
      parsed[column] = requireString(value, `${where}.${column}`)
    }
    entries[key] = parsed
  }
  return { note, updatedAt, entries }
}

export function toNamesTable(
  table: OverrideTable,
  locale: Locale,
  source: string,
  gameVersion: string,
): NamesTable {
  const entries: Record<string, string> = {}
  for (const [key, row] of Object.entries(table.entries)) entries[key] = row[locale]
  return {
    _meta: {
      source,
      tier: 'manual',
      gameVersion,
      fetchedAt: table.updatedAt,
      count: Object.keys(entries).length,
    },
    entries,
  }
}

export function parseVersions(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) throw new Error('versions.json 不是对象')
  const versions: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_meta') continue
    versions[key] = requireString(value, `versions.${key}`)
  }
  return versions
}

// entries 按 locale 分节：{ "zh-CN": { "<id>#<k>": [..] }, "zh-TW": {...} }；缺省的节视为空
export function parseStatOrder(raw: unknown): Record<Locale, Record<string, number[]>> {
  if (!isRecord(raw) || !isRecord(raw.entries)) throw new Error('stat-order.json 缺少 entries 对象')
  const result: Record<Locale, Record<string, number[]>> = { 'zh-CN': {}, 'zh-TW': {} }
  for (const locale of LOCALES) {
    const section = raw.entries[locale]
    if (section === undefined) continue
    if (!isRecord(section)) throw new Error(`stat-order.json 形态不对：entries.${locale} 不是对象`)
    for (const [id, value] of Object.entries(section)) {
      if (!Array.isArray(value) || !value.every((n) => typeof n === 'number'))
        throw new Error(`stat-order.json 形态不对：entries.${locale}.${id} 不是数字数组`)
      result[locale][id] = value.map((n) => Number(n))
    }
  }
  return result
}

// entries 按 locale 分节：{ "zh-CN": { "<模板键>": "<stat id>" }, "zh-TW": {...} }；缺省的节视为空
export function parseStatWinners(raw: unknown): Record<Locale, Record<string, string>> {
  if (!isRecord(raw) || !isRecord(raw.entries))
    throw new Error('stat-winners.json 缺少 entries 对象')
  const result: Record<Locale, Record<string, string>> = { 'zh-CN': {}, 'zh-TW': {} }
  for (const locale of LOCALES) {
    const section = raw.entries[locale]
    if (section === undefined) continue
    if (!isRecord(section))
      throw new Error(`stat-winners.json 形态不对：entries.${locale} 不是对象`)
    for (const [key, value] of Object.entries(section)) {
      result[locale][key] = requireString(value, `stat-winners.json.entries.${locale}.${key}`)
    }
  }
  return result
}
