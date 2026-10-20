// 词典来源等级
export type Tier = 'primary' | 'gray' | 'manual'
// 站点适配器标识
export type SiteId = 'mobalytics' | 'poe2com' | 'generic'
// 正文块类型
export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'table-cell'
  | 'modline'
  | 'verbatim'
// 半开区间 [start, end)
export type Range = readonly [number, number]
// 一个正文块
export interface GuideBlock {
  id: string
  kind: BlockKind
  text: string
  stageId?: string
  // 站点明确标记的完整实体名称；普通链接、加粗与选区纯文本不能推断为实体。
  entities?: Range[]
  emphasis?: Range[]
}
// 攻略阶段
export interface GuideStage {
  id: string
  name: string
  current: boolean
}
// 正文来源
export interface GuideSource {
  url: string
  title: string
  siteId: SiteId
  extractedAt: string
  scope: 'full' | 'selection'
  // 站点适配器没读到数据、已改用通用提取（侧边栏据此常驻提示“站点可能改版”）
  fallback?: true
}
// 取正文脚本返回的文档
export interface GuideDocument {
  version: 1
  game: 'poe2'
  targetLocale: 'zh-CN'
  source: GuideSource
  stages: GuideStage[]
  blocks: GuideBlock[]
}
// 取正文结果
export type ExtractResult =
  | { ok: true; doc: GuideDocument }
  | { ok: false; reason: 'coe' | 'poe1' | 'empty' }
// 词条类型
export type EntryKind =
  | 'gem'
  | 'passive'
  | 'ascendancy'
  | 'class'
  | 'base'
  | 'unique'
  | 'keyword'
  | 'jargon'
// 攻略词典条目
export interface GuideEntry {
  id: string
  en: string
  zh: string
  kind: EntryKind
  tier: Tier
  provenance?: {
    path: string
    sha256: string
    sourceId: string
    version: string
    locale: 'zh-CN'
    purpose: 'guide-name'
  }
  aliasesEn?: string[]
  // 仅人工审定的 keyword 原形／复数可跳过上下文门槛，派生形仍保守处理。
  matchWithoutContext?: true
}
// 简称俚语
export interface Abbreviation {
  en: string
  note: string
}
// 攻略词典
export interface GuideDictionary {
  schemaVersion: 1
  ruleVersion?: string
  locale: 'zh-CN'
  hash: string
  entries: GuideEntry[]
  abbreviations: Abbreviation[]
}
// 术语识别状态
export type TermStatus = 'confirmed' | 'candidates' | 'hint'
// 术语命中
export interface TermSpan {
  start: number
  end: number
  en: string
  zh: string
  entryId: string
  tier: Tier
  status: TermStatus
  candidates?: string[]
}
// 简称命中
export interface AbbrSpan {
  start: number
  end: number
  en: string
  note: string
}
// 修饰词
export type ModifierWord = 'increased' | 'reduced' | 'more' | 'less'
// 修饰词命中
export interface ModifierSpan {
  start: number
  end: number
  word: ModifierWord
  zh: string
}
// 核对问题类型
export type IssueKind =
  | 'term-missing'
  | 'number-mismatch'
  | 'number-unit'
  | 'modifier'
  | 'placeholder'
  | 'block-missing'
  | 'url-added'
  | 'untranslated'
  | 'truncated'
// 核对问题
export interface Issue {
  kind: IssueKind
  detail: string
}
