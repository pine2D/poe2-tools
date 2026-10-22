import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, prefsFrom } from '../src/guide/prefs'
import { keyForConfig, originOf } from '../src/guide/store/keys'
import { createMemoryStore } from '../src/guide/store/memory'
import { entrySize } from '../src/guide/store/types'

const record = {
  provider: 'custom' as const,
  baseUrl: 'https://a.example/v1',
  origin: 'https://a.example',
  model: 'm',
  apiKey: 'k1',
}

describe('Key 与地址绑定', () => {
  it('只接受 https，或本机 http', () => {
    expect(originOf('https://a.example/v1')).toBe('https://a.example')
    expect(originOf('http://localhost:11434/v1')).toBe('http://localhost:11434')
    expect(originOf('http://127.0.0.1:1234')).toBe('http://127.0.0.1:1234')
    expect(originOf('http://a.example')).toBeNull()
    expect(originOf('not a url')).toBeNull()
  })
  it('Base URL 换了域名就拿不到旧 Key', () => {
    expect(keyForConfig(record, 'https://a.example/v2')).toBe('k1')
    expect(keyForConfig(record, 'https://b.example/v1')).toBeNull()
    expect(keyForConfig(null, 'https://a.example/v1')).toBeNull()
  })
})

describe('createMemoryStore', () => {
  it('读写 Key 与缓存，清除全部', async () => {
    const s = createMemoryStore({ capacityBytes: 1_000_000, now: () => 1 })
    await s.putKey(record)
    expect(await s.getKey()).toEqual(record)
    await s.putCached({ hash: 'h1', text: '译文', issues: [] })
    expect(await s.getCached('h1')).toEqual({ hash: 'h1', text: '译文', issues: [] })
    await s.clearAll()
    expect(await s.getKey()).toBeNull()
    expect(await s.getCached('h1')).toBeNull()
  })
  it('超过容量时淘汰最久未用的条目，降到 90% 以下', async () => {
    let t = 0
    const one = { hash: 'x', text: 'a'.repeat(100), issues: [] }
    const size = entrySize(one)
    const s = createMemoryStore({ capacityBytes: size * 3, now: () => ++t })
    await s.putCached({ ...one, hash: 'a' })
    await s.putCached({ ...one, hash: 'b' })
    await s.putCached({ ...one, hash: 'c' })
    await s.getCached('a') // a 变成最近使用
    await s.putCached({ ...one, hash: 'd' })
    expect(await s.getCached('b')).toBeNull()
    expect(await s.getCached('c')).toBeNull()
    expect(await s.getCached('a')).not.toBeNull()
    expect(await s.getCached('d')).not.toBeNull()
    expect(await s.usage()).toBeLessThanOrEqual(size * 3 * 0.9)
  })
  it('同一 hash 覆盖时不重复计用量', async () => {
    const s = createMemoryStore({ capacityBytes: 1_000_000, now: () => 1 })
    await s.putCached({ hash: 'h', text: 'a', issues: [] })
    const u = await s.usage()
    await s.putCached({ hash: 'h', text: 'a', issues: [] })
    expect(await s.usage()).toBe(u)
  })
})

describe('prefsFrom', () => {
  it('缺省与非法值回到默认', () => {
    expect(prefsFrom(undefined)).toEqual(DEFAULT_PREFS)
    expect(
      prefsFrom({ charLimit: -1, provider: 'evil', confirmedOrigins: ['https://a.example', 3] }),
    ).toEqual({
      ...DEFAULT_PREFS,
      confirmedOrigins: ['https://a.example'],
    })
    expect(prefsFrom({ charLimit: 5000, introSeen: true, noticeVersion: '0.5.0' })).toMatchObject({
      charLimit: 5000,
      introSeen: true,
      noticeVersion: '0.5.0',
    })
  })
})
