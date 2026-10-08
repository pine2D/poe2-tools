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

export function prepareBlock(block: GuideBlock, matcher: Matcher): PreparedBlock {
  const verbatim = findVerbatim(block.text)
  const ctx = { entities: block.entities ?? [], emphasis: block.emphasis ?? [] }
  const keep = <T extends { start: number; end: number }>(spans: T[]) =>
    spans.filter((s) => !overlaps(verbatim, s.start, s.end))
  const { text, tokens } = protect(block.text, verbatim)
  const out: PreparedBlock = {
    id: block.id,
    kind: block.kind,
    source: block.text,
    protectedText: text,
    tokens,
    terms: keep(matcher.find(block.text, ctx)),
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
