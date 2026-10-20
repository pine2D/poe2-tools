import type { Matcher } from './matcher'
import { findModifiers } from './modifiers'
import type { BlockRoute } from './route'
import { normalizeName } from './text'
import type { AbbrSpan, BlockKind, GuideBlock, ModifierSpan, Range, TermSpan } from './types'
import { findVerbatim, mergeRanges, protect } from './verbatim'

export interface PreparedBlock {
  id: string
  kind: BlockKind
  stageId?: string
  source: string
  protectedText: string
  tokens: string[]
  protectedRanges: Range[]
  terms: TermSpan[]
  modifiers: ModifierSpan[]
  abbreviations: AbbrSpan[]
  route?: BlockRoute
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
  const ctx = { entities: block.entities ?? [], emphasis: block.emphasis ?? [] }
  const found = matcher.find(block.text, ctx)
  // 只采信取文器明确标记的实体。完整名称有译名才交给术语表，部分命中不能拆译未知专名。
  const unknown = ctx.entities.filter(([a, b]) => {
    const name = block.text.slice(a, b)
    // 单独查实体，防止正文中的更长命中跨过实体边界而遮住已知名称。
    return !matcher
      .find(name, { entities: [[0, name.length]] })
      .some(
        (t) =>
          t.status !== 'hint' &&
          t.start === 0 &&
          (t.end === name.length || /^'(?:s)?$/.test(normalizeName(name.slice(t.end)))),
      )
  })
  const verbatim = mergeRanges([...findVerbatim(block.text), ...unknown, ...(block.verbatim ?? [])])
  const keep = <T extends { start: number; end: number }>(spans: T[]) =>
    spans.filter((s) => !overlaps(verbatim, s.start, s.end))
  const terms = keep(found)
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
    protectedRanges: ranges,
    terms,
    modifiers: keep(findModifiers(block.text)),
    abbreviations: keep(matcher.abbreviations(block.text)),
  }
  if (block.stageId !== undefined) out.stageId = block.stageId
  return out
}

export const sendable = (b: PreparedBlock) =>
  b.route ? b.route.kind === 'narrative' : b.kind !== 'modline' && b.kind !== 'verbatim'

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
