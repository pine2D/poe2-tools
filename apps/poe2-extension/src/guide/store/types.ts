import type { Issue } from '@poe2-tools/guide-core'
import type { Provider } from '../engines/openai'

// 当前只保存一条 Key：用户选定的那个服务。换服务即覆盖。
export interface KeyRecord {
  provider: Provider
  baseUrl: string
  origin: string
  model: string
  apiKey: string
}

// 缓存只存哈希与译文，不存原文。
export interface CachedTranslation {
  hash: string
  text: string
  issues: Issue[]
}

export interface GuideStore {
  getKey(): Promise<KeyRecord | null>
  putKey(record: KeyRecord): Promise<void>
  deleteKey(): Promise<void>
  getCached(hash: string): Promise<CachedTranslation | null>
  putCached(entry: CachedTranslation): Promise<void>
  usage(): Promise<number>
  clearCache(): Promise<void>
  clearAll(): Promise<void>
}

export const entrySize = (e: CachedTranslation) =>
  (e.hash.length + e.text.length + JSON.stringify(e.issues).length) * 2 + 64
