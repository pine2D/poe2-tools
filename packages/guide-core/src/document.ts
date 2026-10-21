import type {
  BlockContextRef,
  BlockKind,
  ExtractionDiagnostic,
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
  if (scope !== 'full' && scope !== 'selection' && scope !== 'region') return null
  const out: GuideSource = { url, title, siteId: siteId as SiteId, extractedAt, scope }
  if (v.fallback === true) out.fallback = true
  if (v.snapshotId !== undefined) {
    if (!str(v.snapshotId) || !/^[a-zA-Z0-9-]{1,100}$/.test(v.snapshotId)) return null
    out.snapshotId = v.snapshotId
  }
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

function context(value: unknown): BlockContextRef | null {
  if (!isRecord(value)) return null
  const out: BlockContextRef = {}
  for (const key of ['listId', 'tableId', 'rowId'] as const) {
    if (value[key] !== undefined) {
      if (!str(value[key]) || value[key].length > 100) return null
      out[key] = value[key]
    }
  }
  if (value.headingIds !== undefined) {
    if (
      !Array.isArray(value.headingIds) ||
      value.headingIds.length > 6 ||
      !value.headingIds.every(str)
    )
      return null
    out.headingIds = value.headingIds
  }
  if (value.headingLevel !== undefined) {
    if (
      !Number.isInteger(value.headingLevel) ||
      Number(value.headingLevel) < 1 ||
      Number(value.headingLevel) > 6
    )
      return null
    out.headingLevel = value.headingLevel as number
  }
  if (value.column !== undefined) {
    if (!Number.isInteger(value.column) || Number(value.column) < 0 || Number(value.column) > 5000)
      return null
    out.column = value.column as number
  }
  if (value.header !== undefined) {
    if (typeof value.header !== 'boolean') return null
    out.header = value.header
  }
  return out
}

function block(v: unknown, stageIds: ReadonlySet<string>): GuideBlock | null {
  if (!isRecord(v) || !str(v.id) || !str(v.text)) return null
  if (!BLOCK_KINDS.includes(v.kind as BlockKind)) return null
  if (v.text.trim() === '' || v.text.length > MAX_TEXT) return null
  const entities = ranges(v.entities, v.text.length)
  const emphasis = ranges(v.emphasis, v.text.length)
  const verbatim = ranges(v.verbatim, v.text.length)
  if (!entities || !emphasis || !verbatim) return null
  const out: GuideBlock = { id: v.id, kind: v.kind as BlockKind, text: v.text }
  if (v.stageId !== undefined) {
    if (!str(v.stageId) || !stageIds.has(v.stageId)) return null
    out.stageId = v.stageId
  }
  if (v.entities !== undefined) out.entities = entities
  if (v.emphasis !== undefined) out.emphasis = emphasis
  if (v.verbatim !== undefined) out.verbatim = verbatim
  if (v.breaks !== undefined) {
    if (
      !Array.isArray(v.breaks) ||
      !v.breaks.every(
        (n, i, ns) =>
          Number.isInteger(n) && n > 0 && n < out.text.length && (i === 0 || n > ns[i - 1]),
      )
    )
      return null
    out.breaks = v.breaks
  }
  if (v.context !== undefined) {
    const ctx = context(v.context)
    if (!ctx) return null
    out.context = ctx
  }
  if (v.truncated !== undefined) {
    if (v.truncated !== true) return null
    out.truncated = true
  }
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
  const headings = new Set(blocks.filter((b) => b.kind === 'heading').map((b) => b.id))
  if (blocks.some((b) => b.context?.headingIds?.some((id) => !headings.has(id) || id === b.id)))
    return null
  const diagnostics: ExtractionDiagnostic[] = []
  if (value.diagnostics !== undefined) {
    if (!Array.isArray(value.diagnostics) || value.diagnostics.length > MAX_BLOCKS + 1) return null
    for (const d of value.diagnostics) {
      if (!isRecord(d)) return null
      if (d.kind === 'block-limit') diagnostics.push({ kind: 'block-limit' })
      else if (
        d.kind === 'text-truncated' &&
        str(d.blockId) &&
        blocks.some((b) => b.id === d.blockId && b.truncated)
      )
        diagnostics.push({ kind: 'text-truncated', blockId: d.blockId })
      else return null
    }
  }
  return {
    version: 1,
    game: 'poe2',
    targetLocale: 'zh-CN',
    source: src,
    stages: stg,
    blocks,
    ...(value.diagnostics !== undefined ? { diagnostics } : {}),
  }
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
