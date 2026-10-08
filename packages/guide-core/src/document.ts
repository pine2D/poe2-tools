import type {
  BlockKind,
  ExtractResult,
  GuideBlock,
  GuideDocument,
  GuideSource,
  GuideStage,
  Range,
  SiteId,
} from './types'

// 取正文脚本运行在第三方页面里，返回值一律当作不可信输入逐字段校验。
const BLOCK_KINDS: readonly BlockKind[] = [
  'heading',
  'paragraph',
  'list-item',
  'table-cell',
  'modline',
  'verbatim',
]
const SITES: readonly SiteId[] = ['mobalytics', 'poe2com', 'generic']
const MAX_BLOCKS = 5000
const MAX_TEXT = 20000

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string'

function ranges(value: unknown, length: number): Range[] | null {
  if (value === undefined) return []
  if (!Array.isArray(value)) return null
  const out: Range[] = []
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2) return null
    const [a, b] = item
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b <= a || b > length) return null
    out.push([a, b])
  }
  return out
}

function source(v: unknown): GuideSource | null {
  if (!isRecord(v)) return null
  const { url, title, siteId, extractedAt, scope } = v
  if (!str(url) || !str(title) || !str(extractedAt)) return null
  if (!SITES.includes(siteId as SiteId)) return null
  if (scope !== 'full' && scope !== 'selection') return null
  const out: GuideSource = { url, title, siteId: siteId as SiteId, extractedAt, scope }
  if (v.fallback === true) out.fallback = true
  return out
}

function stages(v: unknown): GuideStage[] | null {
  if (!Array.isArray(v)) return null
  const out: GuideStage[] = []
  for (const s of v) {
    if (!isRecord(s) || !str(s.id) || !str(s.name) || typeof s.current !== 'boolean') return null
    out.push({ id: s.id, name: s.name, current: s.current })
  }
  return out
}

function block(v: unknown, stageIds: ReadonlySet<string>): GuideBlock | null {
  if (!isRecord(v) || !str(v.id) || !str(v.text)) return null
  if (!BLOCK_KINDS.includes(v.kind as BlockKind)) return null
  if (v.text.trim() === '' || v.text.length > MAX_TEXT) return null
  const entities = ranges(v.entities, v.text.length)
  const emphasis = ranges(v.emphasis, v.text.length)
  if (!entities || !emphasis) return null
  const out: GuideBlock = { id: v.id, kind: v.kind as BlockKind, text: v.text }
  if (v.stageId !== undefined) {
    if (!str(v.stageId) || !stageIds.has(v.stageId)) return null
    out.stageId = v.stageId
  }
  if (v.entities !== undefined) out.entities = entities
  if (v.emphasis !== undefined) out.emphasis = emphasis
  return out
}

export function parseGuideDocument(value: unknown): GuideDocument | null {
  if (!isRecord(value)) return null
  if (value.version !== 1 || value.game !== 'poe2' || value.targetLocale !== 'zh-CN') return null
  const src = source(value.source)
  const stg = stages(value.stages)
  if (!src || !stg || !Array.isArray(value.blocks) || value.blocks.length > MAX_BLOCKS) return null
  const stageIds = new Set(stg.map((s) => s.id))
  const seen = new Set<string>()
  const blocks: GuideBlock[] = []
  for (const raw of value.blocks) {
    const b = block(raw, stageIds)
    if (!b || seen.has(b.id)) return null
    seen.add(b.id)
    blocks.push(b)
  }
  return { version: 1, game: 'poe2', targetLocale: 'zh-CN', source: src, stages: stg, blocks }
}

export function parseExtractResult(value: unknown): ExtractResult | null {
  if (!isRecord(value)) return null
  if (value.ok === true) {
    const doc = parseGuideDocument(value.doc)
    return doc ? { ok: true, doc } : null
  }
  if (
    value.ok === false &&
    (value.reason === 'coe' || value.reason === 'poe1' || value.reason === 'empty')
  ) {
    return { ok: false, reason: value.reason }
  }
  return null
}
