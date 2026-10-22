import type { StatEvidence, StatResolver } from './route'
import type { Range } from './types'

export interface QuotedStat {
  start: number
  end: number
  en: string
  zh: string
  token: number
  evidence: StatEvidence[]
}
// 仅明确引号内的完整词缀；不从普通叙述中猜测词缀边界。
export function quotedStats(
  text: string,
  resolve: StatResolver,
  blocked: readonly Range[],
): Omit<QuotedStat, 'token'>[] {
  const out: Omit<QuotedStat, 'token'>[] = []
  for (const m of text.matchAll(/"([^"\n]+)"|“([^”\n]+)”|'([^'\n]+)'/g)) {
    const en = m[1] ?? m[2] ?? m[3] ?? ''
    const start = m.index + 1
    const end = start + en.length
    if (blocked.some(([a, b]) => start < b && a < end)) continue
    const result = resolve(en)
    if (result.status !== 'translated' || result.text === null) continue
    out.push({
      start,
      end,
      en,
      zh: result.text,
      evidence: result.candidates.map(({ term, path }) => ({
        id: term.id,
        source: term.source,
        version: term.version,
        path,
        ...(term.sourceId ? { sourceId: term.sourceId } : {}),
      })),
    })
  }
  return out
}
