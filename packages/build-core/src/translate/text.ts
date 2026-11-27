import type { DictIndex } from '../dict/index'
import { type MarkupNode, renderMarkup, tokenizeMarkup } from '../markup/tokenize'
import { formatLine, type ParsedLine, parseLine } from '../text/lines'
import { translateModLine, translateNameLine } from './lines'

export type LineStatus = 'translated' | 'untranslated' | 'kept'

export interface LineReport {
  // 输入行号。一行被标记语法切成多段时，多条报告会共享同一个 line，不是唯一键。
  line: number
  kind: 'mod' | 'name' | 'heading'
  status: LineStatus
  original: string
  translated: string | null
  statId: string | null
}

export interface TextOptions {
  bilingual: boolean
  equipmentNote?: boolean
}

export interface TextTranslation {
  text: string
  lines: LineReport[]
}

interface SourceLine {
  text: string
  parts: ParsedLine
  rangeOrCharmSlots: boolean
}

interface Cursor {
  line: number
  sourceLines: readonly SourceLine[]
}

// 标记可以跨行，也可以只包住一句话中的几个词。按可见整行核对格式，仍在原文本节点内写回。
function visibleText(nodes: readonly MarkupNode[]): string {
  return nodes
    .map((node) => (node.kind === 'text' ? node.value : visibleText(node.children)))
    .join('')
}

function hasStatList(lines: readonly SourceLine[], heading: number, index: DictIndex): boolean {
  if (!/^-{3,}$/.test(lines[heading + 1]?.text ?? '')) return false
  // 未收录的词缀也可能排在第一行，但整个编号清单至少要有一条能核实的词缀。
  for (let i = heading + 2; i < lines.length; i++) {
    const parts = lines[i]?.parts
    if (!parts?.numbered) break
    if (translateModLine(parts.body, index) !== null) return true
  }
  return false
}

const STAT_PRIORITY = { 'zh-CN': '词缀优先级', 'zh-TW': '詞綴優先順序' }

export function translateText(
  text: string,
  index: DictIndex,
  options: TextOptions,
): TextTranslation {
  const lines: LineReport[] = []
  const nodes = tokenizeMarkup(text)
  const sourceLines = visibleText(nodes)
    .split('\n')
    .map((line) => ({
      text: line.trim(),
      parts: parseLine(line),
      rangeOrCharmSlots: /\(\s*[+-]?\d|\bcharm\s+slots\b/i.test(line),
    }))
  const cursor: Cursor = { line: 0, sourceLines }
  const translated = translateNodes(nodes, index, options, lines, cursor)
  return { text: renderMarkup(translated), lines }
}

function translateNodes(
  nodes: readonly MarkupNode[],
  index: DictIndex,
  options: TextOptions,
  report: LineReport[],
  cursor: Cursor,
): MarkupNode[] {
  const out: MarkupNode[] = []
  for (const node of nodes) {
    if (node.kind === 'tag') {
      out.push({
        kind: 'tag',
        tag: node.tag,
        children: translateNodes(node.children, index, options, report, cursor),
      })
      continue
    }
    const segments = node.value.split('\n')
    const translatedSegments: string[] = []
    for (const [i, segment] of segments.entries()) {
      // 文本节点的首段延续当前行；之后每个换行进入下一行
      if (i > 0) cursor.line += 1
      // 上一段取自输入（同一文本节点内），首段为 undefined；用于识别"已是双语对"
      const previousSegment = i > 0 ? segments[i - 1] : undefined
      translatedSegments.push(
        translateLine(segment, cursor, index, options, report, previousSegment),
      )
    }
    out.push({ kind: 'text', value: translatedSegments.join('\n') })
  }
  return out
}

function translateLine(
  line: string,
  cursor: Cursor,
  index: DictIndex,
  options: TextOptions,
  report: LineReport[],
  previousSegment: string | undefined,
): string {
  const { line: lineNo, sourceLines } = cursor
  const parts = parseLine(line)
  if (parts.body === '') return line
  const source = sourceLines[lineNo]
  const wholeLine = line.trim() === source?.text
  // 行内标记可能隔开限定词或范围，须用完整编号行核对这种写法。
  const splitStat =
    !wholeLine && source?.rangeOrCharmSlots && (parts.numbered || source.parts.numbered)
  let kind: LineReport['kind'] = parts.numbered ? 'mod' : 'name'
  let translated: string | null = null
  let statId: string | null = null
  if (parts.numbered) {
    const hit = splitStat ? null : translateModLine(parts.body, index)
    if (hit !== null) {
      translated = hit.text
      statId = hit.statId
    }
  } else if (!splitStat) {
    if (
      options.equipmentNote &&
      wholeLine &&
      parts.body === 'Stat Priority' &&
      hasStatList(sourceLines, lineNo, index)
    ) {
      kind = 'heading'
      translated = STAT_PRIORITY[index.locale]
    } else {
      translated = translateNameLine(parts.body, index)
    }
    // 双语原文紧跟自己的译文时不重复添加，即使标题与分隔线各自带标记。
    const previous = kind === 'heading' ? sourceLines[lineNo - 1]?.text : previousSegment
    if (options.bilingual && previous?.trim() === translated) translated = null
  }
  report.push({
    line: lineNo,
    kind,
    status: translated !== null ? 'translated' : parts.numbered ? 'untranslated' : 'kept',
    original: parts.body,
    translated,
    statId,
  })
  if (translated === null) return line
  const output = formatLine({ marker: parts.marker, body: translated, trailing: parts.trailing })
  if (!options.bilingual) return output
  const indent = parts.numbered ? ' '.repeat(parts.marker.length) : parts.marker
  return `${output}\n${indent}${parts.body}${parts.trailing}`
}
