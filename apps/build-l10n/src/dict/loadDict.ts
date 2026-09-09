// 词典加载：按 locale 从本站静态文件取七张表（灰区表缺失只降级），经 build-core 校验并建索引；
// 每个 locale 只加载一次。浏览器里除本站静态文件外不请求任何地址。
import {
  buildDictIndex,
  type DictBundle,
  type DictIndex,
  type Locale,
  parseDictBundle,
} from '@poe2-tools/build-core'
import { errorMessage } from '../util/errorMessage'

export const DICT_TABLES = [
  'stats',
  'items',
  'gems',
  'passives',
  'ascendancies',
  'classes',
  'inventories',
] as const
export type DictTable = (typeof DICT_TABLES)[number]

// 灰区表：站点没带也能用（预览退化为显示 id / 英文）
const OPTIONAL_TABLES: ReadonlySet<DictTable> = new Set<DictTable>(['items', 'gems', 'passives'])

export interface DictInfo {
  gameVersion: string | null
  leagueName: string | null
}

export interface LoadedDict {
  locale: Locale
  bundle: DictBundle
  index: DictIndex
  info: DictInfo
  missing: DictTable[]
}

export type LoadDictResult = { ok: true; dict: LoadedDict } | { ok: false; error: string }

export interface JsonResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}
export type FetchJson = (url: string) => Promise<JsonResponse>

type TableFetch =
  | { kind: 'ok'; value: unknown }
  | { kind: 'missing' }
  | { kind: 'error'; error: string }

const defaultFetch: FetchJson = (url) => fetch(url)

export function dictUrl(base: string, locale: Locale, file: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}dict/${locale}/${file}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toInfo(raw: unknown): DictInfo {
  if (!isRecord(raw)) return { gameVersion: null, leagueName: null }
  return {
    gameVersion: typeof raw.gameVersion === 'string' ? raw.gameVersion : null,
    leagueName: typeof raw.leagueName === 'string' ? raw.leagueName : null,
  }
}

async function fetchTable(url: string, fetchImpl: FetchJson): Promise<TableFetch> {
  let response: JsonResponse
  try {
    response = await fetchImpl(url)
  } catch (error) {
    return { kind: 'error', error: `请求失败（${errorMessage(error)}）` }
  }
  if (response.status === 404) return { kind: 'missing' }
  if (!response.ok) return { kind: 'error', error: `HTTP ${response.status}` }
  try {
    return { kind: 'ok', value: await response.json() }
  } catch (error) {
    return { kind: 'error', error: `不是合法 JSON（${errorMessage(error)}）` }
  }
}

export async function loadDict(
  locale: Locale,
  base: string,
  fetchImpl: FetchJson = defaultFetch,
): Promise<LoadDictResult> {
  const raw: Record<string, unknown> = {}
  const missing: DictTable[] = []
  // 七张表并发取，取回后按 DICT_TABLES 固定顺序遍历套用判定，
  // 保证报错信息稳定指向顺序中第一张出问题的表
  const tableFetches = await Promise.all(
    DICT_TABLES.map(async (table) => ({
      table,
      result: await fetchTable(dictUrl(base, locale, `${table}.json`), fetchImpl),
    })),
  )
  for (const { table, result } of tableFetches) {
    if (result.kind === 'ok') {
      raw[table] = result.value
      continue
    }
    if (result.kind === 'missing' && OPTIONAL_TABLES.has(table)) {
      missing.push(table)
      continue
    }
    const reason = result.kind === 'missing' ? 'HTTP 404' : result.error
    return { ok: false, error: `${locale}/${table}.json：${reason}` }
  }
  const parsed = parseDictBundle(raw, locale)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const meta = await fetchTable(dictUrl(base, locale, 'meta.json'), fetchImpl)
  return {
    ok: true,
    dict: {
      locale,
      bundle: parsed.bundle,
      index: buildDictIndex(parsed.bundle),
      info: toInfo(meta.kind === 'ok' ? meta.value : null),
      missing,
    },
  }
}

// 每个 locale 只加载一次；失败不缓存，下次调用重试
export function createDictLoader(
  base: string,
  fetchImpl: FetchJson = defaultFetch,
): (locale: Locale) => Promise<LoadDictResult> {
  const cache = new Map<Locale, Promise<LoadDictResult>>()
  return (locale) => {
    const cached = cache.get(locale)
    if (cached !== undefined) return cached
    const pending = loadDict(locale, base, fetchImpl).then((result) => {
      if (!result.ok) cache.delete(locale)
      return result
    })
    cache.set(locale, pending)
    return pending
  }
}
