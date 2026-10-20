import type { StatEntry } from '@poe2-tools/build-core'
import { statSignature } from '../stat-signature.mjs'
import { buildStatsDict, type StatsBuildInput } from './trade2Stats'

export interface StatSnapshot {
  locale: string
  url: string
  sha256: string
  fetchedAt: string
  gameVersion: string
}

export interface CanonicalDecision {
  en: string
  sourceId: string
  signature: string
  reason: string
}

export const statKey = (text: string): string =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^\+(?=#)/, '')

/** 与旧 .build 的数字归一化产物分离；只有源模板的 # 可以变化。 */
export function buildStatCatalog(
  input: Pick<StatsBuildInput, 'en' | 'target' | 'locale' | 'orderOverrides'> & {
    sources: StatSnapshot[]
    decisions: CanonicalDecision[]
  },
) {
  if (
    input.sources.length !== 2 ||
    !['en', input.locale].every((locale) => input.sources.some((s) => s.locale === locale)) ||
    input.sources.some(
      (s) =>
        !/^https:\/\//.test(s.url) ||
        !/^[a-f0-9]{64}$/.test(s.sha256) ||
        !s.fetchedAt ||
        !s.gameVersion,
    )
  )
    throw new Error('词缀需要完整的英文及目标语言独立快照')
  const fetchedAt =
    input.sources
      .map((s) => s.fetchedAt)
      .sort()
      .at(-1) ?? ''
  const { dict, audit } = buildStatsDict({
    ...input,
    winners: {},
    preserveLiteralNumbers: true,
    meta: { source: 'trade2', gameVersion: 'unknown', fetchedAt },
  })
  const entries: (StatEntry & { preferred?: boolean })[] = dict.entries
  const groups = new Map<string, typeof entries>()
  for (const entry of entries) {
    const key = statKey(entry.en)
    groups.set(key, [...(groups.get(key) ?? []), entry])
  }
  const decided = new Set<string>()
  for (const decision of input.decisions) {
    const key = statKey(decision.en)
    const candidates = groups.get(key) ?? []
    const selected = candidates.filter((e) => e.id === decision.sourceId)
    if (
      !decision.reason.trim() ||
      decided.has(key) ||
      selected.length !== 1 ||
      candidates.length < 2 ||
      selected[0]?.en === selected[0]?.text ||
      !selected[0] ||
      decision.signature !== statSignature(selected[0])
    )
      throw new Error(`失效或重复的词缀裁决：${decision.en}`)
    decided.add(key)
    const winner = selected[0]
    if (winner) winner.preferred = true
  }
  const unresolved = [...groups]
    .filter(([key, group]) => {
      const translations = group.filter((e) => e.text !== e.en)
      return !decided.has(key) && new Set(translations.map((e) => e.text)).size > 1
    })
    .map(([en, group]) => ({ en, sourceIds: group.map((e) => e.id) }))
  return {
    _meta: {
      ...dict._meta,
      schemaVersion: 1,
      projection: 'source-placeholders',
      locale: input.locale,
      sources: input.sources,
      decisions: input.decisions,
      normalization:
        'fold whitespace; strip trade suffix; merge equal template/translation; preserve literal numbers',
    },
    entries,
    audit: {
      joined: audit.joined,
      missingInTarget: audit.missingInTarget,
      groupMismatch: audit.groupMismatch,
      placeholderMismatch: audit.placeholderMismatch,
      multiPlaceholder: audit.multiPlaceholderIds,
      untranslated: entries.filter((e) => e.en === e.text).map((e) => e.id),
      unresolved,
    },
  }
}
