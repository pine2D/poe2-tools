// 扩展专用词缀快照。网络仍只经 cache.ts；不更新旧 .build、天赋、宝石和制作目录。
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStatCatalog, type CanonicalDecision, type StatSnapshot } from './adapters/statCatalog'
import { parseTrade2Stats } from './adapters/trade2Stats'
import { fetchCached } from './cache'
import { CACHE_DIR, LOCALES, REPO_ROOT, trade2Url, USER_AGENT } from './config'

export async function buildStatCatalogs(
  options: { root?: string; cacheDir?: string; offline?: boolean; today?: string } = {},
) {
  const root = options.root ?? REPO_ROOT
  const cacheDir = options.cacheDir ?? CACHE_DIR
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const read = async (path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
  const order = await read('data/dict/_overrides/stat-order.json')
  const decisions = (await read('data/l10n/stat-decisions.json')) as {
    entries: Record<string, CanonicalDecision[]>
  }
  const snapshots = new Map<string, StatSnapshot>()
  async function fetchRealm(locale: 'en' | 'zh-CN' | 'zh-TW') {
    const url = trade2Url(locale, 'stats')
    const result = await fetchCached(`trade2-${locale}-stats`, url, {
      cacheDir,
      today,
      offline: options.offline ?? false,
      ua: USER_AGENT,
      minIntervalMs: 1500,
    })
    snapshots.set(locale, {
      locale,
      url,
      sha256: result.meta.sha256,
      fetchedAt: result.meta.fetchedAt,
      // 静态端点无游戏版本字段；不能把抓取日期或 CoE 的内容版本当作三服版本。
      gameVersion: 'unknown',
    })
    return parseTrade2Stats(JSON.parse(result.body))
  }
  const en = await fetchRealm('en')
  const output = join(root, 'data/l10n/stats')
  await mkdir(output, { recursive: true })
  for (const locale of LOCALES) {
    const target = await fetchRealm(locale)
    const sources = [snapshots.get('en'), snapshots.get(locale)].filter(
      (s): s is StatSnapshot => s !== undefined,
    )
    const catalog = buildStatCatalog({
      en,
      target,
      locale,
      sources,
      orderOverrides: order.entries[locale],
      decisions: decisions.entries[locale] ?? [],
    })
    await writeFile(join(output, `${locale}.json`), `${JSON.stringify(catalog, null, 2)}\n`)
    console.log(
      `${locale}: ${catalog.entries.length} 原始词缀；${catalog.audit.unresolved.length} 未裁决冲突`,
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildStatCatalogs({ offline: process.argv.includes('--offline') }).catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
