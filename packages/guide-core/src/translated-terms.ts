import type { EntryKind, TermSpan } from './types'

// 'stat' 是引号内整句词缀，译名来自国服词缀词典；其余与攻略词典条目类型一致。
export type TranslatedTermKind = EntryKind | 'stat'
export interface TranslatedTerm {
  start: number
  end: number
  en: string
  zh: string
  // 旧数据或类型不唯一时省略，显示端只保留下划线。
  kind?: TranslatedTermKind
}
/** 引号内已按词典整句替换的词缀（PreparedBlock.statEvidence 的子集）。 */
export interface TranslatedStat {
  en: string
  zh: string
}
/** 只映射本段确认的术语；不把译文中的普通短词当作新的游戏实体。 */
export function translatedTerms(
  text: string,
  source: readonly TermSpan[],
  stats: readonly TranslatedStat[] = [],
): TranslatedTerm[] {
  const names = new Map<string, Set<string>>()
  // 同一译名的类型必须唯一才能着色；undefined 表示有来源缺少类型。
  const kinds = new Map<string, Set<TranslatedTermKind | undefined>>()
  // 同段普通用法或候选用法可能译成同一个中文词，无法从纯译文恢复对齐。
  const uncertain = new Set(
    source.filter((t) => t.status !== 'confirmed').flatMap((t) => [t.zh, ...(t.candidates ?? [])]),
  )
  const add = (en: string, zh: string, kind: TranslatedTermKind | undefined) => {
    const group = names.get(zh) ?? new Set<string>()
    group.add(en)
    names.set(zh, group)
    const kindGroup = kinds.get(zh) ?? new Set()
    kindGroup.add(kind)
    kinds.set(zh, kindGroup)
  }
  for (const term of source) {
    if (
      term.status !== 'confirmed' ||
      uncertain.has(term.zh) ||
      term.zh.length < 2 ||
      term.zh.length > 200 ||
      term.en.length > 300 ||
      !term.en ||
      term.zh === term.en
    )
      continue
    add(term.en, term.zh, term.kind)
  }
  // 词缀译名经占位恢复原样写入译文，可按整句定位。
  for (const stat of stats) {
    if (
      uncertain.has(stat.zh) ||
      stat.zh.length < 2 ||
      stat.zh.length > 200 ||
      stat.en.length > 300 ||
      !stat.en ||
      stat.zh === stat.en
    )
      continue
    add(stat.en, stat.zh, 'stat')
  }
  const candidates: TranslatedTerm[] = []
  for (const [zh, english] of names) {
    if (english.size !== 1) continue
    const en = [...english][0] as string
    const kindGroup = kinds.get(zh)
    const kind = kindGroup?.size === 1 ? [...kindGroup][0] : undefined
    for (let start = text.indexOf(zh); start >= 0; start = text.indexOf(zh, start + zh.length)) {
      candidates.push(
        kind
          ? { start, end: start + zh.length, en, zh, kind }
          : { start, end: start + zh.length, en, zh },
      )
      if (candidates.length >= 1000) break
    }
    if (candidates.length >= 1000) break
  }
  // 全局长词优先，再按原文位置取每词首次独立出现。
  candidates.sort((a, b) => b.zh.length - a.zh.length || a.start - b.start)
  const accepted: TranslatedTerm[] = []
  for (const c of candidates)
    if (!accepted.some((a) => c.start < a.end && a.start < c.end)) accepted.push(c)
  const seen = new Set<string>()
  return accepted
    .sort((a, b) => a.start - b.start)
    .filter((a) => {
      if (seen.has(a.zh) || seen.size >= 32) return false
      seen.add(a.zh)
      return true
    })
}
