export type ItemLocale = 'zh-CN' | 'zh-TW' | 'en'

export interface SourceLine {
  raw: string
  line: number
}

export interface Roll {
  value: number
  range: [number, number] | null
}

export type ModifierState = 'crafted' | 'desecrated' | 'fractured'

export interface ItemStat extends SourceLine {
  text: string
  rolls: Roll[]
  unscalable: boolean
  states?: ModifierState[]
}

export type ModKind = 'prefix' | 'suffix' | 'implicit' | 'unique' | 'enchant' | 'unknown'

export interface ItemMod {
  states?: ModifierState[]
  kind: ModKind
  name: string | null
  tier: number | null
  tags: string[]
  header: SourceLine
  stats: ItemStat[]
}

export interface ItemBlock {
  kind:
    | 'properties'
    | 'requirements'
    | 'item-level'
    | 'sockets'
    | 'runes'
    | 'skill'
    | 'modifiers'
    | 'flags'
    | 'note'
    | 'description'
    | 'unknown'
  lines: SourceLine[]
}

export interface ItemDiagnostic {
  code: string
  message: string
  line: number | null
}

export interface ItemDocument {
  schemaVersion: 1
  rawText: string
  locale: ItemLocale
  itemClass: string
  rarity: 'normal' | 'magic' | 'rare' | 'unique'
  nameLines: SourceLine[]
  itemLevel: number | null
  blocks: ItemBlock[]
  mods: ItemMod[]
  fractured?: true
  corrupted: boolean
  mirrored: boolean
  unidentified: boolean
  diagnostics: ItemDiagnostic[]
}

export type ParseItemResult = { ok: true; item: ItemDocument } | { ok: false; error: string }
