// dict:check：对入库词典做结构校验（parseDictBundle）、质量审计（auditDictBundle）与覆盖率回归比较。
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { auditDictBundle, type Locale, parseDictBundle } from '@poe2-tools/build-core'
import {
  type CoverageSets,
  type FixtureSet,
  findRegressions,
  measureCoverageSets,
} from './coverage'
import { readBaseline } from './meta'
import { readJson } from './util/json'

export interface CheckOptions {
  locales: readonly Locale[]
  dictDir: string
  fixtureDirs: Record<FixtureSet, string>
  log(message: string): void
}

export interface LocaleCheck {
  parseError: string | null
  problems: number
  coverage: CoverageSets
  regressions: string[]
}

export interface CheckResult {
  ok: boolean
  details: Record<string, LocaleCheck>
}

const TABLES = [
  'stats',
  'items',
  'gems',
  'passives',
  'ascendancies',
  'classes',
  'inventories',
] as const

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function percent(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`
}

export async function runCheck(options: CheckOptions): Promise<CheckResult> {
  const details: Record<string, LocaleCheck> = {}
  let ok = true
  for (const locale of options.locales) {
    const localeDir = join(options.dictDir, locale)
    const raw: Record<string, unknown> = {}
    const empty: CoverageSets = { synthetic: null, local: null }
    let jsonError: string | null = null
    for (const table of TABLES) {
      const path = join(localeDir, `${table}.json`)
      if (!(await exists(path))) continue
      try {
        raw[table] = await readJson(path)
      } catch (error) {
        jsonError = `${locale}/${table}.json 不是合法 JSON（${errorMessage(error)}）`
        break
      }
    }
    if (jsonError !== null) {
      details[locale] = { parseError: jsonError, problems: 0, coverage: empty, regressions: [] }
      ok = false
      options.log(`${locale}：词典结构错误——${jsonError}`)
      continue
    }
    if (Object.keys(raw).length === 0) {
      details[locale] = {
        parseError: `${locale} 没有任何词典文件（${localeDir}）`,
        problems: 0,
        coverage: empty,
        regressions: [],
      }
      ok = false
      options.log(`${locale}：缺少词典文件`)
      continue
    }
    const parsed = parseDictBundle(raw, locale)
    if (!parsed.ok) {
      details[locale] = { parseError: parsed.error, problems: 0, coverage: empty, regressions: [] }
      ok = false
      options.log(`${locale}：词典结构错误——${parsed.error}`)
      continue
    }
    const problems = auditDictBundle(parsed.bundle)
    const coverage = await measureCoverageSets(parsed.bundle, options.fixtureDirs)
    const regressions = findRegressions(coverage, await readBaseline(join(localeDir, 'meta.json')))
    if (regressions.length > 0) ok = false
    details[locale] = { parseError: null, problems: problems.length, coverage, regressions }
    options.log(
      `${locale}：审计问题 ${problems.length}，覆盖率 synthetic ${percent(coverage.synthetic?.rate ?? null)} / local ${percent(coverage.local?.rate ?? null)}${regressions.length > 0 ? `，回归：${regressions.join('；')}` : ''}`,
    )
  }
  return { ok, details }
}
