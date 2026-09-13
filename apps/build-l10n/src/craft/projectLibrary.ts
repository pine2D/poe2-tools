import { MAX_CRAFT_PROJECT_BYTES } from '@poe2-tools/item-core'

export const LIBRARY_PREFIX = 'poe2-tools:craft-library:v1:'
const MAX_ENTRIES = 20
const MAX_STORAGE_BYTES = 4 * 1024 * 1024
export interface LibraryEntry {
  key: string
  name: string
  savedAt: string | null
  text: string | null
  error?: string
  storageBytes: number
}

/** 每个项目独立存储，新增和移除不会回写其他标签页的收藏。 */
export function readLibrary(storage: Storage): LibraryEntry[] {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
    (key): key is string => key?.startsWith(LIBRARY_PREFIX) === true,
  )
  return keys
    .flatMap((key): LibraryEntry[] => {
      const raw = storage.getItem(key)
      if (raw === null) return []
      const storageBytes = 2 * (key.length + raw.length)
      try {
        const data: unknown = JSON.parse(raw)
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
        const entry = data as Record<string, unknown>
        if (
          entry.version !== 1 ||
          typeof entry.name !== 'string' ||
          !entry.name.trim() ||
          entry.name.length > 80 ||
          typeof entry.savedAt !== 'string' ||
          !Number.isFinite(Date.parse(entry.savedAt)) ||
          typeof entry.text !== 'string' ||
          new Blob([entry.text]).size > MAX_CRAFT_PROJECT_BYTES
        )
          throw new Error()
        return [{ key, name: entry.name, savedAt: entry.savedAt, text: entry.text, storageBytes }]
      } catch {
        return [
          {
            key,
            name: '无法读取的收藏',
            savedAt: null,
            text: null,
            storageBytes,
            error: '收藏记录损坏或格式不受支持；原记录仍保留。',
          },
        ]
      }
    })
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || a.key.localeCompare(b.key))
}

export async function addLibraryEntry(storage: Storage, name: string, text: string): Promise<void> {
  await withLibraryLock(() => writeLibraryEntry(storage, name, text))
}

function writeLibraryEntry(storage: Storage, name: string, text: string): void {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) throw new Error('收藏名称须为 1–80 个字符。')
  if (new Blob([text]).size > MAX_CRAFT_PROJECT_BYTES) throw new Error('演练项目超过 2 MB 限制。')
  const entries = readLibrary(storage)
  if (entries.length >= MAX_ENTRIES) throw new Error('最多收藏 20 份演练，请先导出或移除旧收藏。')
  const key = LIBRARY_PREFIX + crypto.randomUUID()
  if (storage.getItem(key) !== null) throw new Error('收藏标识冲突，请重试。')
  const raw = JSON.stringify({ version: 1, name: trimmed, savedAt: new Date().toISOString(), text })
  if (
    entries.reduce((sum, entry) => sum + entry.storageBytes, 0) + 2 * (key.length + raw.length) >
    MAX_STORAGE_BYTES
  )
    throw new Error('演练收藏空间超过 4 MB，请导出项目备份或移除旧收藏。')
  storage.setItem(key, raw)
}

export async function removeLibraryEntry(storage: Storage, key: string): Promise<void> {
  if (!key.startsWith(LIBRARY_PREFIX)) throw new Error('不是演练收藏记录。')
  await withLibraryLock(() => storage.removeItem(key))
}

async function withLibraryLock(action: () => void): Promise<void> {
  if (!navigator.locks?.request)
    throw new Error('当前浏览器不支持演练收藏所需的存储锁，请使用导出项目保存。')
  await navigator.locks.request('poe2-tools:craft-library:write', action)
}
