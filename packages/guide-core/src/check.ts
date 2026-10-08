import type { PreparedBlock } from './prepare'
import type { Issue } from './types'
import type { Restored } from './verbatim'

const NUMBER = /\d+(?:\.\d+)?/g
const URL = /https?:\/\/[^\s<>"'）)]+/g
const CJK = /[一-鿿]/

const multiset = (text: string) => {
  const m = new Map<string, number>()
  for (const n of text.match(NUMBER) ?? []) m.set(n, (m.get(n) ?? 0) + 1)
  return m
}
const count = (text: string, needle: string) => (needle ? text.split(needle).length - 1 : 0)

// 只标记问题，不修改译文。
export function checkTranslation(
  block: PreparedBlock,
  output: string,
  restored: Pick<Restored, 'missing' | 'duplicated'>,
  finishReason: string | null,
): Issue[] {
  const issues: Issue[] = []
  const missingTerms = new Set<string>()
  for (const t of block.terms) {
    if (t.status === 'confirmed' && !output.includes(t.zh)) missingTerms.add(`${t.en} → ${t.zh}`)
    if (
      t.status === 'candidates' &&
      t.candidates &&
      !t.candidates.some((z) => output.includes(z))
    ) {
      missingTerms.add(`${t.en} → ${t.candidates.join(' / ')}`)
    }
  }
  if (missingTerms.size) issues.push({ kind: 'term-missing', detail: [...missingTerms].join('；') })

  const src = multiset(block.source)
  const out = multiset(output)
  const lost = [...src].filter(([n, c]) => (out.get(n) ?? 0) < c).map(([n]) => n)
  if (lost.length) {
    issues.push(
      /[万千亿]/.test(output)
        ? { kind: 'number-unit', detail: `数字写法有换算：${lost.join('、')}` }
        : { kind: 'number-mismatch', detail: `译文缺少数字：${lost.join('、')}` },
    )
  }

  const need = new Map<string, number>()
  for (const m of block.modifiers) need.set(m.zh, (need.get(m.zh) ?? 0) + 1)
  const wrong = [...need].filter(([zh, c]) => count(output, zh) < c).map(([zh]) => zh)
  if (wrong.length) issues.push({ kind: 'modifier', detail: `应出现：${wrong.join('、')}` })

  if (restored.missing.length || restored.duplicated.length) {
    issues.push({
      kind: 'placeholder',
      detail: `占位符缺失 ${restored.missing.length} 个、重复 ${restored.duplicated.length} 个`,
    })
  }

  const known = new Set(block.source.match(URL) ?? [])
  const added = (output.match(URL) ?? []).filter((u) => !known.has(u))
  if (added.length) issues.push({ kind: 'url-added', detail: added.join(' ') })

  if (!CJK.test(output) && block.source.trim().split(/\s+/).length >= 3)
    issues.push({ kind: 'untranslated', detail: '译文没有中文' })
  if (finishReason === 'length') issues.push({ kind: 'truncated', detail: '输出被截断' })
  return issues
}
