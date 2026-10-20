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
}
