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
      const haystack = [...names, ...(term.aliases ?? []).map(normalize)].join(' ')
      return words.every((word) => haystack.includes(word))
        ? [{ term, exact: names.includes(query) }]
        : []
    })
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.term.id.localeCompare(b.term.id))
    .slice(0, 50)
}
