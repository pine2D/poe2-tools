import { compileTerm } from './display'
import { searchTerms } from './search'
import type { Lexicon, Term } from './types'

export function createLexicon(input: readonly Term[]): Lexicon {
  const ids = new Set<string>()
  const terms = input.map((term) => {
    if (
      !term.id ||
      !term.en.trim() ||
      !term.zh.trim() ||
      !term.source ||
      !term.version ||
      ids.has(term.id)
    )
      throw new Error(`无效或重复术语身份：${term.id}`)
    ids.add(term.id)
    const count = (term.en.match(/#/g) ?? []).length
    if ((term.zh.match(/#/g) ?? []).length !== count) throw new Error(`数字模板不一致：${term.id}`)
    if (
      term.order &&
      (term.order.length !== count ||
        new Set(term.order).size !== count ||
        term.order.some((i) => !Number.isInteger(i) || i < 0 || i >= count))
    )
      throw new Error(`数字顺序不合法：${term.id}`)
    return {
      ...term,
      ...(term.order ? { order: [...term.order] } : {}),
      ...(term.aliases ? { aliases: [...term.aliases] } : {}),
    }
  })
  const compiled = terms.map((term) => ({ term, match: compileTerm(term) }))
  return {
    translate(text, domain) {
      const values = new Set<string>()
      for (const entry of compiled) {
        if (domain && entry.term.domain !== domain) continue
        const translated = entry.match(text)
        if (translated !== null) values.add(translated)
        if (values.size > 1) return null
      }
      const translated = values.values().next().value
      if (translated === undefined) return null
      return (text.match(/^\s*/)?.[0] ?? '') + translated + (text.match(/\s*$/)?.[0] ?? '')
    },
    search: (text, domain) => searchTerms(terms, text, domain),
  }
}
