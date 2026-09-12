export interface StatTemplate {
  id: string
  en: string
  text: string
  order?: readonly number[]
}

export interface TranslationCandidate {
  id: string
  english: string
}

export interface Resolution {
  english: string | null
  candidates: TranslationCandidate[]
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compact(text: string): string {
  return text.trim().replace(/\s+/g, '').replace(/％/g, '%').toLowerCase()
}

function result(candidates: TranslationCandidate[]): Resolution {
  candidates = [
    ...new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate])).values(),
  ]
  const values = new Set(candidates.map((entry) => entry.english))
  return { english: values.size === 1 ? (candidates[0]?.english ?? null) : null, candidates }
}

const NUMBER = '[+-]?\\d+(?:\\.\\d+)?'
const RANGE = `\\(${NUMBER}[-–—]${NUMBER}\\)`
const TOKEN = `(${NUMBER}(?:${RANGE})?|[+-]?${RANGE})`

// 模板字面数字不替换；每个捕获组是一个 roll，括号范围始终跟着实际数值。
export function createStatResolver(entries: readonly StatTemplate[]) {
  // 与 Build 翻译已有的提高/降低规则对称；仅唯一配对时生成回退，不推断 more/less。
  const fallbacks = entries.flatMap((entry) => {
    if (entry.en.split('increased').length !== 2 || entry.en.includes('reduced')) return []
    return [
      ['提高', '降低'],
      ['增加', '減少'],
    ].flatMap(([up, down]) => {
      if (
        up === undefined ||
        down === undefined ||
        entry.text.split(up).length !== 2 ||
        entry.text.includes(down)
      )
        return []
      return [
        {
          ...entry,
          text: entry.text.replace(up, down),
          en: entry.en.replace('increased', 'reduced'),
        },
      ]
    })
  })
  const patterns = [...entries, ...fallbacks].flatMap((entry, entryIndex) => {
    const count = entry.text.split('#').length - 1
    const order = entry.order ?? Array.from({ length: count }, (_, i) => i)
    if (
      order.length !== count ||
      new Set(order).size !== count ||
      order.some((index) => !Number.isInteger(index) || index < 0 || index >= count) ||
      entry.en.split('#').length - 1 !== count
    )
      return []
    return [
      {
        entry,
        order,
        fallback: entryIndex >= entries.length,
        regex: new RegExp(`^${compact(entry.text).split('#').map(escapeRegex).join(TOKEN)}$`, 'i'),
      },
    ]
  })
  return (text: string): Resolution => {
    if (text.length > 2000) return result([])
    const annotations = readStatAnnotations(text)
    const { states, unscalable } = annotations
    const normalized = compact(annotations.text)
    const candidates: TranslationCandidate[] = []
    let exact = false
    for (const { entry, order, regex, fallback } of patterns) {
      if (fallback && exact) break
      const match = regex.exec(normalized)
      if (match === null) continue
      if (!fallback) exact = true
      const values: string[] = []
      for (const [localIndex, englishIndex] of order.entries())
        values[englishIndex] = match[localIndex + 1] ?? ''
      let index = 0
      const english = entry.en.replace(/#/g, () => values[index++] ?? '')
      candidates.push({
        id: entry.id,
        english:
          english +
          states.map((state) => ` (${state})`).join('') +
          (unscalable ? ' — Unscalable Value' : ''),
      })
    }
    return result(candidates)
  }
}

export function resolveStat(text: string, entries: readonly StatTemplate[]): Resolution {
  return createStatResolver(entries)(text)
}

export function resolveBase(
  names: readonly string[],
  rarity: string,
  bases: Record<string, string>,
): Resolution {
  const source = names.at(-1)?.trim() ?? ''
  const matches = Object.entries(bases).flatMap(([english, local]) =>
    [...new Set([local, english])].flatMap((name) => {
      if (source === name) return [{ id: english, english, start: 0, end: source.length }]
      if (rarity !== 'magic' || name === '') return []
      return [...source.matchAll(new RegExp(`(?<!\\S)${escapeRegex(name)}(?!\\S)`, 'gi'))].map(
        (match) => ({
          id: english,
          english,
          start: match.index,
          end: match.index + match[0].length,
        }),
      )
    }),
  )
  // 只排除同一位置被更长名称包含的短命中，不能吞掉其他位置的独立基底。
  return result(
    matches
      .filter(
        (match) =>
          !matches.some(
            (other) =>
              other.start <= match.start &&
              other.end >= match.end &&
              other.end - other.start > match.end - match.start,
          ),
      )
      .map(({ id, english }) => ({ id, english })),
  )
}

import { readStatAnnotations } from './annotations'
