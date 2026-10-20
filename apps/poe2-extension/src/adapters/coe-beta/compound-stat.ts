import type { Lexicon } from '@poe2-tools/l10n-core'

/** 仅供 Data 展示。完整匹配优先，回退只接受明确分隔且全部能独立翻译的属性。 */
export function compoundStat(text: string, lex: Lexicon): string | null {
  const whole = lex.translate(text, 'stat')
  if (whole !== null) return whole
  // 条件可能作用于相邻多句，不能拆开后把作用范围改掉。
  if (/\b(?:if|while|when|unless|during|for each|per)\b/i.test(text)) return null
  const parts: string[] = []
  const separators: string[] = []
  const stack: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i] ?? ''
    if (char === '(' || char === '[') stack.push(char)
    else if (char === ')' || char === ']') {
      if (stack.pop() !== (char === ')' ? '(' : '[')) return null
    } else if (
      stack.length === 0 &&
      (char === '\n' || (char === ',' && /\s/.test(text[i + 1] ?? '')))
    ) {
      parts.push(text.slice(start, i))
      let end = i + 1
      while (/\s/.test(text[end] ?? '') && end < text.length) end++
      separators.push(text.slice(i, end))
      start = end
      i = end - 1
    }
  }
  if (stack.length || parts.length === 0) return null
  parts.push(text.slice(start))
  const translated = parts.map((part) => (part.trim() ? lex.translate(part, 'stat') : null))
  if (translated.some((part) => part === null)) return null
  return translated.map((part, index) => part + (separators[index] ?? '')).join('')
}
