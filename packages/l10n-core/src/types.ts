export interface Term {
  id: string
  en: string
  zh: string
  domain: 'base' | 'unique' | 'stat' | 'material' | 'ui' | 'gem' | 'passive' | 'item'
  sourceId?: string
  source: string
  version: string
  aliases?: readonly string[]
  order?: readonly number[]
  /** 独立语种的导入词条，不用于页面显示和简体搜索候选。 */
  inputOnly?: boolean
  /** 只裁决同一原始英文模板的展示译文；不用于反向歧义消解。 */
  preferred?: boolean
}
export interface Candidate {
  term: Term
  exact: boolean
}
export interface Lexicon {
  translate(text: string, domain?: Term['domain']): string | null
  search(
    text: string,
    domain: Term['domain'] | readonly Term['domain'][],
    accept?: (term: Term) => boolean,
  ): Candidate[]
  resolveStat?: (text: string, direction?: StatDirection) => StatResolution
}

export type StatDirection = 'toChinese' | 'toEnglish'
export interface StatResolution {
  status: 'translated' | 'unmatched' | 'ambiguous' | 'source-untranslated'
  text: string | null
  candidates: { term: Term; text: string; path: 'source' | 'polarity' | 'alias' }[]
}
export interface GameLexicon extends Lexicon {
  resolveStat: (text: string, direction?: StatDirection) => StatResolution
}
