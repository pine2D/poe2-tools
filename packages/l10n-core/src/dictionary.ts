import { compileTerm, normalize } from './display'
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
    // 界面文案仅精确匹配；例如 # Stored 的井号表示数量，并非掷值。
    const count = term.domain === 'ui' ? 0 : (term.en.match(/#/g) ?? []).length
    if (term.domain !== 'ui' && (term.zh.match(/#/g) ?? []).length !== count)
      throw new Error(`数字模板不一致：${term.id}`)
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
  // 静态名称按规范化文本索引；动态词缀仍逐模板匹配并检查歧义。
  const exact = new Map<string, Term[]>()
  const templates: { term: Term; match: (text: string) => string | null }[] = []
  for (const term of terms) {
    if (term.domain !== 'ui' && term.en.includes('#')) {
      templates.push({ term, match: compileTerm(term) })
    } else {
      const key = normalize(term.en)
      const entries = exact.get(key) ?? []
      entries.push(term)
      exact.set(key, entries)
    }
  }
  // 实时计数不可能匹配含英文单词的模板；纯符号模板仍须保留。
  const symbolTemplates = templates.filter(({ term }) => !/[a-z]/i.test(term.en))
  return {
    translate(text, domain) {
      const values = new Set<string>()
      const normalized = normalize(text)
      for (const term of exact.get(normalized) ?? []) {
        if (!domain || term.domain === domain) values.add(term.zh)
        if (values.size > 1) return null
      }
      const candidates = /[a-z]/i.test(normalized) ? templates : symbolTemplates
      for (const entry of candidates) {
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
