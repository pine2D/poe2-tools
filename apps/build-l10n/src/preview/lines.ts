// 预览用的小工具：按路径找字段报告、未命中行号集合、分行、从原始数组里取 additional_text
import type { FieldReport, TranslateReport } from '@poe2-tools/build-core'

export function fieldReport(report: TranslateReport, path: string): FieldReport | undefined {
  return report.fields.find((field) => field.path === path)
}

// 未命中的编号行行号（同一行可能因标记切段出现多条报告，用 Set 去重）
export function missedLines(field: FieldReport | undefined): Set<number> {
  const missed = new Set<number>()
  for (const line of field?.lines ?? []) {
    if (line.kind === 'mod' && line.status === 'untranslated') missed.add(line.line)
  }
  return missed
}

export function splitLines(text: string | null | undefined): string[] {
  return typeof text === 'string' && text !== '' ? text.split('\n') : []
}

// parseBuildFile 是宽松的：数组元素可能是字符串或畸形值，只在是对象且字段为字符串时取值
export function additionalTextAt(list: unknown, i: number): string | null {
  if (!Array.isArray(list)) return null
  const entry: unknown = list[i]
  if (entry === null || typeof entry !== 'object') return null
  const text = (entry as { additional_text?: unknown }).additional_text
  return typeof text === 'string' ? text : null
}
