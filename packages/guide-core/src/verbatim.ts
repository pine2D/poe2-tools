import type { Range } from './types'

// 需要逐字保留的片段：游戏内搜索正则、代码、网址、PoB 之类的长编码。
const PATTERNS: readonly RegExp[] = [
  /"[^"\n]*(?:\\[dDwWsSbB]|[|^$*+?()[\]{}])[^"\n]*"/g,
  /`[^`\n]+`/g,
  /https?:\/\/[^\s<>"'）)]+/g,
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}={0,2}/g,
  // 原文里与提示词分段标签同形的文字（<s id="…">、</t> 等）也占位，避免打乱分段与流式拆分。
  /<\/?[st](?:\s[^<>\n]*)?>/gi,
]

export function findVerbatim(text: string): Range[] {
  const found: Range[] = []
  for (const re of PATTERNS) {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0
      found.push([start, start + match[0].length])
    }
  }
  found.sort((a, b) => a[0] - b[0])
  const merged: Range[] = []
  for (const r of found) {
    const last = merged[merged.length - 1]
    if (last && r[0] < last[1]) merged[merged.length - 1] = [last[0], Math.max(last[1], r[1])]
    else merged.push(r)
  }
  return merged
}

export const placeholder = (i: number) => `⟦${i}⟧`

export interface Protected {
  text: string
  tokens: string[]
}

export function protect(text: string, ranges: readonly Range[]): Protected {
  const tokens: string[] = []
  let out = ''
  let at = 0
  for (const [a, b] of ranges) {
    out += text.slice(at, a) + placeholder(tokens.length)
    tokens.push(text.slice(a, b))
    at = b
  }
  return { text: out + text.slice(at), tokens }
}

export interface Restored {
  text: string
  missing: number[]
  duplicated: number[]
}

export function restore(text: string, tokens: readonly string[]): Restored {
  const seen = new Map<number, number>()
  const out = text.replace(/⟦(\d+)⟧/g, (whole, n: string) => {
    const i = Number(n)
    const token = tokens[i]
    if (token === undefined) return whole
    seen.set(i, (seen.get(i) ?? 0) + 1)
    return token
  })
  const missing = tokens.map((_, i) => i).filter((i) => !seen.has(i))
  const duplicated = [...seen].filter(([, c]) => c > 1).map(([i]) => i)
  return { text: out, missing, duplicated }
}
