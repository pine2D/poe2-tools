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
const TOKEN = `(${NUMBER}(?:${RANGE}|\\(${NUMBER}\\))?|[+-]?${RANGE})`

// 仅规范已核对的雕像词典身份；不对任意 second/seconds 做模糊匹配。
export function canonicalStatTemplates(entries: readonly StatTemplate[]): StatTemplate[] {
  return entries.map((entry) =>
    entry.id === 'rune.stat_226999623' &&
    entry.en === 'Companions gain Onslaught for # second on Hitting your Marked targets'
      ? { ...entry, en: 'Companions gain Onslaught for # seconds on Hitting your Marked targets' }
      : entry,
  )
}
export function reducedStatFallbacks(entries: readonly StatTemplate[]): StatTemplate[] {
  // 与 Build 翻译已有的提高/降低规则对称；仅唯一配对时生成回退，不推断 more/less。
  return entries.flatMap((entry) => {
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
}

// 模板字面数字不替换；每个捕获组是一个 roll，括号范围始终跟着实际数值。
export function createStatResolver(
  entries: readonly StatTemplate[],
  additionalFallbacks: readonly StatTemplate[] = [],
) {
  entries = canonicalStatTemplates(entries)
  // 国服实物文本使用“咒符位”；仅为已核对的固有属性模板派生别名，精确词典仍优先。
  const aliases = entries.flatMap((entry) =>
    entry.id === 'implicit.stat_1416292992' &&
    entry.en === 'Has # Charm Slot' &&
    entry.text === '具有 # 个咒符栏'
      ? [{ ...entry, text: '具有 # 个咒符位' }]
      : [],
  )
  const patterns = [
    ...entries,
    ...aliases,
    ...reducedStatFallbacks(entries),
    ...additionalFallbacks,
  ].flatMap((entry, entryIndex) => {
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

type Mode = 'localized' | 'english' | 'mixed'
type Resolver = ReturnType<typeof createStatResolver>
interface CachedDictionary {
  snapshot: readonly StatTemplate[]
  modes: Map<Mode, Resolver>
}

const EMPTY_ENTRIES: readonly StatTemplate[] = []
const dictionaries = new WeakMap<readonly StatTemplate[], CachedDictionary>()

function unchanged(entries: readonly StatTemplate[], snapshot: readonly StatTemplate[]): boolean {
  return (
    entries.length === snapshot.length &&
    entries.every((entry, index) => {
      const previous = snapshot[index]
      return (
        previous !== undefined &&
        entry.id === previous.id &&
        entry.en === previous.en &&
        entry.text === previous.text &&
        entry.order?.length === previous.order?.length &&
        (entry.order === undefined ||
          entry.order.every((value, i) => value === previous.order?.[i]))
      )
    })
  )
}

/** 检查与复核共用同一词典的解析器；核对内容快照，原地改词条或顺序也会失效。 */
export function getStatResolver(
  input: readonly StatTemplate[] | undefined,
  mode: Mode = 'localized',
): Resolver {
  const entries = input ?? EMPTY_ENTRIES
  let cached = dictionaries.get(entries)
  if (cached === undefined || !unchanged(entries, cached.snapshot)) {
    cached = {
      snapshot: entries.map(({ id, en, text, order }) => ({
        id,
        en,
        text,
        ...(order === undefined ? {} : { order: [...order] }),
      })),
      modes: new Map(),
    }
    dictionaries.set(entries, cached)
  }
  let resolver = cached.modes.get(mode)
  if (resolver === undefined) {
    const english = () => cached.snapshot.map(({ id, en }) => ({ id, en, text: en }))
    resolver = createStatResolver(
      mode === 'mixed'
        ? [...cached.snapshot, ...english()]
        : mode === 'english'
          ? english()
          : cached.snapshot,
    )
    cached.modes.set(mode, resolver)
  }
  return resolver
}

export function resolveStat(text: string, entries: readonly StatTemplate[]): Resolution {
  return getStatResolver(entries)(text)
}

export function resolveBase(
  names: readonly string[],
  rarity: string,
  bases: Record<string, string>,
  inputNames: Record<string, readonly string[]> = {},
): Resolution {
  const source = names.at(-1)?.trim() ?? ''
  const matches = [...new Set([...Object.keys(bases), ...Object.keys(inputNames)])].flatMap(
    (english) =>
      [...new Set([bases[english], english, ...(inputNames[english] ?? [])])].flatMap((name) => {
        if (name === undefined) return []
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
