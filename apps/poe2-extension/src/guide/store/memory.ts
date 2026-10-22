import { type CachedTranslation, entrySize, type GuideStore, type KeyRecord } from './types'

interface Row extends CachedTranslation {
  size: number
  lastUsed: number
}

export function createMemoryStore(options: {
  capacityBytes: number
  now: () => number
}): GuideStore {
  let key: KeyRecord | null = null
  const cache = new Map<string, Row>()
  let used = 0
  const evict = () => {
    if (used <= options.capacityBytes) return
    const target = options.capacityBytes * 0.9
    for (const row of [...cache.values()].sort((a, b) => a.lastUsed - b.lastUsed)) {
      if (used <= target) break
      cache.delete(row.hash)
      used -= row.size
    }
  }
  return {
    async getKey() {
      return key
    },
    async putKey(record) {
      key = { ...record }
    },
    async deleteKey() {
      key = null
    },
    async getCached(hash) {
      const row = cache.get(hash)
      if (!row) return null
      row.lastUsed = options.now()
      return { hash: row.hash, text: row.text, issues: row.issues }
    },
    async putCached(entry) {
      const old = cache.get(entry.hash)
      if (old) used -= old.size
      const row: Row = { ...entry, size: entrySize(entry), lastUsed: options.now() }
      cache.set(entry.hash, row)
      used += row.size
      evict()
    },
    async usage() {
      return used
    },
    async clearCache() {
      cache.clear()
      used = 0
    },
    async clearAll() {
      cache.clear()
      used = 0
      key = null
    },
  }
}
