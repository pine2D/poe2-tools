// dict:build 编排：抓取（经缓存）→ 各适配器 → 审计 → 覆盖率与回归门禁 → 写 data/dict/<locale>/。
// 灰区链路（poe2db 天赋树 / 列表页、repoe 天赋表与宝石表）任一环节失败：该 locale 本次整体不写入（primary 表也不写），
// 不删除已入库产物；只有显式关闭 poe2db 才删除旧的三张灰区表。trade2 与手工表失败才中止整个构建。
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { auditDictBundle, type DictBundle, type Locale } from '@poe2-tools/build-core'
import { buildGemsDict, parseRepoeSkillGems } from './adapters/gems'
import { buildItemsDict, parseTrade2Items, type Trade2ItemNames } from './adapters/items'
import {
  parseOverrideTable,
  parseStatOrder,
  parseStatWinners,
  parseVersions,
  toNamesTable,
} from './adapters/manualTables'
import { buildPassivesDict, parsePoe2dbTree, parseRepoePassives } from './adapters/passives'
import { type ListKind, type ListParse, mergeLists, parseListPage } from './adapters/poe2dbList'
import { bundleUrl, findTreeBundleFile, findTreeVersion } from './adapters/poe2dbTree'
import { buildStatsDict, parseTrade2Stats } from './adapters/trade2Stats'
import { type Fetched, type FetchLike, type FetchOptions, fetchCached } from './cache'
import {
  POE2DB_BASE_LISTS,
  POE2DB_EN_LANG,
  POE2DB_GEM_LIST,
  POE2DB_LANG,
  POE2DB_TREE_FALLBACK_VERSION,
  POE2DB_TREE_PAGE_URL,
  POE2DB_UNIQUE_LIST,
  type Poe2dbLang,
  poe2dbListUrl,
  poe2dbTreeUrl,
  REPOE_PASSIVES_URL,
  REPOE_SKILL_GEMS_URL,
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
import { errorMessage } from './util/error'
import { readJson, writeJson } from './util/json'

export interface BuildOptions {
  locales: readonly Locale[]
  offline: boolean
  allowRegression: boolean
  poe2db: boolean
  // poe2db 页面请求的最小间隔（毫秒）；测试注入 0
  poe2dbIntervalMs: number
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
  // 灰区链路失败而整体未写入的 locale
  skipped: Locale[]
}

type Warn = (message: string) => void

// 一种语言的三张列表页（与 adapters/items 的 NameLists 不是同一类型）
interface LocaleLists {
  gems: ListParse
  uniques: ListParse
  bases: ListParse
}

// 灰区链路的公共输入：树模板版本、repoe 天赋表与宝石表、trade2 en 物品名、poe2db 英文列表页（us）
interface GrayContext {
  version: string
  repoe: ReturnType<typeof parseRepoePassives>
  gems: ReturnType<typeof parseRepoeSkillGems>
  itemNames: Trade2ItemNames
  enLists: LocaleLists
  sources: SourceRecord[]
}

interface GrayOutcome {
  passives: ReturnType<typeof buildPassivesDict>
  gems: ReturnType<typeof buildGemsDict>
  items: ReturnType<typeof buildItemsDict>
  sources: SourceRecord[]
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

// poe2db 树模板版本：页面 → bundle 两步解析，失败回退写死值并告警
async function resolveTreeVersion(
  fetchOptions: FetchOptions,
  intervalMs: number,
  warn: Warn,
): Promise<{ version: string; sources: SourceRecord[] }> {
  const sources: SourceRecord[] = []
  let version: string | null = null
  try {
    const page = await fetchCached('poe2db-tree-page', POE2DB_TREE_PAGE_URL, {
      ...fetchOptions,
      ext: 'html',
      minIntervalMs: intervalMs,
    })
    sources.push(sourceRecord('poe2db-tree-page', page))
    const file = findTreeBundleFile(page.body)
    if (file !== null) {
      const bundle = await fetchCached('poe2db-tree-bundle', bundleUrl(file), {
        ...fetchOptions,
        ext: 'js',
        minIntervalMs: intervalMs,
      })
      sources.push(sourceRecord('poe2db-tree-bundle', bundle))
      version = findTreeVersion(bundle.body)
    }
  } catch (error) {
    warn(`解析 poe2db 树模板版本失败（${errorMessage(error)}）`)
  }
  if (version === null) {
    version = POE2DB_TREE_FALLBACK_VERSION
    warn(`未能解析 poe2db 树模板版本，回退 ${version}`)
  }
  return { version, sources }
}

async function fetchList(
  lang: Poe2dbLang,
  slug: string,
  kind: ListKind,
  fetchOptions: FetchOptions,
  intervalMs: number,
): Promise<{ parse: ListParse; fetched: Fetched }> {
  const fetched = await fetchCached(`poe2db-list-${lang}-${slug}`, poe2dbListUrl(lang, slug), {
    ...fetchOptions,
    ext: 'html',
    minIntervalMs: intervalMs,
  })
  const parse = parseListPage(fetched.body, kind)
  // 站点对不存在的页面也返回 200（软 404），只能以"没有任何条目"判定；缓存文件需手动删除后重抓
  if (parse.names.size === 0)
    throw new Error(`poe2db 列表页没有条目（可能是软 404）：${fetched.meta.url}`)
  return { parse, fetched }
}

// 一种语言的全部列表页：Gem + Unique_item + 31 个分类页（分类页合并为一张表）
async function fetchLists(
  lang: Poe2dbLang,
  fetchOptions: FetchOptions,
  intervalMs: number,
): Promise<{ lists: LocaleLists; sources: SourceRecord[] }> {
  const sources: SourceRecord[] = []
  const gems = await fetchList(lang, POE2DB_GEM_LIST, 'gem', fetchOptions, intervalMs)
  sources.push(sourceRecord(`poe2db-list-${lang}-${POE2DB_GEM_LIST}`, gems.fetched))
  const uniques = await fetchList(lang, POE2DB_UNIQUE_LIST, 'unique', fetchOptions, intervalMs)
  sources.push(sourceRecord(`poe2db-list-${lang}-${POE2DB_UNIQUE_LIST}`, uniques.fetched))
  const pages: ListParse[] = []
  for (const slug of POE2DB_BASE_LISTS) {
    const page = await fetchList(lang, slug, 'base', fetchOptions, intervalMs)
    pages.push(page.parse)
    sources.push(sourceRecord(`poe2db-list-${lang}-${slug}`, page.fetched))
  }
  return { lists: { gems: gems.parse, uniques: uniques.parse, bases: mergeLists(pages) }, sources }
}

function listConflicts(lists: LocaleLists): string[] {
  return [...lists.gems.conflicts, ...lists.uniques.conflicts, ...lists.bases.conflicts]
}

// 灰区公共准备：任一环节失败 → 返回 null（所有 locale 本次都不写）
async function prepareGray(
  options: BuildOptions,
  fetchOptions: FetchOptions,
  warn: Warn,
): Promise<GrayContext | null> {
  const tree = await resolveTreeVersion(fetchOptions, options.poe2dbIntervalMs, warn)
  try {
    const repoeFetched = await fetchCached(
      'repoe-passives-default',
      REPOE_PASSIVES_URL,
      fetchOptions,
    )
    const gemsFetched = await fetchCached('repoe-skill-gems', REPOE_SKILL_GEMS_URL, fetchOptions)
    // trade2 en items 是 items 词典的英文规范名来源（primary），但只服务灰区表：随 poe2db 开关一起抓
    const itemsFetched = await fetchCached(
      'trade2-en-items',
      trade2Url('en', 'items'),
      fetchOptions,
    )
    const en = await fetchLists(POE2DB_EN_LANG, fetchOptions, options.poe2dbIntervalMs)
    const conflicts = listConflicts(en.lists)
    if (conflicts.length > 0)
      warn(`poe2db us 列表页同一 slug 出现不同文本：${conflicts.join('、')}`)
    return {
      version: tree.version,
      repoe: parseRepoePassives(JSON.parse(repoeFetched.body)),
      gems: parseRepoeSkillGems(JSON.parse(gemsFetched.body)),
      itemNames: parseTrade2Items(JSON.parse(itemsFetched.body)),
      enLists: en.lists,
      sources: [
        ...tree.sources,
        sourceRecord('repoe-passives-default', repoeFetched),
        sourceRecord('repoe-skill-gems', gemsFetched),
        sourceRecord('trade2-en-items', itemsFetched),
        ...en.sources,
      ],
    }
  } catch (error) {
    warn(`灰区链路准备失败（${errorMessage(error)}）`)
    return null
  }
}

// 某 locale 的灰区三表：树 JSON → passives；cn/tw 列表页 → gems / items。任一失败 → null
async function buildGray(
  locale: Locale,
  gray: GrayContext,
  gameVersion: string,
  fetchOptions: FetchOptions,
  options: BuildOptions,
  warn: Warn,
): Promise<GrayOutcome | null> {
  try {
    const treeFetched = await fetchCached(
      `poe2db-tree-${locale}`,
      poe2dbTreeUrl(gray.version, locale),
      {
        ...fetchOptions,
        minIntervalMs: options.poe2dbIntervalMs,
      },
    )
    const passives = buildPassivesDict(gray.repoe, parsePoe2dbTree(JSON.parse(treeFetched.body)), {
      source: 'repoe-fork/poe2 + poe2db.tw',
      gameVersion,
      fetchedAt: treeFetched.meta.fetchedAt,
    })
    const target = await fetchLists(POE2DB_LANG[locale], fetchOptions, options.poe2dbIntervalMs)
    const conflicts = listConflicts(target.lists)
    if (conflicts.length > 0)
      warn(`poe2db ${POE2DB_LANG[locale]} 列表页同一 slug 出现不同文本：${conflicts.join('、')}`)
    const fetchedAt = target.sources[0]?.fetchedAt ?? options.now
    const gems = buildGemsDict({
      gems: gray.gems.gems,
      noBaseItem: gray.gems.noBaseItem,
      en: gray.enLists.gems.names,
      target: target.lists.gems.names,
      meta: { source: 'repoe-fork/poe2 + poe2db.tw', gameVersion, fetchedAt },
    })
    const items = buildItemsDict({
      names: gray.itemNames,
      bases: { en: gray.enLists.bases.names, target: target.lists.bases.names },
      uniques: { en: gray.enLists.uniques.names, target: target.lists.uniques.names },
      meta: { source: `trade2 ${TRADE2_HOSTS.en} + poe2db.tw`, gameVersion, fetchedAt },
    })
    return {
      passives,
      gems,
      items,
      sources: [sourceRecord(`poe2db-tree-${locale}`, treeFetched), ...target.sources],
    }
  } catch (error) {
    warn(`灰区链路失败（${errorMessage(error)}）`)
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
  const globalWarnings: string[] = []
  const warnGlobal: Warn = (message) => {
    options.log(`警告：${message}`)
    globalWarnings.push(message)
  }
  const versions = parseVersions(await readJson(join(options.overridesDir, 'versions.json')))
  const orderOverrides = parseStatOrder(
    await readJson(join(options.overridesDir, 'stat-order.json')),
  )
  const winnerOverrides = parseStatWinners(
    await readJson(join(options.overridesDir, 'stat-winners.json')),
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
  const gray = options.poe2db ? await prepareGray(options, fetchOptions, warnGlobal) : null

  const regressions: Record<string, string[]> = {}
  const skipped: Locale[] = []
  for (const locale of options.locales) {
    const gameVersion = versions[locale]
    if (gameVersion === undefined) throw new Error(`versions.json 缺少 ${locale}`)
    const warnings = [...globalWarnings]
    const warn: Warn = (message) => {
      options.log(`警告：${locale} ${message}`)
      warnings.push(message)
    }
    // items / gems 的英文锚点来自 trade2 en 与 repoe master，中文名来自跟随该服版本的页面：版本不同时留痕
    const enVersion = versions.en
    if (options.poe2db && enVersion !== undefined && enVersion !== gameVersion)
      warn(`items / gems 为跨版本 join：英文侧 ${enVersion}，${locale} 侧 ${gameVersion}`)
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
      winners: winnerOverrides[locale],
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
    const grayOutcome =
      gray === null ? null : await buildGray(locale, gray, gameVersion, fetchOptions, options, warn)
    if (gray !== null && grayOutcome !== null) {
      bundle.passives = grayOutcome.passives.dict
      bundle.gems = grayOutcome.gems.dict
      bundle.items = grayOutcome.items.dict
      sources.push(...gray.sources, ...grayOutcome.sources)
    }
    // 灰区总开关开启但本次链路失败：不产出半成品，本次整体不更新该 locale 的词典（primary 表也不写）
    if (options.poe2db && grayOutcome === null) {
      warn('灰区链路失败，本次不更新该 locale 的词典（用 --no-poe2db 可只产出 primary 表）')
      // 该 locale 写不了自己的 meta.json：把失败记进全局告警，让之后仍能写盘的 locale 带上
      globalWarnings.push(`${locale} 灰区链路失败，本次未更新`)
      skipped.push(locale)
      continue
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
    await writeJson(join(localeDir, 'ascendancies.json'), bundle.ascendancies)
    await writeJson(join(localeDir, 'classes.json'), bundle.classes)
    await writeJson(join(localeDir, 'inventories.json'), bundle.inventories)
    if (grayOutcome === null) {
      for (const table of ['passives', 'gems', 'items'])
        await rm(join(localeDir, `${table}.json`), { force: true })
    } else {
      await writeJson(join(localeDir, 'passives.json'), grayOutcome.passives.dict)
      await writeJson(join(localeDir, 'gems.json'), grayOutcome.gems.dict)
      await writeJson(join(localeDir, 'items.json'), grayOutcome.items.dict)
    }
    const { multiPlaceholderIds, literalNumberIds, literalSkipped, ...statsAudit } = stats.audit
    await writeJson(join(localeDir, '_review', 'multi-placeholder.json'), {
      locale,
      generatedAt: options.now,
      note: '多占位符词缀清单：逐条核对中英语序，语序不同的把 key 与顺序写进 _overrides/stat-order.json',
      entries: multiPlaceholderIds,
    })
    await writeJson(join(localeDir, '_review', 'literal-number.json'), {
      locale,
      generatedAt: options.now,
      note: '含字面数字的词缀：entries 是全部（变体前原文）；skipped 是无法对应（text 缺该数字或同一数字在 en 里重复）而保持原样、运行期永远匹配不上的条目',
      entries: literalNumberIds,
      skipped: literalSkipped,
    })
    const meta: DictMetaFile = {
      locale,
      gameVersion,
      leagueName,
      builtAt: options.now,
      sources,
      counts: {
        stats: stats.dict.entries.length,
        passives: grayOutcome?.passives.dict._meta.count ?? 0,
        gems: grayOutcome?.gems.dict._meta.count ?? 0,
        bases: grayOutcome === null ? 0 : Object.keys(grayOutcome.items.dict.bases).length,
        uniques: grayOutcome === null ? 0 : Object.keys(grayOutcome.items.dict.uniques).length,
        ascendancies: bundle.ascendancies?._meta.count ?? 0,
        classes: bundle.classes?._meta.count ?? 0,
        inventories: bundle.inventories?._meta.count ?? 0,
      },
      audit: {
        stats: statsAudit,
        passives: grayOutcome?.passives.audit ?? null,
        gems: grayOutcome?.gems.audit ?? null,
        items: grayOutcome?.items.audit ?? null,
        problems: summarizeProblems(problems),
      },
      coverage,
      warnings,
    }
    await writeJson(join(localeDir, 'meta.json'), meta)
    options.log(
      `${locale}：词缀 ${meta.counts.stats} 条，天赋 ${meta.counts.passives} 条，宝石 ${meta.counts.gems} 条，基底 ${meta.counts.bases} / 传奇 ${meta.counts.uniques} 条，审计问题 ${problems.length}，覆盖率 synthetic ${percent(coverage.synthetic?.rate ?? null)} / local ${percent(coverage.local?.rate ?? null)}，名称行命中 ${(coverage.synthetic?.namesTranslated ?? 0) + (coverage.local?.namesTranslated ?? 0)}`,
    )
  }
  return {
    ok: Object.keys(regressions).length === 0 || options.allowRegression,
    regressions,
    skipped,
  }
}
