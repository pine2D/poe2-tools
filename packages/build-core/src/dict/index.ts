import { templateKey } from '../text/numbers'
import type { DictBundle, Locale, NamedEntry, StatEntry } from './types'

export interface DictIndex {
  locale: Locale
  statsByKey: Map<string, StatEntry>
  bases: Map<string, string>
  uniques: Map<string, string>
  gems: Map<string, NamedEntry>
  passives: Map<string, NamedEntry>
  ascendancies: Map<string, string>
  inventories: Map<string, string>
  classes: Map<string, string>
}

function toMap<T>(record: Record<string, T> | undefined): Map<string, T> {
  return new Map(Object.entries(record ?? {}))
}

export function buildDictIndex(bundle: DictBundle): DictIndex {
  const statsByKey = new Map<string, StatEntry>()
  for (const entry of bundle.stats?.entries ?? []) {
    const key = templateKey(entry.en)
    if (!statsByKey.has(key)) statsByKey.set(key, entry)
  }
  return {
    locale: bundle.locale,
    statsByKey,
    bases: toMap(bundle.items?.bases),
    uniques: toMap(bundle.items?.uniques),
    gems: toMap(bundle.gems?.entries),
    passives: toMap(bundle.passives?.entries),
    ascendancies: toMap(bundle.ascendancies?.entries),
    inventories: toMap(bundle.inventories?.entries),
    classes: toMap(bundle.classes?.entries),
  }
}
