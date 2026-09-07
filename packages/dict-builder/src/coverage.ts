// 覆盖率口径：build-core translateBuild 报告的 modTranslated / modCandidates（词缀行）。
// 语料分两集：synthetic（入库合成样本）与 local（第三方真实样本，不入库、可缺席）。
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildDictIndex,
  type DictBundle,
  parseBuildFile,
  translateBuild,
} from '@poe2-tools/build-core'

export interface Coverage {
  files: number
  modCandidates: number
  modTranslated: number
  rate: number | null
}

export type FixtureSet = 'synthetic' | 'local'
export type CoverageSets = Record<FixtureSet, Coverage | null>

// 期望输出文件（*.expected.*.build）是译文，不是语料
export async function listBuildFiles(dir: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.build') && !name.includes('.expected.'))
    .sort()
    .map((name) => join(dir, name))
}

export async function measureCoverage(
  bundle: DictBundle,
  files: readonly string[],
): Promise<Coverage> {
  const index = buildDictIndex(bundle)
  const coverage: Coverage = { files: 0, modCandidates: 0, modTranslated: 0, rate: null }
  for (const file of files) {
    const parsed = parseBuildFile(await readFile(file, 'utf8'))
    if (!parsed.ok) continue
    const { report } = translateBuild(parsed.build, index)
    coverage.files += 1
    coverage.modCandidates += report.modCandidates
    coverage.modTranslated += report.modTranslated
  }
  if (coverage.modCandidates > 0) coverage.rate = coverage.modTranslated / coverage.modCandidates
  return coverage
}

export async function measureCoverageSets(
  bundle: DictBundle,
  dirs: Record<FixtureSet, string>,
): Promise<CoverageSets> {
  const sets: CoverageSets = { synthetic: null, local: null }
  for (const set of ['synthetic', 'local'] as const) {
    const files = await listBuildFiles(dirs[set])
    if (files.length > 0) sets[set] = await measureCoverage(bundle, files)
  }
  return sets
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

// 只比较两边都有、文件数相同且 rate 非 null 的集；下降超过 threshold 即回归
export function findRegressions(
  current: CoverageSets,
  baseline: CoverageSets | null,
  threshold = 0.005,
): string[] {
  if (baseline === null) return []
  const regressions: string[] = []
  for (const set of ['synthetic', 'local'] as const) {
    const now = current[set]
    const base = baseline[set]
    if (now === null || base === null || now.files !== base.files) continue
    if (now.rate === null || base.rate === null) continue
    if (now.rate < base.rate - threshold)
      regressions.push(`${set}: ${percent(base.rate)} → ${percent(now.rate)}`)
  }
  return regressions
}
