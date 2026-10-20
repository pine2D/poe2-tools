export const MATCHER_VERSION = 'guide-matcher-v2'

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
    unknownTitleTail: boolean,
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
    const single = !/\s/.test(matched)
    const caps = /^[A-Z]/.test(matched)
    // 站点实体、强调范围或后接 Support
    const marked = within(ctx?.entities, start, end) || within(ctx?.emphasis, start, end) || support
    const midCaps = caps && !sentenceInitial(text, start)
    const derivedOnly = !hits.some((h) => isManual(h.entry) && !h.derived)
    let status: TermStatus
    if (zhs.length > 1) status = 'candidates'
    else if (
      hits.some(
        (h) =>
          h.entry.tier === 'manual' &&
          h.entry.kind === 'keyword' &&
          h.entry.matchWithoutContext === true &&
          !h.derived,
      )
    )
      status = 'confirmed'
    // 单词型手工关键词与非手工单词同一道门槛；派生形（-ed/-d/-ing）另需首字母大写
    else if (manual.length && single && manual.every((e) => e.kind === 'keyword'))
      status = (derivedOnly ? caps && (marked || midCaps) : marked || midCaps)
        ? 'confirmed'
        : 'hint'
    // 多词手工关键词与行话：原形与复数一律确认；派生形只在首字母大写时确认
    else if (manual.length) status = !derivedOnly || caps ? 'confirmed' : 'hint'
    else if (marked) status = 'confirmed'
    // 多词名称不论大小写都确认；单词型名称句中首字母大写才确认（偏离 spec 记录第 1 条）
    else if (!single || midCaps) status = 'confirmed'
    else status = 'hint'
    // 连续两个未收录的大写后续词可能与当前单词构成完整名称；不能仅凭大小写或整段加粗强制译名。
    // 精确标记当前词、Support 与显式人工例外仍按既有规则确认；行话动词不受此限制。
    const exactMark = [...(ctx?.entities ?? []), ...(ctx?.emphasis ?? [])].some(
      ([a, b]) => a === start && b === end,
    )
    if (
      status === 'confirmed' &&
      single &&
      caps &&
      unknownTitleTail &&
      !exactMark &&
      !support &&
      !pool.some((e) => e.kind === 'jargon' || e.matchWithoutContext)
    )
      status = 'hint'
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
          const a = ws[i + 1]
          const b = ws[i + 2]
          const unknownTitleTail =
            n === 1 &&
            !!a &&
            !!b &&
            contiguous(text, ws, i, 3) &&
            /^[A-Z][a-z]/.test(a.text) &&
            /^[A-Z][a-z]/.test(b.text) &&
            !lookup(text, a.start, a.end) &&
            !lookup(text, b.start, b.end) &&
            !lookup(text, a.start, b.end)
          spans.push(
            resolve(hit.list, text, first.start, hit.end, ws[i + n], unknownTitleTail, ctx),
          )
          step = n
          break
        }
        i += step
      }
      // 明确实体可按完整名称查表，覆盖逗号、尾撇号等普通连续分词无法跨过的标点。
      // 已有覆盖整个实体的更长词条保持原匹配；只替换被完整实体包住的零碎命中。
      for (const [start, end] of ctx?.entities ?? []) {
        if (spans.some((s) => s.start <= start && end <= s.end)) continue
        const hit = lookup(text, start, end)
        if (!hit) continue
        const exact = resolve(hit.list, text, start, hit.end, undefined, false, ctx)
        for (let i = spans.length - 1; i >= 0; i--) {
          const s = spans[i]
          if (s && s.start < exact.end && exact.start < s.end) spans.splice(i, 1)
        }
        spans.push(exact)
      }
      return spans.sort((a, b) => a.start - b.start)
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
