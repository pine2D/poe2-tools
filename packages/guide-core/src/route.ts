import type { GuideBlock } from './types'

export const ROUTE_VERSION = 'guide-route-v1'
export interface StatEvidence {
  id: string
  source: string
  version: string
  sourceId?: string
  path: 'source' | 'polarity' | 'alias'
}
export interface StatResult {
  status: 'translated' | 'unmatched' | 'ambiguous' | 'source-untranslated'
  text: string | null
  candidates: { term: Omit<StatEvidence, 'path'>; text: string; path: StatEvidence['path'] }[]
}
export type StatResolver = (text: string) => StatResult
export type PreserveReason =
  | 'unmatched'
  | 'ambiguous'
  | 'source-untranslated'
  | 'verbatim'
  | 'truncated'
export type BlockRoute =
  | { kind: 'dictionary'; text: string; evidence: StatEvidence[] }
  | { kind: 'narrative' }
  | { kind: 'preserved'; reason: PreserveReason }

const evidence = (r: StatResult): StatEvidence[] =>
  r.candidates.map(({ term, path }) => ({
    id: term.id,
    source: term.source,
    version: term.version,
    path,
    ...(term.sourceId ? { sourceId: term.sourceId } : {}),
  }))

// 整单元精确解析；只有显式分隔的全部子单元命中才组合，绝不局部吞掉正文。
export function routeBlock(block: GuideBlock, resolve: StatResolver): BlockRoute {
  if (block.truncated) return { kind: 'preserved', reason: 'truncated' }
  if (block.kind === 'verbatim') return { kind: 'preserved', reason: 'verbatim' }
  if (block.verbatim?.length || block.entities?.length)
    return block.kind === 'modline'
      ? { kind: 'preserved', reason: 'verbatim' }
      : { kind: 'narrative' }
  const whole = resolve(block.text)
  if (whole.status === 'translated' && whole.text !== null)
    return { kind: 'dictionary', text: whole.text, evidence: evidence(whole) }
  if (whole.status === 'ambiguous' || whole.status === 'source-untranslated')
    return { kind: 'preserved', reason: whole.status }
  const breaks = block.breaks ?? [...block.text.matchAll(/\n/g)].map((m) => m.index + 1)
  if (breaks.length) {
    const bounds = [0, ...breaks, block.text.length]
    const pieces = bounds
      .slice(0, -1)
      .map((start, i) => block.text.slice(start, bounds[i + 1]).trim())
      .filter(Boolean)
    const results = pieces.map((text) => resolve(text))
    if (results.length > 1 && results.every((r) => r.status === 'translated' && r.text !== null))
      return {
        kind: 'dictionary',
        text: results.map((r) => r.text).join('\n'),
        evidence: results.flatMap(evidence),
      }
    if (block.kind === 'modline') {
      const problem = results.find((r) => r.status !== 'translated')
      return {
        kind: 'preserved',
        reason:
          problem?.status === 'ambiguous' || problem?.status === 'source-untranslated'
            ? problem.status
            : 'unmatched',
      }
    }
  }
  return block.kind === 'modline'
    ? { kind: 'preserved', reason: 'unmatched' }
    : { kind: 'narrative' }
}
