import type { Matcher } from './matcher'
import { findModifiers } from './modifiers'
import type { AbbrSpan, BlockKind, GuideBlock, ModifierSpan, Range, TermSpan } from './types'
import { findVerbatim, protect } from './verbatim'

export interface PreparedBlock {
  id: string
  kind: BlockKind
  stageId?: string
  source: string
  protectedText: string
  tokens: string[]
  terms: TermSpan[]
  modifiers: ModifierSpan[]
  abbreviations: AbbrSpan[]
}

const overlaps = (ranges: readonly Range[], start: number, end: number) =>
  ranges.some(([a, b]) => start < b && a < end)

// 数值连同符号、范围与缩写一起保护；字母数字名称（T15、PoE2、3rd）不拆开。
const SIGN = String.raw`(?:[+−±-][ \t]*)?`
const VALUE = String.raw`${SIGN}(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)[kKmMbB]?(?:[ \t]*%)?`
const RANGE = String.raw`${VALUE}(?:[ \t]*[–-][ \t]*${VALUE})?`
const NUMBER = new RegExp(
  String.raw`(?<![A-Za-z0-9_.])(?<!\d,)(?:${SIGN}\(${RANGE}\)(?:[ \t]*%)?|${RANGE})\+?(?![A-Za-z0-9_]|[.,]\d)`,
  'g',
)

export function prepareBlock(block: GuideBlock, matcher: Matcher): PreparedBlock {
  const verbatim = findVerbatim(block.text)
  const ctx = { entities: block.entities ?? [], emphasis: block.emphasis ?? [] }
  const keep = <T extends { start: number; end: number }>(spans: T[]) =>
    spans.filter((s) => !overlaps(verbatim, s.start, s.end))
  const terms = keep(matcher.find(block.text, ctx))
  // 已确认或待选的完整词条仍由术语表翻译；不能把其中数字换掉而破坏名称匹配。
  const named: Range[] = terms.filter((t) => t.status !== 'hint').map((t) => [t.start, t.end])
  const numbers: Range[] = []
  for (const match of block.text.matchAll(NUMBER)) {
    const start = match.index
    const end = start + match[0].length
    if (!overlaps(verbatim, start, end) && !overlaps(named, start, end)) numbers.push([start, end])
  }
  const ranges = [...verbatim, ...numbers].sort((a, b) => a[0] - b[0])
  const { text, tokens } = protect(block.text, ranges)
  const out: PreparedBlock = {
    id: block.id,
    kind: block.kind,
    source: block.text,
    protectedText: text,
    tokens,
    terms,
    modifiers: keep(findModifiers(block.text)),
    abbreviations: keep(matcher.abbreviations(block.text)),
  }
  if (block.stageId !== undefined) out.stageId = block.stageId
  return out
}

export const sendable = (b: PreparedBlock) => b.kind !== 'modline' && b.kind !== 'verbatim'

export interface ChunkLimits {
  maxBlocks: number
  maxChars: number
}

export const DEFAULT_LIMITS: ChunkLimits = { maxBlocks: 10, maxChars: 3000 }

export function chunkBlocks(
  blocks: readonly PreparedBlock[],
  limits: ChunkLimits = DEFAULT_LIMITS,
): PreparedBlock[][] {
  const chunks: PreparedBlock[][] = []
  let current: PreparedBlock[] = []
  let chars = 0
  for (const b of blocks) {
    const size = b.protectedText.length
    if (current.length && (current.length >= limits.maxBlocks || chars + size > limits.maxChars)) {
      chunks.push(current)
      current = []
      chars = 0
    }
    current.push(b)
    chars += size
  }
  if (current.length) chunks.push(current)
  return chunks
}
