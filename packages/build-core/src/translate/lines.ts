import type { DictIndex } from '../dict/index'
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
export function translateModLine(body: string, index: DictIndex): ModTranslation | null {
  const { template, numbers } = normalizeNumbers(body)
  const entry = index.statsByKey.get(templateKey(template))
  if (entry === undefined) return null
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
