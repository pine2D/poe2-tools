import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type FetchLike, fetchCached } from './cache'

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'poe2-cache-'))
  dirs.push(dir)
  return dir
}

// 记录调用次数的假 fetch
function fakeFetch(body: string, status = 200): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      headers: {
        get: (name: string) => (name === 'last-modified' ? 'Mon, 07 Sep 2026 00:00:00 GMT' : null),
      },
    }
  }
  return { fetchImpl, calls }
}

describe('fetchCached', () => {
  it('首次请求写缓存与侧车，同日第二次不再请求', async () => {
    const cacheDir = await tempDir()
    const { fetchImpl, calls } = fakeFetch('{"result":[]}')
    const options = { cacheDir, today: '2026-09-07', offline: false, ua: 'test-ua', fetchImpl }
    const first = await fetchCached('trade2-en-stats', 'https://example.invalid/stats', options)
    expect(first.fromCache).toBe(false)
    expect(first.body).toBe('{"result":[]}')
    expect(first.meta).toMatchObject({
      url: 'https://example.invalid/stats',
      httpStatus: 200,
      ua: 'test-ua',
    })
    expect(first.meta.lastModified).toBe('Mon, 07 Sep 2026 00:00:00 GMT')
    expect(await readFile(join(cacheDir, 'trade2-en-stats-2026-09-07.json'), 'utf8')).toBe(
      '{"result":[]}',
    )
    const sidecar = JSON.parse(
      await readFile(join(cacheDir, 'trade2-en-stats-2026-09-07.meta.json'), 'utf8'),
    )
    expect(sidecar.sha256).toBe(first.meta.sha256)

    const second = await fetchCached('trade2-en-stats', 'https://example.invalid/stats', options)
    expect(second.fromCache).toBe(true)
    expect(second.body).toBe('{"result":[]}')
    expect(calls).toHaveLength(1)
  })

  it('离线模式复用最近一次缓存，且不发请求', async () => {
    const cacheDir = await tempDir()
    await writeFile(join(cacheDir, 'x-2026-09-01.json'), 'old', 'utf8')
    await writeFile(join(cacheDir, 'x-2026-09-05.json'), 'new', 'utf8')
    await writeFile(
      join(cacheDir, 'x-2026-09-05.meta.json'),
      '{"url":"u","fetchedAt":"t","httpStatus":200,"sha256":"s","lastModified":null,"ua":"u"}',
      'utf8',
    )
    const { fetchImpl, calls } = fakeFetch('never')
    const result = await fetchCached('x', 'https://example.invalid/x', {
      cacheDir,
      today: '2026-09-07',
      offline: true,
      ua: 'test-ua',
      fetchImpl,
    })
    expect(result.body).toBe('new')
    expect(result.fromCache).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('离线且无缓存时抛错', async () => {
    const cacheDir = await tempDir()
    const { fetchImpl } = fakeFetch('never')
    await expect(
      fetchCached('none', 'https://example.invalid/none', {
        cacheDir,
        today: '2026-09-07',
        offline: true,
        ua: 'u',
        fetchImpl,
      }),
    ).rejects.toThrow('离线')
  })

  it('非 2xx 抛错且不写缓存', async () => {
    const cacheDir = await tempDir()
    const { fetchImpl } = fakeFetch('nope', 503)
    await expect(
      fetchCached('bad', 'https://example.invalid/bad', {
        cacheDir,
        today: '2026-09-07',
        offline: false,
        ua: 'u',
        fetchImpl,
      }),
    ).rejects.toThrow('503')
    expect(await readdir(cacheDir)).toEqual([])
  })

  it('ext 参数决定缓存文件扩展名', async () => {
    const cacheDir = await tempDir()
    const { fetchImpl } = fakeFetch('<html></html>')
    const result = await fetchCached('page', 'https://example.invalid/p', {
      cacheDir,
      today: '2026-09-07',
      offline: false,
      ua: 'u',
      fetchImpl,
      ext: 'html',
    })
    expect(result.path).toBe(join(cacheDir, 'page-2026-09-07.html'))
  })
})
