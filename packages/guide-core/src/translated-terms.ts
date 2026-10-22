import type { TermSpan } from './types'

export interface TranslatedTerm {
  start: number
  end: number
  en: string
  zh: string
}
/** 只映射本段确认的术语；不把译文中的普通短词当作新的游戏实体。 */
export function translatedTerms(text: string, source: readonly TermSpan[]): TranslatedTerm[] {
  const names = new Map<string, Set<string>>()
  // 同段普通用法或候选用法可能译成同一个中文词，无法从纯译文恢复对齐。
  const uncertain = new Set(
    source.filter((t) => t.status !== 'confirmed').flatMap((t) => [t.zh, ...(t.candidates ?? [])]),
  )
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
    const group = names.get(term.zh) ?? new Set<string>()
    group.add(term.en)
    names.set(term.zh, group)
  }
  const candidates: TranslatedTerm[] = []
  for (const [zh, english] of names) {
    if (english.size !== 1) continue
    const en = [...english][0] as string
    for (let start = text.indexOf(zh); start >= 0; start = text.indexOf(zh, start + zh.length)) {
      candidates.push({ start, end: start + zh.length, en, zh })
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
