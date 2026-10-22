import { checkTranslation } from './check'
import type { PreparedBlock } from './prepare'
import type { Issue } from './types'
import { restore } from './verbatim'

export type TranslationAcceptance =
  | { accepted: true; text: string; issues: Issue[] }
  | { accepted: false; reason: string }

// 只解码用于检查的副本；译文始终作为纯文本显示，不解析 HTML。
function inspectText(text: string): string {
  let current = text
  for (let i = 0; i < 5; i++) {
    const next = current.replace(
      /&(?:amp|lt|gt|quot|apos|#(?:x[0-9a-f]{1,6}|[0-9]{1,7}));/gi,
      (whole) => {
        const name = whole.slice(1, -1).toLowerCase()
        const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
        if (named[name]) return named[name]
        const n = name.startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
        return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole
      },
    )
    if (next === current) break
    current = next
  }
  return current
}
const protocol = (text: string) =>
  /<\/?(?:s|t|m|context|quoted-stat)(?=[\s/>]|$)/i.test(inspectText(text))
const rejected = (detail: string): TranslationAcceptance => ({
  accepted: false,
  reason: `译文格式异常：${detail}。可单独重新翻译。`,
})

/** 原始单段的协议边界：源文同形文字必须经本次占位恢复，不能被模型伪造。 */
export function acceptTranslation(
  block: PreparedBlock,
  raw: string,
  finishReason: string | null,
): TranslationAcceptance {
  if (!raw.trim()) return rejected('没有可用正文')
  if (finishReason === 'length') return rejected('服务输出被截断')
  if (protocol(raw)) return rejected('残留内部标记')
  const tokens = block.restoreTokens ?? block.tokens
  const rest = raw.replace(/⟦(\d+)⟧/g, (whole, n: string) =>
    tokens[Number(n)] === undefined ? whole : '',
  )
  if (/[⟦⟧]/.test(inspectText(rest))) return rejected('存在未知或不完整的占位符')
  const restored = restore(raw, tokens)
  if (restored.missing.length || restored.duplicated.length) return rejected('保护内容缺失或重复')
  return {
    accepted: true,
    text: restored.text,
    issues: checkTranslation(block, restored.text, restored, finishReason),
  }
}

/** 缓存是已恢复文本；先扣除来自源文的合法保护片段，再检查残留协议。 */
export function acceptCachedTranslation(
  block: PreparedBlock,
  text: string,
  previous: readonly Issue[],
): TranslationAcceptance {
  if (!text.trim()) return rejected('缓存没有正文')
  if (
    previous.some(
      (i) => i.kind === 'placeholder' || i.kind === 'truncated' || i.kind === 'block-missing',
    )
  )
    return rejected('缓存包含未通过的格式检查')
  let remaining = text
  for (const token of [...(block.restoreTokens ?? block.tokens)].sort(
    (a, b) => b.length - a.length,
  )) {
    if (!remaining.includes(token)) return rejected('缓存缺少受保护的原文内容')
    remaining = remaining.replace(token, '')
  }
  if (protocol(remaining) || /[⟦⟧]/.test(inspectText(remaining)))
    return rejected('缓存残留内部标记或占位符')
  const issues = checkTranslation(block, text, { missing: [], duplicated: [] }, 'stop')
  return { accepted: true, text, issues }
}
