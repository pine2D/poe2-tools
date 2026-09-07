// dict:build 编排：抓取（经缓存）→ 各适配器 → 审计 → 覆盖率与回归门禁 → 写 data/dict/<locale>/。
// 灰区链路（poe2db / repoe 天赋表）任一环节失败只降级为不产出 passives.json；trade2 与手工表失败才中止。
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { auditDictBundle, type DictBundle, type Locale } from '@poe2-tools/build-core'
import {
  parseOverrideTable,
  parseStatOrder,
  parseVersions,
  toNamesTable,
} from './adapters/manualTables'
import { buildPassivesDict, parsePoe2dbTree, parseRepoePassives } from './adapters/passives'
import { bundleUrl, findTreeBundleFile, findTreeVersion } from './adapters/poe2dbTree'
import { buildStatsDict, parseTrade2Stats } from './adapters/trade2Stats'
import { type Fetched, type FetchLike, type FetchOptions, fetchCached } from './cache'
import {
  POE2DB_TREE_FALLBACK_VERSION,
  POE2DB_TREE_PAGE_URL,
  poe2dbTreeUrl,
  REPOE_PASSIVES_URL,
  TRADE2_HOSTS,
  trade2Url,
  USER_AGENT,
} from './config'
import {
  type CoverageSets,
  type FixtureSet,
  findRegressions,
  measureCoverageSets,
} from './coverage'
import {
  type DictMetaFile,
  readBaseline,
  type SourceRecord,
  sourceRecord,
  summarizeProblems,
} from './meta'
import { readJson, writeJson } from './util/json'

export interface BuildOptions {
  locales: readonly Locale[]
  offline: boolean
  allowRegression: boolean
  poe2db: boolean
  today: string
  now: string
  cacheDir: string
  dictDir: string
  overridesDir: string
  fixtureDirs: Record<FixtureSet, string>
  fetchImpl?: FetchLike
  log(message: string): void
}

export interface BuildResult {
  ok: boolean
  regressions: Record<string, string[]>
}

interface Poe2dbContext {
  version: string
  repoe: ReturnType<typeof parseRepoePassives>
  repoeFetched: Fetched
}

interface PassivesOutcome {
  result: ReturnType<typeof buildPassivesDict>
  sources: SourceRecord[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function firstLeagueText(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const result = (raw as { result?: unknown }).result
  if (!Array.isArray(result)) return null
  const first: unknown = result[0]
  if (typeof first !== 'object' || first === null) return null
  const text = (first as { text?: unknown }).text
  return typeof text === 'string' ? text : null
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`
}

// poe2db 树模板版本：页面 → bundle 两步解析，失败回退写死值并告警；repoe 抓取失败则整个天赋链路降级
async function preparePoe2db(
  options: BuildOptions,
  fetchOptions: FetchOptions,
): Promise<Poe2dbContext | null> {
  let version: string | null = null
  try {
    const page = await fetchCached('poe2db-tree-page', POE2DB_TREE_PAGE_URL, {
      ...fetchOptions,
      ext: 'html',
    })
    const file = findTreeBundleFile(page.body)
    if (file !== null) {
      const bundle = await fetchCached('poe2db-tree-bundle', bundleUrl(file), {
        ...fetchOptions,
        ext: 'js',
      })
      version = findTreeVersion(bundle.body)
    }
  } catch (error) {
    options.log(`警告：解析 poe2db 树模板版本失败（${errorMessage(error)}）`)
  }
  if (version === null) {
    version = POE2DB_TREE_FALLBACK_VERSION
    options.log(`警告：未能解析 poe2db 树模板版本，回退 ${version}`)
  }
  try {
    const repoeFetched = await fetchCached(
      'repoe-passives-default',
      REPOE_PASSIVES_URL,
      fetchOptions,
    )
    return { version, repoe: parseRepoePassives(JSON.parse(repoeFetched.body)), repoeFetched }
  } catch (error) {
    options.log(`警告：天赋链路降级，不产出 passives（${errorMessage(error)}）`)
    return null
  }
}

async function buildPassives(
  locale: Locale,
  poe2db: Poe2dbContext,
  gameVersion: string,
  fetchOptions: FetchOptions,
  options: BuildOptions,
): Promise<PassivesOutcome | null> {
  try {
    const treeFetched = await fetchCached(
      `poe2db-tree-${locale}`,
      poe2dbTreeUrl(poe2db.version, locale),
      fetchOptions,
    )
    const result = buildPassivesDict(poe2db.repoe, parsePoe2dbTree(JSON.parse(treeFetched.body)), {
      source: 'repoe-fork/poe2 + poe2db.tw',
      gameVersion,
      fetchedAt: treeFetched.meta.fetchedAt,
    })
    return {
      result,
      sources: [
        sourceRecord('repoe-passives-default', poe2db.repoeFetched),
        sourceRecord(`poe2db-tree-${locale}`, treeFetched),
      ],
    }
  } catch (error) {
    options.log(`警告：${locale} 天赋链路降级，不产出 passives（${errorMessage(error)}）`)
    return null
  }
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const fetchOptions: FetchOptions = {
    cacheDir: options.cacheDir,
    today: options.today,
    offline: options.offline,
    ua: USER_AGENT,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  }
  const versions = parseVersions(await readJson(join(options.overridesDir, 'versions.json')))
  const orderOverrides = parseStatOrder(
    await readJson(join(options.overridesDir, 'stat-order.json')),
  )
  const tables = {
    ascendancies: parseOverrideTable(
      'ascendancies',
      await readJson(join(options.overridesDir, 'ascendancies.json')),
    ),
    classes: parseOverrideTable(
      'classes',
      await readJson(join(options.overridesDir, 'classes.json')),
    ),
    inventories: parseOverrideTable(
      'inventories',
      await readJson(join(options.overridesDir, 'inventories.json')),
    ),
  }
  const enFetched = await fetchCached('trade2-en-stats', trade2Url('en', 'stats'), fetchOptions)
  const enStats = parseTrade2Stats(JSON.parse(enFetched.body))
  const poe2db = options.poe2db ? await preparePoe2db(options, fetchOptions) : null

  const regressions: Record<string, string[]> = {}
  for (const locale of options.locales) {
    const gameVersion = versions[locale]
    if (gameVersion === undefined) throw new Error(`versions.json 缺少 ${locale}`)
    const sources: SourceRecord[] = [sourceRecord('trade2-en-stats', enFetched)]

    const targetFetched = await fetchCached(
      `trade2-${locale}-stats`,
      trade2Url(locale, 'stats'),
      fetchOptions,
    )
    sources.push(sourceRecord(`trade2-${locale}-stats`, targetFetched))
    const stats = buildStatsDict({
      en: enStats,
      target: parseTrade2Stats(JSON.parse(targetFetched.body)),
      locale,
      orderOverrides: orderOverrides[locale],
      meta: {
        source: `trade2 ${TRADE2_HOSTS[locale]}`,
        gameVersion,
        fetchedAt: targetFetched.meta.fetchedAt,
      },
    })

    let leagueName: string | null = null
    try {
      const leagues = await fetchCached(
        `trade2-${locale}-leagues`,
        trade2Url(locale, 'leagues'),
        fetchOptions,
      )
      leagueName = firstLeagueText(JSON.parse(leagues.body))
    } catch (error) {
      options.log(`提示：${locale} 的 leagues 端点不可用（${errorMessage(error)}）`)
    }

    const bundle: DictBundle = {
      locale,
      stats: stats.dict,
      ascendancies: toNamesTable(
        tables.ascendancies,
        locale,
        '_overrides/ascendancies.json',
        gameVersion,
      ),
      classes: toNamesTable(tables.classes, locale, '_overrides/classes.json', gameVersion),
      inventories: toNamesTable(
        tables.inventories,
        locale,
        '_overrides/inventories.json',
        gameVersion,
      ),
    }
    const passives =
      poe2db === null
        ? null
        : await buildPassives(locale, poe2db, gameVersion, fetchOptions, options)
    if (passives !== null) {
      bundle.passives = passives.result.dict
      sources.push(...passives.sources)
    }

    const problems = auditDictBundle(bundle)
    const coverage: CoverageSets = await measureCoverageSets(bundle, options.fixtureDirs)
    const localeDir = join(options.dictDir, locale)
    const found = findRegressions(coverage, await readBaseline(join(localeDir, 'meta.json')))
    if (found.length > 0) {
      regressions[locale] = found
      options.log(
        `${locale} 覆盖率回归：${found.join('；')}${options.allowRegression ? '（已放行）' : '（未写入）'}`,
      )
      if (!options.allowRegression) continue
    }

    await writeJson(join(localeDir, 'stats.json'), stats.dict)
    if (passives === null) await rm(join(localeDir, 'passives.json'), { force: true })
    else await writeJson(join(localeDir, 'passives.json'), passives.result.dict)
    await writeJson(join(localeDir, 'ascendancies.json'), bundle.ascendancies)
    await writeJson(join(localeDir, 'classes.json'), bundle.classes)
    await writeJson(join(localeDir, 'inventories.json'), bundle.inventories)
    const { multiPlaceholderIds, literalNumberIds, ...statsAudit } = stats.audit
    await writeJson(join(localeDir, '_review', 'multi-placeholder.json'), {
      locale,
      generatedAt: options.now,
      note: '多占位符词缀清单：逐条核对中英语序，语序不同的把 key 与顺序写进 _overrides/stat-order.json',
      entries: multiPlaceholderIds,
    })
    await writeJson(join(localeDir, '_review', 'literal-number.json'), {
      locale,
      generatedAt: options.now,
      note: '含字面数字的词缀：当前消费端无法命中，归一化变体方案见 2b 计划',
      entries: literalNumberIds,
    })
    const meta: DictMetaFile = {
      locale,
      gameVersion,
      leagueName,
      builtAt: options.now,
      sources,
      counts: {
        stats: stats.dict.entries.length,
        passives: passives?.result.dict._meta.count ?? 0,
        ascendancies: bundle.ascendancies?._meta.count ?? 0,
        classes: bundle.classes?._meta.count ?? 0,
        inventories: bundle.inventories?._meta.count ?? 0,
      },
      audit: {
        stats: statsAudit,
        passives: passives?.result.audit ?? null,
        problems: summarizeProblems(problems),
      },
      coverage,
    }
    await writeJson(join(localeDir, 'meta.json'), meta)
    options.log(
      `${locale}：词缀 ${meta.counts.stats} 条，天赋 ${meta.counts.passives} 条，审计问题 ${problems.length}，覆盖率 synthetic ${percent(coverage.synthetic?.rate ?? null)} / local ${percent(coverage.local?.rate ?? null)}`,
    )
  }
  return { ok: Object.keys(regressions).length === 0 || options.allowRegression, regressions }
}
