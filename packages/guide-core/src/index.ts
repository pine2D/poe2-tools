export { parseExtractResult, parseGuideDocument } from './document'
export { createMatcher, type MatchContext, type Matcher } from './matcher'
export { findModifiers, MODIFIER_ZH } from './modifiers'
export { normalizeName, sentenceInitial, type Word, words } from './text'
export type * from './types'
export {
  findVerbatim,
  type Protected,
  placeholder,
  protect,
  type Restored,
  restore,
} from './verbatim'
