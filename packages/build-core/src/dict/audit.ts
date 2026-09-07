// 词典质量审计：不改词典内容，只发现潜在问题供人工复核（不是解析期校验，见 load.ts）。
import { templateKey } from '../text/numbers'
import type { DictBundle, NamedDict, StatEntry } from './types'

export interface DictProblem {
  table: string
  key: string
  problem: string
}

function countPlaceholders(text: string): number {
  return (text.match(/#/g) ?? []).length
}

// (a) 无 order 时 en/text 的 '#' 个数必须一致；(b) 有 order 时其长度须等于 text 的 '#' 数、
// 每个下标须 < en 的 '#' 数，且互不重复
function auditStatEntry(problems: DictProblem[], entry: StatEntry): void {
  const enCount = countPlaceholders(entry.en)
  const textCount = countPlaceholders(entry.text)
  if (entry.order === undefined) {
    if (enCount !== textCount) {
      problems.push({
        table: 'stats',
        key: entry.id,
        problem: `占位符个数不一致（en ${enCount} 个，text ${textCount} 个）`,
      })
    }
    return
  }
  const indicesInRange = entry.order.every((i) => i < enCount)
  const noDuplicates = new Set(entry.order).size === entry.order.length
  if (entry.order.length !== textCount || !indicesInRange || !noDuplicates) {
    problems.push({ table: 'stats', key: entry.id, problem: 'order 与占位符个数或下标不匹配' })
  }
}

// (c) templateKey(en) 冲突：同一键第二条及之后每条各记一条 problem
function auditStatKeyConflicts(problems: DictProblem[], entries: readonly StatEntry[]): void {
  const seen = new Map<string, string>()
  for (const entry of entries) {
    const key = templateKey(entry.en)
    const firstId = seen.get(key)
    if (firstId === undefined) {
      seen.set(key, entry.id)
    } else {
      problems.push({ table: 'stats', key, problem: `与 ${firstId} 键冲突` })
    }
  }
}

function auditTextRecord(
  problems: DictProblem[],
  table: string,
  entries: Record<string, string> | undefined,
): void {
  if (entries === undefined) return
  for (const [key, text] of Object.entries(entries)) {
    if (text === '') problems.push({ table, key, problem: '译文为空串' })
  }
}

function auditNamedDict(problems: DictProblem[], table: string, dict: NamedDict | undefined): void {
  if (dict === undefined) return
  for (const [key, entry] of Object.entries(dict.entries)) {
    if (entry.text === '') problems.push({ table, key, problem: '译文为空串' })
  }
}

export function auditDictBundle(bundle: DictBundle): DictProblem[] {
  const problems: DictProblem[] = []
  if (bundle.stats !== undefined) {
    for (const entry of bundle.stats.entries) auditStatEntry(problems, entry)
    auditStatKeyConflicts(problems, bundle.stats.entries)
  }
  if (bundle.items !== undefined) {
    auditTextRecord(problems, 'items.bases', bundle.items.bases)
    auditTextRecord(problems, 'items.uniques', bundle.items.uniques)
  }
  auditNamedDict(problems, 'gems', bundle.gems)
  auditNamedDict(problems, 'passives', bundle.passives)
  auditTextRecord(problems, 'ascendancies', bundle.ascendancies?.entries)
  auditTextRecord(problems, 'inventories', bundle.inventories?.entries)
  return problems
}
