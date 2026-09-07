import type { DictIndex } from '../dict/index'
import { type MarkupNode, renderMarkup, tokenizeMarkup } from '../markup/tokenize'
import { formatLine, parseLine } from '../text/lines'
import { translateModLine, translateNameLine } from './lines'

export type LineStatus = 'translated' | 'untranslated' | 'kept'

export interface LineReport {
  line: number
  kind: 'mod' | 'name'
  status: LineStatus
  original: string
  translated: string | null
  statId: string | null
}

export interface TextOptions {
  bilingual: boolean
}

export interface TextTranslation {
  text: string
  lines: LineReport[]
}

interface Cursor {
  line: number
}

export function translateText(
  text: string,
  index: DictIndex,
  options: TextOptions,
): TextTranslation {
  const lines: LineReport[] = []
  const cursor: Cursor = { line: 0 }
  const translated = translateNodes(tokenizeMarkup(text), index, options, lines, cursor)
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
      translatedSegments.push(translateLine(segment, cursor.line, index, options, report))
    }
    out.push({ kind: 'text', value: translatedSegments.join('\n') })
  }
  return out
}

function translateLine(
  line: string,
  lineNo: number,
  index: DictIndex,
  options: TextOptions,
  report: LineReport[],
): string {
  const parts = parseLine(line)
  if (parts.body === '') return line
  if (parts.numbered) {
    const hit = translateModLine(parts.body, index)
    if (hit === null) {
      report.push({
        line: lineNo,
        kind: 'mod',
        status: 'untranslated',
        original: parts.body,
        translated: null,
        statId: null,
      })
      return line
    }
    report.push({
      line: lineNo,
      kind: 'mod',
      status: 'translated',
      original: parts.body,
      translated: hit.text,
      statId: hit.statId,
    })
    const output = formatLine({
      marker: parts.marker,
      body: hit.text,
      trailing: parts.trailing,
    })
    return options.bilingual ? `${output}\n${' '.repeat(parts.marker.length)}${parts.body}` : output
  }
  const name = translateNameLine(parts.body, index)
  if (name === null) {
    report.push({
      line: lineNo,
      kind: 'name',
      status: 'kept',
      original: parts.body,
      translated: null,
      statId: null,
    })
    return line
  }
  report.push({
    line: lineNo,
    kind: 'name',
    status: 'translated',
    original: parts.body,
    translated: name,
    statId: null,
  })
  const output = formatLine({
    marker: parts.marker,
    body: name,
    trailing: parts.trailing,
  })
  return options.bilingual ? `${output}\n${parts.marker}${parts.body}` : output
}
