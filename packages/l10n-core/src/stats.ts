import { createLexicon } from './dictionary'
import { normalize } from './display'
import { searchTerms } from './search'
import type { GameLexicon, StatDirection, StatResolution, Term } from './types'

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const compact = (text: string) => normalize(text).replace(/\s+/g, '').replace(/％/g, '%')
const key = (text: string) => normalize(text).replace(/^\+(?=#)/, '')
const number = String.raw`[+-]?\d+(?:\.\d+)?`
const range = String.raw`\(${number}[-–—]${number}\)`
const value = `([+-]?#|[+-]?${range}|${number}(?:${range}|\\(${number}\\))?)`
type Path = StatResolution['candidates'][number]['path']
interface Rule {
  term: Term
  path: Path
}

/** 唯一的双向数值编译器：order 始终表示“目标第 i 个变量取源第 order[i] 个”。 */
function compile(
  source: string,
  target: string,
  order: readonly number[] | undefined,
  input: boolean,
) {
  const canonical = input ? compact : normalize
  const pattern = new RegExp(
    `^${canonical(source)
      .replace(/^\+(?=#)/, '')
      .split('#')
      .map(escapePattern)
      .join(value)}$`,
    'i',
  )
  return (text: string): string | null => {
    const match = pattern.exec(canonical(text))
    if (!match) return null
    const values = match.slice(1)
    let i = 0
    return target.replace(/([+-]?)#/g, (_all, sign: string) => {
      const captured = values[order?.[i] ?? i] ?? '#'
      i++
      return /^[+-]/.test(captured) ? captured : sign + captured
    })
  }
}

function rulesFor(original: Term): Rule[] {
  const term = { ...original, ...(original.order ? { order: [...original.order] } : {}) }
  const aliases: Rule[] = []
  // 延续已核对的官方词条规范；两种英文都可显示，导出采用复数形式。
  if (
    term.sourceId === 'rune.stat_226999623' &&
    term.en === 'Companions gain Onslaught for # second on Hitting your Marked targets'
  ) {
    aliases.push({ term: { ...term, id: `${term.id}:singular` }, path: 'alias' })
    term.en = term.en.replace(' second ', ' seconds ')
  }
  if (
    term.sourceId === 'implicit.stat_1416292992' &&
    term.en === 'Has # Charm Slot' &&
    term.zh === '具有 # 个咒符栏'
  ) {
    const zh = '具有 # 个咒符位'
    term.aliases = [...(term.aliases ?? []), zh]
    aliases.push({ term: { ...term, id: `${term.id}:input`, zh, inputOnly: true }, path: 'alias' })
  }
  const rules: Rule[] = [{ term, path: 'source' }, ...aliases]
  // 只有明确修饰数值的单一 increased 才能派生，不能交换条件或 more/less。
  if (
    (term.en.match(/\bincreased\b/g) ?? []).length === 1 &&
    /(?:^|\s)#% increased\b/.test(term.en) &&
    !/\breduced\b/.test(term.en)
  ) {
    for (const [up, down] of [
      ['提高', '降低'],
      ['增加', '減少'],
    ] as const) {
      if (term.zh.split(up).length !== 2 || term.zh.includes(down)) continue
      rules.push({
        term: {
          ...term,
          id: `${term.id}:reduced`,
          en: term.en.replace('increased', 'reduced'),
          zh: term.zh.replace(up, down),
        },
        path: 'polarity',
      })
    }
  }
  return rules
}

/** 扩展显示、检索、反向输入的共同契约；名称/UI 保持原有精确规则。 */
export function createGameLexicon(input: readonly Term[]): GameLexicon {
  // 共用现有身份、占位符和 order 校验；不修改旧入口的兼容行为。
  const ordinary = createLexicon(input)
  const rules = input.filter((t) => t.domain === 'stat').flatMap(rulesFor)
  const prepared = rules.map(({ term, path }) => {
    const order = term.order ?? Array.from({ length: term.en.split('#').length - 1 }, (_, i) => i)
    const inverse = order.map((_, i) => order.indexOf(i))
    const english =
      term.sourceId === 'rune.stat_226999623'
        ? term.en.replace(' for # second on ', ' for # seconds on ')
        : term.en
    return {
      term,
      path,
      firstWord: normalize(term.en).match(/[a-z]+/)?.[0],
      firstHan: term.zh.match(/[\u3400-\u9fff]/u)?.[0],
      forward: compile(term.en, term.zh, order, false),
      backward: compile(term.zh, english, inverse, true),
      english: compile(term.en, english, undefined, false),
    }
  })
  // 变量只能是数值；第一个英文单词／汉字必属于字面模板，可安全缩小候选集。
  const englishIndex = new Map<string, typeof prepared>()
  const chineseIndex = new Map<string, typeof prepared>()
  for (const entry of prepared) {
    for (const [index, key] of [
      [englishIndex, entry.firstWord ?? ''],
      [chineseIndex, entry.firstHan ?? ''],
    ] as const) {
      const group = index.get(key)
      if (group) group.push(entry)
      else index.set(key, [entry])
    }
  }
  const searchable = [
    ...input.filter((t) => t.domain !== 'stat' && !t.inputOnly),
    ...rules.filter(({ term }) => !term.inputOnly).map(({ term }) => term),
  ]
  const cache = new Map<string, StatResolution>()
  function resolveStat(text: string, direction: StatDirection = 'toChinese'): StatResolution {
    const cacheKey = `${direction}:${text}`
    const cached = cache.get(cacheKey)
    if (cached) return cached
    if (text.length > 2000 || (direction === 'toEnglish' && text.includes('#')))
      return { status: 'unmatched', text: null, candidates: [] }
    const englishInput = direction === 'toChinese' || !/[\u3400-\u9fff]/u.test(text)
    const firstWord = normalize(text).match(/[a-z]+/)?.[0]
    const pool = englishInput
      ? englishIndex.get(firstWord ?? '')
      : chineseIndex.get(text.match(/[\u3400-\u9fff]/u)?.[0] ?? '')
    let candidates: StatResolution['candidates'] = []
    for (const entry of pool ?? []) {
      if (direction === 'toChinese' && entry.term.inputOnly) continue
      const translated =
        direction === 'toChinese'
          ? entry.forward(text)
          : englishInput
            ? entry.english(text)
            : entry.backward(text)
      if (translated !== null)
        candidates.push({ term: entry.term, text: translated, path: entry.path })
    }
    // 精确来源优先于派生；没有原始命中才允许受限回退。
    if (candidates.some((c) => c.path === 'source'))
      candidates = candidates.filter((c) => c.path === 'source')
    if (direction === 'toChinese') {
      const translated = candidates.filter((c) => normalize(c.term.en) !== normalize(c.term.zh))
      if (translated.length) candidates = translated
      const preferredKeys = new Set(
        candidates.filter((c) => c.term.preferred).map((c) => key(c.term.en)),
      )
      candidates = candidates.filter((c) => !preferredKeys.has(key(c.term.en)) || c.term.preferred)
    }
    const texts = new Set(candidates.map((c) => normalize(c.text)))
    const status =
      candidates.length === 0
        ? 'unmatched'
        : direction === 'toChinese' &&
            candidates.every((c) => normalize(c.term.en) === normalize(c.term.zh))
          ? 'source-untranslated'
          : texts.size > 1
            ? 'ambiguous'
            : 'translated'
    const result: StatResolution = {
      status,
      text: status === 'translated' ? (candidates[0]?.text ?? null) : null,
      candidates,
    }
    if (cache.size >= 4096) cache.clear()
    cache.set(cacheKey, result)
    return result
  }
  return {
    resolveStat,
    translate(text, domain) {
      if (domain && domain !== 'stat') return ordinary.translate(text, domain)
      const result = resolveStat(text)
      if (result.status === 'translated')
        return (text.match(/^\s*/)?.[0] ?? '') + result.text + (text.match(/\s*$/)?.[0] ?? '')
      return domain === 'stat' || result.status !== 'unmatched' ? null : ordinary.translate(text)
    },
    search: (text, domain, accept) => searchTerms(searchable, text, domain, accept),
  }
}
