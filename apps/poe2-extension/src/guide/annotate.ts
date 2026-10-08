import type { AbbrSpan, TermSpan, Tier } from '@poe2-tools/guide-core'
import { el } from './dom'

const TIER: Record<Tier, string> = { primary: '官方数据', gray: '社区资料', manual: '人工审定' }

function termTitle(t: TermSpan): string {
  if (t.status === 'candidates' && t.candidates)
    return `${t.en} → ${t.candidates.join(' / ')}（需按语境判断 · ${TIER[t.tier]}）`
  if (t.status === 'hint') return `可能是术语：${t.en} → ${t.zh}（${TIER[t.tier]}）`
  return `${t.en} → ${t.zh}（${TIER[t.tier]}）`
}

export function annotate(
  doc: Document,
  text: string,
  terms: readonly TermSpan[],
  abbreviations: readonly AbbrSpan[],
): DocumentFragment {
  const marks = [
    ...terms.map((t) => ({
      start: t.start,
      end: t.end,
      node: () =>
        el(
          doc,
          'span',
          {
            class: 'term',
            'data-status': t.status,
            tabindex: '0',
            title: termTitle(t),
            'aria-label': `${text.slice(t.start, t.end)}：${termTitle(t)}`,
          },
          text.slice(t.start, t.end),
        ),
    })),
    ...abbreviations.map((a) => ({
      start: a.start,
      end: a.end,
      node: () => el(doc, 'abbr', { title: a.note, tabindex: '0' }, text.slice(a.start, a.end)),
    })),
  ].sort((a, b) => a.start - b.start)
  const frag = doc.createDocumentFragment()
  let at = 0
  for (const m of marks) {
    if (m.start < at) continue
    frag.append(text.slice(at, m.start), m.node())
    at = m.end
  }
  frag.append(text.slice(at))
  return frag
}
