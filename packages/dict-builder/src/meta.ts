// data/dict/<locale>/meta.json：溯源、计数、审计与覆盖率基线。gameVersion 按 locale 分别记录。
import type { DictProblem, Locale } from '@poe2-tools/build-core'
import type { PassivesAudit } from './adapters/passives'
import type { StatsAudit } from './adapters/trade2Stats'
import type { Fetched } from './cache'
import type { Coverage, CoverageSets } from './coverage'
import { readJson } from './util/json'

export interface SourceRecord {
  name: string
  url: string
  sha256: string
  fetchedAt: string
  fromCache: boolean
}

export interface ProblemSummary {
  total: number
  byTable: Record<string, number>
  sample: DictProblem[]
}

// meta.json 里只放 stats 审计的摘要；多占位符清单与字面数字清单分别单独写到
// _review/multi-placeholder.json 与 _review/literal-number.json
export type StatsAuditSummary = Omit<
  StatsAudit,
  'multiPlaceholderIds' | 'literalNumberIds' | 'literalSkipped'
>

export interface DictMetaFile {
  locale: Locale
  gameVersion: string
  leagueName: string | null
  builtAt: string
  sources: SourceRecord[]
  counts: Record<string, number>
  audit: { stats: StatsAuditSummary; passives: PassivesAudit | null; problems: ProblemSummary }
  coverage: CoverageSets
}

export function sourceRecord(name: string, fetched: Fetched): SourceRecord {
  return {
    name,
    url: fetched.meta.url,
    sha256: fetched.meta.sha256,
    fetchedAt: fetched.meta.fetchedAt,
    fromCache: fetched.fromCache,
  }
}

export function summarizeProblems(problems: readonly DictProblem[]): ProblemSummary {
  const byTable: Record<string, number> = {}
  for (const problem of problems) byTable[problem.table] = (byTable[problem.table] ?? 0) + 1
  return { total: problems.length, byTable, sample: problems.slice(0, 20) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseCoverage(raw: unknown): Coverage | null {
  if (!isRecord(raw)) return null
  const { files, modCandidates, modTranslated, rate } = raw
  if (
    typeof files !== 'number' ||
    typeof modCandidates !== 'number' ||
    typeof modTranslated !== 'number'
  )
    return null
  if (rate !== null && typeof rate !== 'number') return null
  return { files, modCandidates, modTranslated, rate }
}

// 读取上一次构建的覆盖率作为基线；文件不存在或结构不对都当没有基线
export async function readBaseline(metaPath: string): Promise<CoverageSets | null> {
  let raw: unknown
  try {
    raw = await readJson(metaPath)
  } catch {
    return null
  }
  if (!isRecord(raw) || !isRecord(raw.coverage)) return null
  return {
    synthetic: parseCoverage(raw.coverage.synthetic),
    local: parseCoverage(raw.coverage.local),
  }
}
