import {
  type GuideBlock,
  type GuideDocument,
  type Issue,
  parseExtractResult,
  type Range,
} from '@poe2-tools/guide-core'

export const MAX_SELECTION_CHARS = 6000
export const SELECTION_PORT = 'poe2-selection'
export const REQUEST_TIMEOUT_MS = 90000
export interface SelectionRequest {
  type: 'translate'
  id: string
  block: GuideBlock
}
export type SelectionResult =
  | {
      ok: true
      text: string
      origin: 'engine' | 'cache' | 'dictionary' | 'preserved'
      issues: readonly Issue[]
      usage: string
      message?: string
    }
  | { ok: false; message: string }

export function selectionDocument(block: GuideBlock): GuideDocument {
  return {
    version: 1,
    game: 'poe2',
    targetLocale: 'zh-CN',
    source: {
      url: 'https://selection.invalid/',
      title: '选中文字',
      siteId: 'generic',
      extractedAt: '',
      scope: 'selection',
    },
    stages: [],
    blocks: [block],
  }
}

/** 合并范围时只保留用户实际选择的文字及保护位置，不附加祖先或邻段语境。 */
export function combineSelection(blocks: readonly GuideBlock[]): GuideBlock | null {
  if (!blocks.length || blocks.length > 100 || blocks.some((b) => b.truncated)) return null
  let text = ''
  const entities: Range[] = [],
    emphasis: Range[] = [],
    verbatim: Range[] = []
  const breaks: number[] = []
  for (const b of blocks) {
    if (text) text += '\n\n'
    const offset = text.length
    text += b.text
    for (const [target, source] of [
      [entities, b.entities],
      [emphasis, b.emphasis],
      [verbatim, b.kind === 'verbatim' ? [[0, b.text.length]] : b.verbatim],
    ] as const)
      for (const [a, z] of source ?? []) target.push([a + offset, z + offset])
    for (const n of b.breaks ?? []) breaks.push(n + offset)
  }
  if (!text.trim() || text.length > MAX_SELECTION_CHARS) return null
  return {
    id: 'b0',
    kind: blocks.length === 1 ? (blocks[0]?.kind ?? 'paragraph') : 'paragraph',
    text,
    ...(entities.length ? { entities } : {}),
    ...(emphasis.length ? { emphasis } : {}),
    ...(verbatim.length ? { verbatim } : {}),
    ...(breaks.length ? { breaks } : {}),
  }
}

export function parseSelectionRequest(raw: unknown): SelectionRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  if (
    Object.keys(v).some((k) => !['type', 'id', 'block'].includes(k)) ||
    v.type !== 'translate' ||
    typeof v.id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(v.id)
  )
    return null
  if (!v.block || typeof v.block !== 'object') return null
  const b = v.block as Record<string, unknown>
  if (
    Object.keys(b).some(
      (k) => !['id', 'kind', 'text', 'entities', 'emphasis', 'verbatim', 'breaks'].includes(k),
    ) ||
    b.id !== 'b0' ||
    typeof b.text !== 'string' ||
    b.text.length > MAX_SELECTION_CHARS
  )
    return null
  for (const key of ['entities', 'emphasis', 'verbatim', 'breaks'])
    if (b[key] !== undefined && (!Array.isArray(b[key]) || b[key].length > 1000)) return null
  const parsed = parseExtractResult({
    ok: true,
    doc: selectionDocument(b as unknown as GuideBlock),
  })
  const block = parsed?.ok ? parsed.doc.blocks[0] : null
  return block ? { type: 'translate', id: v.id, block } : null
}
