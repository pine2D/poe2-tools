// 把「原文文本 + 译文文本 + 该字段的行报告」对齐成逐行的行模型。
// 三条不能想当然的规则（依据见计划正文「关键领域知识」）：
//  1. LineReport.line 不是唯一键，一行被标记切成多段会有多条报告，必须按行聚合；
//  2. 双语模式下某源行的译文行数 = 1 + 该行 status==='translated' 的报告条数，
//     用这个公式走游标就能精确归属，不需要猜；
//  3. 传奇名注入会在译文最前面凭空多一行，必须先识别出来再开始对齐。
import { type FieldReport, type LineReport, parseLine } from '@poe2-tools/build-core'
import { type MarkupSpan, sliceSpans, spanText, splitMarkupLines } from './markup'

export type RowStatus = 'translated' | 'untranslated' | 'kept'

export interface PairRow {
  /** 字段内行号，从 0 数；DOM id 与跳转都用它 */
  index: number
  /** 编号行的标号（"3"），非编号行为 null */
  marker: string | null
  kind: 'mod' | 'name' | null
  status: RowStatus
  /** 首行的名称行 = 基底名 / 传奇名，跨列渲染并压一条淡出线 */
  base: boolean
  /** 原文正文（已去掉标号与行首空白） */
  en: MarkupSpan[]
  /** 译文正文；没有对应译文行时为 null */
  zh: MarkupSpan[] | null
  /** 双语模式下挂在本行后面的保留英文原行 */
  kept: MarkupSpan[][]
}

export interface FieldRows {
  /** 传奇名注入行；没有就是 null */
  injected: MarkupSpan[] | null
  rows: PairRow[]
}

export interface RowsInput {
  original: string | null | undefined
  translated: string | null | undefined
  field: FieldReport | undefined
  bilingual: boolean
  /** 传奇名的中文译名；没有就是 null */
  uniqueText: string | null
}

// 一行的状态：有未命中就是未命中；否则有命中就是命中；否则原样
function statusOf(reports: readonly LineReport[]): RowStatus {
  if (reports.some((report) => report.status === 'untranslated')) return 'untranslated'
  if (reports.some((report) => report.status === 'translated')) return 'translated'
  return 'kept'
}

// 去掉行首的标号与空白，返回「标号数字」与「正文段」
function splitMarker(spans: readonly MarkupSpan[]): { marker: string | null; body: MarkupSpan[] } {
  const parts = parseLine(spanText(spans))
  const body = sliceSpans(spans, parts.marker.length)
  if (!parts.numbered) return { marker: null, body }
  return { marker: parts.marker.trim().replace(/\.$/, ''), body }
}

export function buildRows(input: RowsInput): FieldRows {
  const { original, translated, field, bilingual, uniqueText } = input
  const left = splitMarkupLines(original ?? '')
  const right = splitMarkupLines(translated ?? '')

  // 传奇名注入行：译文第一行是 <unique>{译名} 而原文第一行不是（注入是幂等的，
  // 原文已经带这一行时它就是普通的第 0 行，不能当成注入）
  const isUniqueLine = (line: MarkupSpan[] | undefined): boolean =>
    uniqueText !== null &&
    line !== undefined &&
    line.length === 1 &&
    line[0]?.text === uniqueText &&
    line[0]?.tags.at(-1) === 'unique'
  const hasInjected = isUniqueLine(right[0]) && !isUniqueLine(left[0])
  const injected = hasInjected ? (right[0] ?? null) : null

  const byLine = new Map<number, LineReport[]>()
  for (const line of field?.lines ?? []) {
    const bucket = byLine.get(line.line)
    if (bucket === undefined) byLine.set(line.line, [line])
    else bucket.push(line)
  }

  let cursor = hasInjected ? 1 : 0
  const rows: PairRow[] = []
  for (const [index, spans] of left.entries()) {
    const reports = byLine.get(index) ?? []
    const status = statusOf(reports)
    const span = 1 + (bilingual ? reports.filter((r) => r.status === 'translated').length : 0)
    const slice = right.slice(cursor, cursor + span)
    cursor += span
    const { marker, body } = splitMarker(spans)
    const zhLine = slice[0]
    const kind = reports[0]?.kind ?? null
    rows.push({
      index,
      marker,
      kind,
      status,
      base: index === 0 && kind === 'name',
      en: body,
      zh: zhLine === undefined ? null : splitMarker(zhLine).body,
      kept: slice.slice(1).map((line) => splitMarker(line).body),
    })
  }

  // 纯空行（源文件里用来分段的）不渲染成一行，但行号保持不变，跳转仍然对得上
  return {
    injected,
    rows: rows.filter(
      (row) =>
        spanText(row.en) !== '' ||
        (row.zh !== null && spanText(row.zh) !== '') ||
        row.kept.length > 0,
    ),
  }
}
