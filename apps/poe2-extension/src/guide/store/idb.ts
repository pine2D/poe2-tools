import { type CachedTranslation, entrySize, type GuideStore, type KeyRecord } from './types'

// 扩展来源（chrome-extension://<id>）的 IndexedDB：网页与内容脚本都在页面来源下，读不到这里。
const DB = 'poe2-guide'
const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })

interface Row extends CachedTranslation {
  size: number
  lastUsed: number
}

export function createIdbStore(options: {
  factory: IDBFactory
  capacityBytes: number
  now: () => number
}): GuideStore {
  let opened: Promise<IDBDatabase> | null = null
  const db = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = options.factory.open(DB, 1)
      r.onupgradeneeded = () => {
        const d = r.result
        d.createObjectStore('meta')
        d.createObjectStore('cache', { keyPath: 'hash' }).createIndex('lastUsed', 'lastUsed')
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return opened
  }

  const usageIn = async (meta: IDBObjectStore) =>
    ((await req(meta.get('usage'))) as number | undefined) ?? 0

  return {
    async getKey() {
      const tx = (await db()).transaction('meta')
      return ((await req(tx.objectStore('meta').get('key'))) as KeyRecord | undefined) ?? null
    },
    async putKey(record) {
      const tx = (await db()).transaction('meta', 'readwrite')
      tx.objectStore('meta').put(record, 'key')
      await done(tx)
    },
    async deleteKey() {
      const tx = (await db()).transaction('meta', 'readwrite')
      tx.objectStore('meta').delete('key')
      await done(tx)
    },
    async getCached(hash) {
      const tx = (await db()).transaction('cache', 'readwrite')
      const store = tx.objectStore('cache')
      const row = (await req(store.get(hash))) as Row | undefined
      if (!row) return null
      row.lastUsed = options.now()
      store.put(row)
      await done(tx)
      return { hash: row.hash, text: row.text, issues: row.issues }
    },
    async putCached(entry) {
      const tx = (await db()).transaction(['cache', 'meta'], 'readwrite')
      const cache = tx.objectStore('cache')
      const meta = tx.objectStore('meta')
      let used = await usageIn(meta)
      const old = (await req(cache.get(entry.hash))) as Row | undefined
      if (old) used -= old.size
      const row: Row = { ...entry, size: entrySize(entry), lastUsed: options.now() }
      cache.put(row)
      used += row.size
      if (used > options.capacityBytes) {
        const target = options.capacityBytes * 0.9
        const cursorReq = cache.index('lastUsed').openCursor()
        await new Promise<void>((resolve, reject) => {
          cursorReq.onerror = () => reject(cursorReq.error)
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result
            if (!cursor || used <= target) return resolve()
            const victim = cursor.value as Row
            if (victim.hash !== row.hash) {
              used -= victim.size
              cursor.delete()
            }
            cursor.continue()
          }
        })
      }
      meta.put(used, 'usage')
      await done(tx)
    },
    async usage() {
      const tx = (await db()).transaction('meta')
      return usageIn(tx.objectStore('meta'))
    },
    async clearCache() {
      const tx = (await db()).transaction(['cache', 'meta'], 'readwrite')
      tx.objectStore('cache').clear()
      tx.objectStore('meta').put(0, 'usage')
      await done(tx)
    },
    async clearAll() {
      const tx = (await db()).transaction(['cache', 'meta'], 'readwrite')
      tx.objectStore('cache').clear()
      tx.objectStore('meta').clear()
      await done(tx)
    },
  }
}
