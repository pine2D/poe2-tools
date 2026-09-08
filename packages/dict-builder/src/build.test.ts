import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runBuild } from './build'
import type { FetchLike } from './cache'
import { poe2dbListUrl, trade2Url } from './config'
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

// 按 URL 提供迷你响应的假 fetch；zhStats 可替换以模拟数据变化，omit 里的 URL 返回 404
function fakeFetch(
  zhStats: string,
  omit: readonly string[] = [],
): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = []
  const bodies = fixtureBodies(read, zhStats)
  for (const url of omit) bodies.delete(url)
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    const body = bodies.get(url)
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      text: async () => body ?? '',
      headers: { get: () => null },
    }
  }
  return { fetchImpl, calls }
}

async function options(
  fetchImpl: FetchLike,
  today: string,
  extra: Partial<Parameters<typeof runBuild>[0]> = {},
) {
  const cacheDir = await tempDir('poe2-build-cache-')
  const dictDir = extra.dictDir ?? (await tempDir('poe2-build-dict-'))
  const local = await tempDir('poe2-build-local-')
  return {
    locales: ['zh-CN', 'zh-TW'] as const,
    offline: false,
    allowRegression: false,
    poe2db: true,
    poe2dbIntervalMs: 0,
    today,
    now: `${today}T00:00:00.000Z`,
    cacheDir,
    dictDir,
    overridesDir,
    fixtureDirs: { synthetic, local },
    fetchImpl,
    log: () => {},
    ...extra,
  }
}

describe('runBuild', () => {
  it('生成两套词典与 meta', async () => {
    const { fetchImpl, calls } = fakeFetch(read('trade2-stats-zh-CN.json'))
    const opts = await options(fetchImpl, '2026-09-07')
    const result = await runBuild(opts)
    expect(result).toEqual({ ok: true, regressions: {}, skipped: [] })
    for (const locale of ['zh-CN', 'zh-TW']) {
      const dir = join(opts.dictDir, locale)
      const stats = JSON.parse(await readFile(join(dir, 'stats.json'), 'utf8'))
      expect(stats.entries).toHaveLength(6)
      expect(stats._meta.tier).toBe('primary')
      const passives = JSON.parse(await readFile(join(dir, 'passives.json'), 'utf8'))
      expect(Object.keys(passives.entries)).toEqual(['strength16', 'dexterity30_'])
      const gems = JSON.parse(await readFile(join(dir, 'gems.json'), 'utf8'))
      expect(gems._meta.tier).toBe('gray')
      expect(Object.keys(gems.entries)).toHaveLength(6)
      expect(gems.entries.SkillGemFlameblast).toEqual({ en: 'Flameblast', text: '烈焰爆破' })
      const items = JSON.parse(await readFile(join(dir, 'items.json'), 'utf8'))
      expect(items._meta.tier).toBe('gray')
      expect(items.bases['Cryptic Crown']).toBe('隐秘之冠')
      expect(items.uniques["Beira's Anguish"]).toBe('贝拉的苦楚')
      const ascendancies = JSON.parse(await readFile(join(dir, 'ascendancies.json'), 'utf8'))
      expect(Object.keys(ascendancies.entries)).toHaveLength(23)
      expect(
        JSON.parse(await readFile(join(dir, 'classes.json'), 'utf8')).entries.Witch,
      ).toBeDefined()
      expect(
        JSON.parse(await readFile(join(dir, 'inventories.json'), 'utf8')).entries.Charm1,
      ).toBeDefined()
      const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8'))
      expect(meta.locale).toBe(locale)
      expect(meta.builtAt).toBe('2026-09-07T00:00:00.000Z')
      expect(meta.counts).toEqual({
        stats: 6,
        passives: 2,
        gems: 6,
        bases: 3,
        uniques: 3,
        ascendancies: 23,
        classes: 8,
        inventories: 14,
      })
      expect(meta.audit.stats.placeholderMismatch).toEqual(['explicit.stat_charm_slot#0'])
      expect(meta.audit.stats.multiPlaceholderIds).toBeUndefined()
      expect(meta.audit.stats.literalNumberIds).toBeUndefined()
      expect(meta.audit.stats.literalSkipped).toBeUndefined()
      const review = JSON.parse(
        await readFile(join(dir, '_review', 'multi-placeholder.json'), 'utf8'),
      )
      expect(review.entries.map((e: { key: string }) => e.key)).toEqual(['explicit.stat_recover#0'])
      const literalReview = JSON.parse(
        await readFile(join(dir, '_review', 'literal-number.json'), 'utf8'),
      )
      expect(literalReview.entries.map((e: { key: string }) => e.key)).toEqual([
        'explicit.stat_literal#0',
      ])
      expect(literalReview.skipped).toEqual([])
      expect(meta.coverage.synthetic).toMatchObject({
        files: 3,
        modCandidates: 21,
        modTranslated: 2,
        namesTranslated: 2,
      })
      expect(meta.coverage.synthetic.rate).toBeCloseTo(2 / 21, 10)
      expect(meta.coverage.local).toBeNull()
      expect(meta.sources.map((s: { name: string }) => s.name)).toContain(`trade2-${locale}-stats`)
      // 真实 versions.json 的 en 与 zh-CN 目前版本不同，会带一条"跨版本 join"提示；除此之外不应有告警
      expect(meta.warnings.filter((w: string) => !w.includes('跨版本'))).toEqual([])
      expect(meta.audit.gems.joined).toBe(6)
      expect(meta.audit.items.bases.missingInEn).toBe(5)
      expect(meta.sources.map((s: { name: string }) => s.name)).toContain('poe2db-list-us-Gem')
      expect(meta.sources.map((s: { name: string }) => s.name)).toContain(
        `poe2db-list-${locale === 'zh-CN' ? 'cn' : 'tw'}-Helmets`,
      )
    }
    const zhCN = JSON.parse(await readFile(join(opts.dictDir, 'zh-CN', 'meta.json'), 'utf8'))
    expect(zhCN.gameVersion).toBe('0.5')
    expect(zhCN.leagueName).toBe('测试联盟')
    const zhTW = JSON.parse(await readFile(join(opts.dictDir, 'zh-TW', 'meta.json'), 'utf8'))
    expect(zhTW.gameVersion).toBe('0.5.5')
    expect(zhTW.leagueName).toBeNull()
    // 每个 URL 只请求一次
    expect(new Set(calls).size).toBe(calls.length)
  })

  it('离线模式复用缓存，不发请求', async () => {
    const first = fakeFetch(read('trade2-stats-zh-CN.json'))
    const opts = await options(first.fetchImpl, '2026-09-07')
    await runBuild(opts)
    const second = fakeFetch(read('trade2-stats-zh-CN.json'))
    const result = await runBuild({
      ...opts,
      fetchImpl: second.fetchImpl,
      offline: true,
      today: '2026-09-09',
    })
    expect(result.ok).toBe(true)
    expect(second.calls).toEqual([])
  })

  it('覆盖率回归时不写文件，--allow-regression 放行', async () => {
    const good = fakeFetch(read('trade2-stats-zh-CN.json'))
    const opts = await options(good.fetchImpl, '2026-09-07')
    await runBuild(opts)
    // 去掉所有分组里的 stat_life（explicit 与 fractured 译文相同，只删一组会被另一组顶上）后，合成样本命中从 2/21 降到 0/21
    const degraded = JSON.parse(read('trade2-stats-zh-CN.json'))
    for (const group of degraded.result) {
      group.entries = group.entries.filter((e: { id: string }) => !e.id.endsWith('.stat_life'))
    }
    const bad = fakeFetch(JSON.stringify(degraded))
    const blocked = await runBuild({ ...opts, fetchImpl: bad.fetchImpl, today: '2026-09-08' })
    expect(blocked.ok).toBe(false)
    expect(Object.keys(blocked.regressions)).toEqual(['zh-CN', 'zh-TW'])
    const untouched = JSON.parse(await readFile(join(opts.dictDir, 'zh-CN', 'stats.json'), 'utf8'))
    expect(untouched.entries).toHaveLength(6)

    const allowed = await runBuild({
      ...opts,
      fetchImpl: bad.fetchImpl,
      today: '2026-09-08',
      allowRegression: true,
    })
    expect(allowed.ok).toBe(true)
    const rewritten = JSON.parse(await readFile(join(opts.dictDir, 'zh-CN', 'stats.json'), 'utf8'))
    expect(rewritten.entries).toHaveLength(5)
  })

  it('关闭 poe2db 时不产出三张灰区表、不请求 poe2db，并删除上一次留下的 passives / gems / items', async () => {
    const first = fakeFetch(read('trade2-stats-zh-CN.json'))
    const opts = await options(first.fetchImpl, '2026-09-07')
    await runBuild(opts)
    await expect(
      readFile(join(opts.dictDir, 'zh-CN', 'passives.json'), 'utf8'),
    ).resolves.toBeTruthy()

    const second = fakeFetch(read('trade2-stats-zh-CN.json'))
    await runBuild({ ...opts, fetchImpl: second.fetchImpl, today: '2026-09-08', poe2db: false })
    expect(second.calls.some((u) => u.includes('poe2db'))).toBe(false)
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'passives.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'gems.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'items.json'), 'utf8')).rejects.toThrow()
    // trade2 en items 只服务灰区表，关掉 poe2db 就不抓
    expect(second.calls.some((u) => u === trade2Url('en', 'items'))).toBe(false)
    const meta = JSON.parse(await readFile(join(opts.dictDir, 'zh-CN', 'meta.json'), 'utf8'))
    expect(meta.audit.passives).toBeNull()
    expect(meta.counts.passives).toBe(0)
    expect(meta.counts.gems).toBe(0)
    expect(meta.audit.gems).toBeNull()
    expect(meta.audit.items).toBeNull()
  })

  it('poe2db 树 JSON 抓取失败时只降级并告警，本次不更新该 locale 的词典（primary 表也不写）', async () => {
    const { fetchImpl } = fakeFetch(read('trade2-stats-zh-CN.json'), [
      'https://poe2db.tw/data/passive-skill-tree/9.9/data_cn.json?5',
      'https://poe2db.tw/data/passive-skill-tree/9.9/data_tw.json?5',
    ])
    const logs: string[] = []
    const opts = await options(fetchImpl, '2026-09-07', { log: (m) => logs.push(m) })
    const result = await runBuild(opts)
    expect(result.ok).toBe(true)
    expect(logs.some((m) => m.includes('不更新'))).toBe(true)
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'stats.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'passives.json'), 'utf8')).rejects.toThrow()
  })

  it('某 locale 的 poe2db 列表页失败时只跳过该 locale，另一 locale 照常写入并带 warnings', async () => {
    const { fetchImpl } = fakeFetch(read('trade2-stats-zh-CN.json'), [poe2dbListUrl('cn', 'Gem')])
    const logs: string[] = []
    const opts = await options(fetchImpl, '2026-09-07', { log: (m) => logs.push(m) })
    const result = await runBuild(opts)
    expect(result.ok).toBe(true)
    expect(result.skipped).toEqual(['zh-CN'])
    expect(logs.some((m) => m.includes('zh-CN') && m.includes('不更新'))).toBe(true)
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'stats.json'), 'utf8')).rejects.toThrow()
    const tw = JSON.parse(await readFile(join(opts.dictDir, 'zh-TW', 'meta.json'), 'utf8'))
    expect(tw.counts.gems).toBe(6)
    // 被跳过的 locale 写不了自己的 meta.json，失败记录落在之后仍能写盘的 locale 里
    expect(tw.warnings).toContain('zh-CN 灰区链路失败，本次未更新')
  })

  it('us 列表页解析不到条目（软 404）时所有 locale 都不写', async () => {
    const { fetchImpl, calls } = fakeFetch(read('trade2-stats-zh-CN.json'))
    const opts = await options(fetchImpl, '2026-09-07')
    const soft: FetchLike = async (url, init) =>
      url === poe2dbListUrl('us', 'Helmets')
        ? {
            ok: true,
            status: 200,
            text: async () => read('poe2db-list-empty.html'),
            headers: { get: () => null },
          }
        : fetchImpl(url, init)
    const result = await runBuild({ ...opts, fetchImpl: soft })
    expect(result.ok).toBe(true)
    expect(result.skipped).toEqual(['zh-CN', 'zh-TW'])
    await expect(readFile(join(opts.dictDir, 'zh-CN', 'meta.json'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(opts.dictDir, 'zh-TW', 'meta.json'), 'utf8')).rejects.toThrow()
    expect(calls.some((u) => u === poe2dbListUrl('cn', 'Gem'))).toBe(false)
  })
})
