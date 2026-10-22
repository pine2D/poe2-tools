// 文本工具：只做英文名称比较需要的最小规范化。
const APOSTROPHES = /[‘’ʼ]/g

export function normalizeName(s: string): string {
  return s.replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface Word {
  start: number
  end: number
  text: string
}

const WORD = /[A-Za-z0-9]+(?:['‘’ʼ-][A-Za-z0-9]+)*/g

export function words(text: string): Word[] {
  const out: Word[] = []
  for (const match of text.matchAll(WORD)) {
    const start = match.index ?? 0
    out.push({ start, end: start + match[0].length, text: match[0] })
  }
  return out
}

// 往前跳过空白与开引号/括号，遇到文本开头或句末标点、冒号、换行、列表符号即为句首。
export function sentenceInitial(text: string, start: number): boolean {
  let i = start - 1
  while (i >= 0 && /[ \t"'([“‘]/.test(text[i] ?? '')) i--
  if (i < 0) return true
  return /[.!?:;\n•*\-–—]/.test(text[i] ?? '')
}
