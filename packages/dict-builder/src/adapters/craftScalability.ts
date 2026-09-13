import { type CatalogStatScalar, splitStatScalars } from '@poe2-tools/item-core'
import type { LuaTable, LuaValue } from './restrictedLua'

function array(value: LuaValue | undefined): LuaValue[] {
  if (value === null || typeof value !== 'object') throw new Error('缩放来源不是表')
  const keys = Object.keys(value)
  if (keys.some((key, index) => key !== String(index + 1))) throw new Error('缩放来源数组不连续')
  return Object.values(value)
}

function scalar(value: LuaValue): CatalogStatScalar {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.keys(value).some((key) => !['isScalable', 'formats'].includes(key)) ||
    (value.isScalable !== undefined && typeof value.isScalable !== 'boolean')
  )
    throw new Error('缩放来源含未知字段或无效标记')
  const formats = value.formats === undefined ? [] : array(value.formats)
  if (formats.some((format) => typeof format !== 'string' || format.length === 0))
    throw new Error('缩放来源格式声明无效')
  return { scalable: value.isScalable === true, formats: formats as string[] }
}

/** 只取当前目录能精确对应的声明；范围不能因为端点恰好相等而命中固定条件。 */
export function normalizeCraftScalability(
  raw: LuaTable,
  patterns: readonly string[],
): {
  lines: Record<string, CatalogStatScalar[]>
  missing: string[]
} {
  const index = new Map<string, { tokens: string[]; scalars: CatalogStatScalar[] }[]>()
  const signatures = new Set(
    patterns.map((pattern) => JSON.stringify(splitStatScalars(pattern).literals)),
  )
  for (const [template, value] of Object.entries(raw)) {
    const split = splitStatScalars(template)
    const key = JSON.stringify(split.literals)
    if (!signatures.has(key)) continue
    const scalars = array(value).map(scalar)
    if (split.tokens.filter((token) => token.text.includes('#')).length !== scalars.length)
      throw new Error(`缩放来源占位符数量不一致：${template}`)
    const entries = index.get(key) ?? []
    entries.push({ tokens: split.tokens.map((token) => token.text), scalars })
    index.set(key, entries)
  }
  const lines: Record<string, CatalogStatScalar[]> = {}
  const missing: string[] = []
  for (const pattern of [...new Set(patterns)].sort()) {
    const split = splitStatScalars(pattern)
    const matches = (index.get(JSON.stringify(split.literals)) ?? []).filter(
      (entry) =>
        entry.tokens.length === split.tokens.length &&
        entry.tokens.every((token, position) => {
          if (token.includes('#')) return true
          const actual = split.tokens[position]?.text
          return actual !== undefined && !actual.includes('(') && Number(actual) === Number(token)
        }),
    )
    const specificity = (tokens: string[]) => tokens.filter((token) => !token.includes('#')).length
    const highest = Math.max(...matches.map((entry) => specificity(entry.tokens)))
    const best = matches.filter((entry) => specificity(entry.tokens) === highest)
    const selected = best[0]
    if (best.length > 1) throw new Error(`缩放来源模板对应存在歧义：${pattern}`)
    if (!selected) {
      missing.push(pattern)
      continue
    }
    let position = 0
    lines[pattern] = selected.tokens.map((token) =>
      token.includes('#')
        ? (selected.scalars[position++] as CatalogStatScalar)
        : { scalable: false, formats: [] },
    )
  }
  return { lines, missing }
}
