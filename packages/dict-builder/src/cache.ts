// 唯一发生网络请求的模块。按日缓存原始响应体（不加壳）与侧车溯源信息；离线时复用最近一次。
// poe2db 页面抓取要求串行且相邻真实请求至少间隔 minIntervalMs：由模块级 lastNetworkAt 统一节流。
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256 } from './util/json'

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
  headers: { get(name: string): string | null }
}>

export interface CacheMeta {
  url: string
  fetchedAt: string
  httpStatus: number
  sha256: string
  lastModified: string | null
  ua: string
}

export interface FetchOptions {
  cacheDir: string
  today: string
  offline: boolean
  ua: string
  fetchImpl?: FetchLike
  ext?: string
  // 与上一次真实网络请求的最小间隔（毫秒）；命中缓存不等待
  minIntervalMs?: number
}

export interface Fetched {
  body: string
  meta: CacheMeta
  fromCache: boolean
  path: string
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init)

let lastNetworkAt = 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readMeta(metaPath: string): Promise<CacheMeta | null> {
  try {
    return JSON.parse(await readFile(metaPath, 'utf8')) as CacheMeta
  } catch {
    return null
  }
}

// 找同名缓存中日期最新的一份（文件名 <name>-YYYY-MM-DD.<ext>）
async function findLatest(cacheDir: string, name: string, ext: string): Promise<string | null> {
  const pattern = new RegExp(`^${escapeRegex(name)}-\\d{4}-\\d{2}-\\d{2}\\.${escapeRegex(ext)}$`)
  const files = (await readdir(cacheDir)).filter((f) => pattern.test(f)).sort()
  const latest = files.at(-1)
  return latest === undefined ? null : join(cacheDir, latest)
}

function metaPathOf(bodyPath: string, ext: string): string {
  return `${bodyPath.slice(0, -(ext.length + 1))}.meta.json`
}

// 侧车缺失时的兜底溯源：fetchedAt 取正文文件的 mtime，不再留空串
async function fallbackMeta(
  url: string,
  ua: string,
  body: string,
  bodyPath: string,
): Promise<CacheMeta> {
  const info = await stat(bodyPath)
  return {
    url,
    fetchedAt: info.mtime.toISOString(),
    httpStatus: 0,
    sha256: sha256(body),
    lastModified: null,
    ua,
  }
}

export async function fetchCached(
  name: string,
  url: string,
  options: FetchOptions,
): Promise<Fetched> {
  const ext = options.ext ?? 'json'
  await mkdir(options.cacheDir, { recursive: true })
  const todayPath = join(options.cacheDir, `${name}-${options.today}.${ext}`)

  const cachedPath = options.offline
    ? await findLatest(options.cacheDir, name, ext)
    : await existing(todayPath)
  if (cachedPath !== null) {
    const body = await readFile(cachedPath, 'utf8')
    const meta =
      (await readMeta(metaPathOf(cachedPath, ext))) ??
      (await fallbackMeta(url, options.ua, body, cachedPath))
    return { body, meta, fromCache: true, path: cachedPath }
  }
  if (options.offline) throw new Error(`离线模式下没有 ${name} 的缓存（${options.cacheDir}）`)

  const fetchImpl = options.fetchImpl ?? defaultFetch
  const wait = lastNetworkAt + (options.minIntervalMs ?? 0) - Date.now()
  if (wait > 0) await sleep(wait)
  lastNetworkAt = Date.now()
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': options.ua, Accept: ext === 'json' ? 'application/json' : '*/*' },
  })
  if (!response.ok) throw new Error(`请求失败 HTTP ${response.status}：${url}`)
  const body = await response.text()
  const meta: CacheMeta = {
    url,
    fetchedAt: new Date().toISOString(),
    httpStatus: response.status,
    sha256: sha256(body),
    lastModified: response.headers.get('last-modified'),
    ua: options.ua,
  }
  await writeFile(todayPath, body, 'utf8')
  await writeFile(metaPathOf(todayPath, ext), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  return { body, meta, fromCache: false, path: todayPath }
}

async function existing(path: string): Promise<string | null> {
  try {
    await stat(path)
    return path
  } catch {
    return null
  }
}
