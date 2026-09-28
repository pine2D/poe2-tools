import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addLibraryEntry, LIBRARY_PREFIX, readLibrary, removeLibraryEntry } from './projectLibrary'

beforeEach(() => {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, callback: () => unknown) => callback(),
    },
  })
})
afterEach(() => {
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'locks')
  vi.restoreAllMocks()
})
it('每份收藏独立存储，同名保存副本不会覆盖或改动快速保存槽', async () => {
  localStorage.setItem('poe2-tools:craft-rehearsal:v1', 'original')
  await addLibraryEntry(localStorage, ' 戒指 ', 'first')
  await addLibraryEntry(localStorage, '戒指', 'second')
  const entries = readLibrary(localStorage)
  expect(entries).toHaveLength(2)
  expect(new Set(entries.map((e) => e.key)).size).toBe(2)
  expect(entries.map((e) => e.name)).toEqual(['戒指', '戒指'])
  expect(new Set(entries.map((e) => e.text))).toEqual(new Set(['first', 'second']))
  const first = entries[0]
  if (!first) throw new Error('缺少收藏')
  await removeLibraryEntry(localStorage, first.key)
  expect(readLibrary(localStorage)).toHaveLength(1)
  expect(localStorage.getItem('poe2-tools:craft-rehearsal:v1')).toBe('original')
  await expect(removeLibraryEntry(localStorage, 'poe2-tools:craft-rehearsal:v1')).rejects.toThrow()
})
it('坏记录保留原文且不影响其他收藏；空名、上限和存储失败不破坏已有内容', async () => {
  localStorage.setItem(`${LIBRARY_PREFIX}broken`, '{broken')
  await addLibraryEntry(localStorage, '有效', '{}')
  expect(readLibrary(localStorage).find((e) => e.error)?.key).toBe(`${LIBRARY_PREFIX}broken`)
  expect(localStorage.getItem(`${LIBRARY_PREFIX}broken`)).toBe('{broken')
  await expect(addLibraryEntry(localStorage, ' ', '{}')).rejects.toThrow(/名称/)
  for (let i = 2; i < 20; i++) await addLibraryEntry(localStorage, String(i), '{}')
  await expect(addLibraryEntry(localStorage, '满', '{}')).rejects.toThrow(/20/)
  expect(readLibrary(localStorage)).toHaveLength(20)
  localStorage.clear()
  await addLibraryEntry(localStorage, '保留', '{}')
  const failingStorage = {
    length: localStorage.length,
    key: (index: number) => localStorage.key(index),
    getItem: (key: string) => localStorage.getItem(key),
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: (key: string) => localStorage.removeItem(key),
    clear: () => localStorage.clear(),
  }
  await expect(addLibraryEntry(failingStorage, '失败', '{}')).rejects.toThrow()
  expect(readLibrary(localStorage).map((e) => e.name)).toEqual(['保留'])
})
it('容量统计包括序列化开销并限制单份项目', async () => {
  await expect(
    addLibraryEntry(localStorage, '大', 'a'.repeat(2 * 1024 * 1024 + 1)),
  ).rejects.toThrow(/2 MB/)
  await addLibraryEntry(localStorage, '第一份', 'a'.repeat(1024 * 1024))
  await expect(addLibraryEntry(localStorage, '第二份', 'a'.repeat(1024 * 1024))).rejects.toThrow(
    /空间/,
  )
  expect(readLibrary(localStorage)).toHaveLength(1)
})

it('等待同源锁后才重新检查名额，并发争用最后名额只保存一份', async () => {
  for (let i = 0; i < 19; i++) await addLibraryEntry(localStorage, String(i), '{}')
  const grants: (() => void)[] = []
  const names: string[] = []
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (name: string, callback: () => unknown) =>
        new Promise((resolve, reject) => {
          names.push(name)
          grants.push(() => {
            try {
              resolve(callback())
            } catch (error) {
              reject(error)
            }
          })
        }),
    },
  })
  const pending = Promise.allSettled([
    addLibraryEntry(localStorage, '标签甲', '{}'),
    addLibraryEntry(localStorage, '标签乙', '{}'),
  ])
  expect(readLibrary(localStorage)).toHaveLength(19)
  expect(names).toEqual(['poe2-tools:craft-library:write', 'poe2-tools:craft-library:write'])
  grants[0]?.()
  grants[1]?.()
  const results = await pending
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(readLibrary(localStorage)).toHaveLength(20)
  const entry = readLibrary(localStorage)[0]
  if (!entry) throw new Error('缺少收藏')
  const removal = removeLibraryEntry(localStorage, entry.key)
  expect(readLibrary(localStorage)).toHaveLength(20)
  expect(names[2]).toBe('poe2-tools:craft-library:write')
  grants[2]?.()
  await removal
  expect(readLibrary(localStorage)).toHaveLength(19)
})
it('缺少存储锁时明确拒绝收藏，原记录不受影响', async () => {
  await addLibraryEntry(localStorage, '保留', '{}')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: null })
  await expect(addLibraryEntry(localStorage, '新', '{}')).rejects.toThrow(/存储锁/)
  expect(readLibrary(localStorage).map((entry) => entry.name)).toEqual(['保留'])
})
