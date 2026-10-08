import { normalizeName, sentenceInitial, type Word, words } from './text'
import type { AbbrSpan, GuideDictionary, GuideEntry, Range, TermSpan, TermStatus } from './types'

export interface MatchContext {
  entities?: readonly Range[]
  emphasis?: readonly Range[]
}

export interface Matcher {
  find(text: string, ctx?: MatchContext): TermSpan[]
  abbreviations(text: string): AbbrSpan[]
}

// 只给名称最后一个词生成规则变体；不规则形式走手工表 aliasesEn。
// derived 标记 -ed/-d/-ing 这类派生形：小写时常是普通英文词（spirited），手工条目据此降为提示。
function inflect(name: string): { form: string; derived: boolean }[] {
  const parts = name.trim().split(/\s+/)
  const last = parts.pop()
  if (!last) return []
  const head = parts.length ? `${parts.join(' ')} ` : ''
  const forms = new Map<string, boolean>()
  const add = (f: string, derived: boolean) => {
    if (!forms.has(f) || !derived) forms.set(f, derived)
  }
  for (const f of [last, `${last}s`, `${last}es`]) add(f, false)
  if (/[^aeiou]y$/i.test(last)) add(`${last.slice(0, -1)}ies`, false)
  add(`${last}ed`, true)
  add(`${last}ing`, true)
  if (/e$/i.test(last)) {
    add(`${last}d`, true)
    add(`${last.slice(0, -1)}ing`, true)
  }
  return [...forms].map(([f, derived]) => ({ form: head + f, derived }))
}

interface Hit {
  entry: GuideEntry
  derived: boolean
}

const isManual = (e: GuideEntry) =>
  e.tier === 'manual' && (e.kind === 'keyword' || e.kind === 'jargon')
const within = (ranges: readonly Range[] | undefined, start: number, end: number) =>
  !!ranges?.some(([a, b]) => a <= start && end <= b)

export function createMatcher(dict: GuideDictionary): Matcher {
  const index = new Map<string, Hit[]>()
  let maxWords = 1
  for (const entry of dict.entries) {
    for (const name of [entry.en, ...(entry.aliasesEn ?? [])]) {
      for (const { form, derived } of inflect(name)) {
        const key = normalizeName(form)
        if (!key) continue
        const list = index.get(key)
        const hit = list?.find((h) => h.entry === entry)
        if (!list) index.set(key, [{ entry, derived }])
        else if (!hit) list.push({ entry, derived })
        else if (!derived) hit.derived = false
        maxWords = Math.max(maxWords, key.split(' ').length)
      }
    }
  }

  // 先按原样查；查不到且末词带所有格 's 时，去掉后缀再查，命中范围不含后缀
  const lookup = (text: string, start: number, end: number) => {
    const key = normalizeName(text.slice(start, end))
    const list = index.get(key)
    if (list) return { list, end }
    if (!key.endsWith("'s")) return null
    const bare = index.get(key.slice(0, -2))
    return bare ? { list: bare, end: end - 2 } : null
  }

  const contiguous = (text: string, ws: readonly Word[], i: number, n: number) => {
    for (let k = i; k < i + n - 1; k++) {
      const a = ws[k]
      const b = ws[k + 1]
      if (!a || !b || !/^[ \t]+$/.test(text.slice(a.end, b.start))) return false
    }
    return true
  }

  const resolve = (
    hits: Hit[],
    text: string,
    start: number,
    end: number,
    next: Word | undefined,
    ctx?: MatchContext,
  ): TermSpan => {
    const list = hits.map((h) => h.entry)
    const manual = list.filter(isManual)
    let pool = manual.length ? manual : list
    const support =
      !!next && /^support$/i.test(next.text) && /^[ \t]+$/.test(text.slice(end, next.start))
    if (support) {
      const gems = pool.filter((e) => e.kind === 'gem')
      if (gems.length) pool = gems
    }
    const zhs = [...new Set(pool.map((e) => e.zh))]
    const head = pool[0] as GuideEntry
    const matched = text.slice(start, end)
    let status: TermStatus
    if (zhs.length > 1) status = 'candidates'
    // 手工条目：原形与复数一律确认；派生形（-ed/-d/-ing）只在首字母大写时确认
    else if (manual.length)
      status =
        hits.some((h) => isManual(h.entry) && !h.derived) || /^[A-Z]/.test(matched)
          ? 'confirmed'
          : 'hint'
    else if (within(ctx?.entities, start, end) || within(ctx?.emphasis, start, end) || support)
      status = 'confirmed'
    // 多词名称不论大小写都确认；单词型名称句中首字母大写才确认（偏离 spec 记录第 1 条）
    else if (/\s/.test(matched) || (/^[A-Z]/.test(matched) && !sentenceInitial(text, start)))
      status = 'confirmed'
    else status = 'hint'
    const span: TermSpan = {
      start,
      end,
      en: head.en,
      zh: zhs[0] as string,
      entryId: head.id,
      tier: head.tier,
      status,
    }
    if (zhs.length > 1) span.candidates = zhs
    return span
  }

  return {
    find(text, ctx) {
      const ws = words(text)
      const spans: TermSpan[] = []
      let i = 0
      while (i < ws.length) {
        let step = 1
        for (let n = Math.min(maxWords, ws.length - i); n >= 1; n--) {
          if (!contiguous(text, ws, i, n)) continue
          const first = ws[i] as Word
          const last = ws[i + n - 1] as Word
          const hit = lookup(text, first.start, last.end)
          if (!hit) continue
          spans.push(resolve(hit.list, text, first.start, hit.end, ws[i + n], ctx))
          step = n
          break
        }
        i += step
      }
      return spans
    },
    abbreviations(text) {
      const out: AbbrSpan[] = []
      for (const a of dict.abbreviations) {
        const re = new RegExp(
          `(?<![A-Za-z0-9])${a.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`,
          'g',
        )
        for (const match of text.matchAll(re)) {
          const start = match.index ?? 0
          out.push({ start, end: start + a.en.length, en: a.en, note: a.note })
        }
      }
      return out.sort((x, y) => x.start - y.start)
    },
  }
}
