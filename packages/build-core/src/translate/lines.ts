import type { DictIndex } from '../dict/index'
import { applySign, fillNumbers, leadingSign, normalizeNumbers, templateKey } from '../text/numbers'

export interface ModTranslation {
  statId: string
  text: string
}

// 编号词缀行正文 → 目标语言。数字归一化后按模板键查 stats，回填数字；任何一步失败返回 null。
export function translateModLine(body: string, index: DictIndex): ModTranslation | null {
  const { template, numbers } = normalizeNumbers(body)
  const entry = index.statsByKey.get(templateKey(template))
  if (entry === undefined) return null
  const target = applySign(entry.text, leadingSign(template))
  const filled = fillNumbers(target, numbers)
  return filled === null ? null : { statId: entry.id, text: filled }
}

// 普通行正文按基底名 / 传奇名精确匹配
export function translateNameLine(body: string, index: DictIndex): string | null {
  const key = body.trim()
  if (key === '') return null
  return index.bases.get(key) ?? index.uniques.get(key) ?? null
}
