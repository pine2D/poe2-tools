import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runBuild } from './build'
import type { FetchLike } from './cache'
import { runCheck } from './check'
import { fixtureBodies } from './testing/fakeBodies'

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url))
const overridesDir = fileURLToPath(new URL('../../../data/dict/_overrides/', import.meta.url))
const synthetic = fileURLToPath(new URL('../../../data/fixtures/synthetic/', import.meta.url))
const read = (file: string): string => readFileSync(`${fixtures}${file}`, 'utf8')

const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

const bodies = fixtureBodies(read, read('trade2-stats-zh-CN.json'))
const fetchImpl: FetchLike = async (url) => {
  const body = bodies.get(url)
  return {
    ok: body !== undefined,
    status: body === undefined ? 404 : 200,
    text: async () => body ?? '',
    headers: { get: () => null },
  }
}

async function buildOnce(): Promise<{ dictDir: string; local: string }> {
  const dictDir = await tempDir('poe2-check-dict-')
  const local = await tempDir('poe2-check-local-')
  const result = await runBuild({
    locales: ['zh-CN'],
    offline: false,
    allowRegression: false,
    poe2db: true,
    poe2dbIntervalMs: 0,
    today: '2026-09-07',
    now: '2026-09-07T00:00:00.000Z',
    cacheDir: await tempDir('poe2-check-cache-'),
    dictDir,
    overridesDir,
    fixtureDirs: { synthetic, local },
    fetchImpl,
    log: () => {},
  })
  expect(result.ok).toBe(true)
  return { dictDir, local }
}

describe('runCheck', () => {
  it('刚构建的词典通过检查', async () => {
    const { dictDir, local } = await buildOnce()
    const result = await runCheck({
      locales: ['zh-CN'],
      dictDir,
      fixtureDirs: { synthetic, local },
      log: () => {},
    })
    expect(result.ok).toBe(true)
    expect(result.details['zh-CN']).toMatchObject({ parseError: null, regressions: [] })
    expect(result.details['zh-CN']?.coverage.synthetic).toEqual({
      files: 2,
      modCandidates: 8,
      modTranslated: 1,
      rate: 0.125,
      namesTranslated: 0,
    })
  })

  it('词典被削弱后覆盖率低于基线 → 失败', async () => {
    const { dictDir, local } = await buildOnce()
    const path = join(dictDir, 'zh-CN', 'stats.json')
    const stats = JSON.parse(await readFile(path, 'utf8'))
    stats.entries = stats.entries.filter((e: { id: string }) => e.id !== 'explicit.stat_life')
    await writeFile(path, JSON.stringify(stats), 'utf8')
    const result = await runCheck({
      locales: ['zh-CN'],
      dictDir,
      fixtureDirs: { synthetic, local },
      log: () => {},
    })
    expect(result.ok).toBe(false)
    expect(result.details['zh-CN']?.regressions).toHaveLength(1)
  })

  it('词典文件结构不对 → 失败并给出解析错误', async () => {
    const { dictDir, local } = await buildOnce()
    await writeFile(join(dictDir, 'zh-CN', 'stats.json'), '{"entries":[]}', 'utf8')
    const result = await runCheck({
      locales: ['zh-CN'],
      dictDir,
      fixtureDirs: { synthetic, local },
      log: () => {},
    })
    expect(result.ok).toBe(false)
    expect(result.details['zh-CN']?.parseError).toContain('stats')
  })

  it('词典文件不是合法 JSON → 失败并给出解析错误，不抛裸异常', async () => {
    const { dictDir, local } = await buildOnce()
    await writeFile(join(dictDir, 'zh-CN', 'stats.json'), '{not json', 'utf8')
    const result = await runCheck({
      locales: ['zh-CN'],
      dictDir,
      fixtureDirs: { synthetic, local },
      log: () => {},
    })
    expect(result.ok).toBe(false)
    expect(result.details['zh-CN']?.parseError).toContain('stats.json')
  })

  it('没有词典文件的 locale → 失败', async () => {
    const dictDir = await tempDir('poe2-check-empty-')
    const local = await tempDir('poe2-check-local-')
    const result = await runCheck({
      locales: ['zh-TW'],
      dictDir,
      fixtureDirs: { synthetic, local },
      log: () => {},
    })
    expect(result.ok).toBe(false)
    expect(result.details['zh-TW']?.parseError).toContain('zh-TW')
  })
})
