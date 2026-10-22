import type { Range } from './types'

// 双引号在同一行内从左到右两两配对；只有带强正则特征的引号串才逐字保留。
const QUOTED = /"[^"\n]*"/g
// 强特征：| \ ^ $ .* .+ […]；单独的 + ( ) 常见于词缀文本，不算。
const STRONG_REGEX = /[|\\^$]|\.[*+]|\[[^\]]*\]/

// 需要逐字保留的片段：游戏内搜索正则（见 QUOTED）、代码、网址、PoB 之类的长编码。
const PATTERNS: readonly RegExp[] = [
  // 原文中的同形占位符也保护，恢复只执行一遍，不把它误当成本次生成的编号。
  /⟦\d+⟧/g,
  /`[^`\n]+`/g,
  /https?:\/\/[^\s<>"'）)]+/g,
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}={0,2}/g,
  // 原文里与提示词分段标签同形的文字（<s id="…">、</t>、修饰词标记 <m …> 等）也占位，避免打乱分段与流式拆分。
  /<\/?(?:[stm]|context|quoted-stat)(?=[\s/>]|$)[^<>\n]*(?:>|$)/gi,
  /&(?:amp;)*(?:lt|#0*60|#x0*3c);\/?(?:[stm]|context|quoted-stat)(?=[\s/&]|$)[^\n]*?(?:&(?:amp;)*(?:gt|#0*62|#x0*3e);|$)/gi,
]

export function findVerbatim(text: string): Range[] {
  const found: Range[] = []
  for (const match of text.matchAll(QUOTED)) {
    if (!STRONG_REGEX.test(match[0].slice(1, -1))) continue
    const start = match.index ?? 0
    found.push([start, start + match[0].length])
  }
  for (const re of PATTERNS) {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0
      found.push([start, start + match[0].length])
    }
  }
  return mergeRanges(found)
}

// 重叠范围合并为同一个占位，避免重复截取、恢复或破坏原文顺序。
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const merged: Range[] = []
  for (const r of [...ranges].sort((a, b) => a[0] - b[0])) {
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
