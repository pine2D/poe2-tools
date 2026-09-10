// 预览用的小工具：按路径找字段报告、分行。
// 未命中行号的判定移交 preview/rows.ts，additional_text 的取值移交 preview/fields.ts。
import type { FieldReport, TranslateReport } from '@poe2-tools/build-core'

export function fieldReport(report: TranslateReport, path: string): FieldReport | undefined {
  return report.fields.find((field) => field.path === path)
}

export function splitLines(text: string | null | undefined): string[] {
  return typeof text === 'string' && text !== '' ? text.split('\n') : []
}
