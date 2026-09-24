import { normalize } from './display'
import type { Candidate, Term } from './types'

export function searchTerms(
  terms: readonly Term[],
  text: string,
  domain: Term['domain'],
): Candidate[] {
  const query = normalize(text)
  if (!query) return []
  const words = query.split(' ')
  return terms
    .filter((term) => term.domain === domain)
    .flatMap((term) => {
      const names = [term.en, term.zh].map(normalize)
      const searchable = [...names, ...(term.aliases ?? []).map(normalize)]
      const haystack = searchable.join(' ')
      if (!words.every((word) => haystack.includes(word))) return []
      // 优先完整名称，再按能够覆盖查询的最短名称／别名排序。
      // 跨语言混输可能只在合并文本中命中，仍保留为候选；排序不改变精确身份判断。
      const matching = searchable.filter((name) => words.every((word) => name.includes(word)))
      const length = Math.min(
        ...(matching.length ? matching : [haystack]).map((name) => name.length),
      )
      return [{ term, exact: names.includes(query), length }]
    })
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.length - b.length ||
        a.term.id.localeCompare(b.term.id),
    )
    .slice(0, 50)
    .map(({ term, exact }) => ({ term, exact }))
}
