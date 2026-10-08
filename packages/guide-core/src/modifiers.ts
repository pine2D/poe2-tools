import { sentenceInitial } from './text'
import type { ModifierSpan, ModifierWord } from './types'

// 国服交易站词缀模板的实际写法（stats.json 统计：提高 829/831、降低 25/25、总增 21/22、总降 15/15）。
export const MODIFIER_ZH: Readonly<Record<ModifierWord, string>> = {
  increased: '提高',
  reduced: '降低',
  more: '总增',
  less: '总降',
}

const AFTER_NUMBER = /\d(?:[\d.,]*\d)?\)?%\+?\s*(increased|reduced|more|less)\b/gi
const CAPITALIZED = /\b(Increased|Reduced|More|Less)(?=\s+[A-Z][a-z])/g

export function findModifiers(text: string): ModifierSpan[] {
  const out = new Map<number, ModifierSpan>()
  for (const match of text.matchAll(AFTER_NUMBER)) {
    const word = (match[1] ?? '').toLowerCase() as ModifierWord
    const start = (match.index ?? 0) + match[0].length - word.length
    out.set(start, { start, end: start + word.length, word, zh: MODIFIER_ZH[word] })
  }
  for (const match of text.matchAll(CAPITALIZED)) {
    const start = match.index ?? 0
    if (out.has(start) || sentenceInitial(text, start)) continue
    const word = (match[1] ?? '').toLowerCase() as ModifierWord
    out.set(start, { start, end: start + word.length, word, zh: MODIFIER_ZH[word] })
  }
  return [...out.values()].sort((a, b) => a.start - b.start)
}
