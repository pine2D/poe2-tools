import type { Term } from '@poe2-tools/l10n-core'

export interface DictionarySource {
  path: string
  sha256: string
  tier: 'primary' | 'gray' | 'manual'
  source: unknown
  version: string
  snapshots?: {
    locale: string
    url: string
    sha256: string
    fetchedAt: string
    gameVersion: string
  }[]
  decisions?: { en: string; sourceId: string; reason: string }[]
}

export function buildDictionary(
  root: string,
  output: string,
  options?: { allowGray?: boolean },
): Promise<{
  schemaVersion: 1
  locale: 'zh-CN'
  terms: Term[]
  sources: DictionarySource[]
  allowGray: boolean
}>
