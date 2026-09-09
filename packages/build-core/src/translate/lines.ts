import type { DictIndex } from '../dict/index'
import type { Locale, StatEntry } from '../dict/types'
import { applySign, fillNumbers, leadingSign, normalizeNumbers, templateKey } from '../text/numbers'

export interface ModTranslation {
  statId: string
  text: string
}

// 按词典条目声明的 order 重排源行数字：译文第 k 个 '#' 取源行第 order[k] 个数字。
// 未声明 order 时按原顺序；order 长度与数字个数不一致，或下标越界，一律 fail-closed 返回 null。
function orderNumbers(
  numbers: readonly string[],
  order: readonly number[] | undefined,
): string[] | null {
  if (order === undefined) return [...numbers]
  if (order.length !== numbers.length) return null
  const reordered: string[] = []
  for (const i of order) {
    const value = numbers[i]
    if (value === undefined) return null
    reordered.push(value)
  }
  return reordered
}

// 编号词缀行正文 → 目标语言。数字归一化后按模板键查 stats，按 order（若声明）重排后回填；
// 任何一步失败返回 null。
// 交易站只登记 "increased" 形式（负值靠筛选区间表达），攻略作者却照游戏显示写 "reduced"。
// 原键未命中时把源行里唯一的 reduced 换成 increased 再查，命中后把译文里唯一的表述词对调；
// 词典本身带 reduced 形式的条目走原键，不经过这里。源行 reduced 不唯一、源行另含 increased、
// 或译文里表述词不唯一，都放弃（fail-closed）。命中条目的 en 与替换后的源串经 templateKey 归一化后
// 逐字相等，因此 en 侧不必再查 increased 的个数。
const REDUCED_WORDS: Record<Locale, readonly [increased: string, reduced: string]> = {
  'zh-CN': ['提高', '降低'],
  'zh-TW': ['增加', '減少'],
}

function occurrences(text: string, word: string): number {
  return text.split(word).length - 1
}

function swapReduced(template: string, index: DictIndex): StatEntry | null {
  const lower = template.toLowerCase()
  if (occurrences(lower, 'reduced') !== 1 || lower.includes('increased')) return null
  const entry = index.statsByKey.get(templateKey(lower.replace('reduced', 'increased')))
  if (entry === undefined) return null
  const [increased, reduced] = REDUCED_WORDS[index.locale]
  if (occurrences(entry.text, increased) !== 1) return null
  return { ...entry, text: entry.text.replace(increased, reduced) }
}

export function translateModLine(body: string, index: DictIndex): ModTranslation | null {
  const { template, numbers } = normalizeNumbers(body)
  const entry = index.statsByKey.get(templateKey(template)) ?? swapReduced(template, index)
  if (entry === null || entry === undefined) return null
  const ordered = orderNumbers(numbers, entry.order)
  if (ordered === null) return null
  // 前导符号跟着源行第一个数字：找出译文里接收该数字的占位符序号（order 未声明时即第一个）。
  const signPlaceholderIndex = entry.order === undefined ? 0 : entry.order.indexOf(0)
  const target = applySign(
    entry.text,
    leadingSign(template),
    signPlaceholderIndex === -1 ? 0 : signPlaceholderIndex,
  )
  const filled = fillNumbers(target, ordered)
  return filled === null ? null : { statId: entry.id, text: filled }
}

// 普通行正文按基底名 / 传奇名精确匹配
export function translateNameLine(body: string, index: DictIndex): string | null {
  const key = body.trim()
  if (key === '') return null
  return index.bases.get(key) ?? index.uniques.get(key) ?? null
}
