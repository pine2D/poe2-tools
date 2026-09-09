// 单个文件的翻译流程：解析 → translateBuild → 预览模型 → 序列化（缩进跟随输入）。
// 应用层不碰 BuildFile 内容，全部交给 build-core。
import {
  type BuildFile,
  describeBuild,
  type PreviewModel,
  parseBuildFile,
  serializeBuildFile,
  type TranslateReport,
  translateBuild,
} from '@poe2-tools/build-core'
import type { LoadedDict } from '../dict/loadDict'

export interface TranslateOptions {
  bilingual: boolean
  annotateUniques: boolean
}

export interface SourceFile {
  id: string
  name: string
  text: string
}

// 同一 path + line 可能出现多条（一行被标记语法切成多段），消费方不得当唯一键
export interface UnmatchedLine {
  path: string
  line: number
  text: string
}

export interface TranslatedFile {
  id: string
  name: string
  input: BuildFile
  build: BuildFile
  output: string
  report: TranslateReport
  preview: PreviewModel
  unmatched: UnmatchedLine[]
  // modTranslated / modCandidates；没有编号行时为 null
  rate: number | null
}

export type TranslateResult =
  | { ok: true; id: string; name: string; file: TranslatedFile }
  | { ok: false; id: string; name: string; error: string }

// 输入是压缩单行（Mobalytics 导出即如此）就输出单行，否则缩进 2 空格
export function detectIndent(text: string): 0 | 2 {
  return text.includes('\n') ? 2 : 0
}

export function translateSource(
  source: SourceFile,
  dict: LoadedDict,
  options: TranslateOptions,
): TranslateResult {
  const parsed = parseBuildFile(source.text)
  if (!parsed.ok) return { ok: false, id: source.id, name: source.name, error: parsed.error }
  const { build, report } = translateBuild(parsed.build, dict.index, options)
  const unmatched: UnmatchedLine[] = []
  for (const field of report.fields) {
    for (const line of field.lines) {
      if (line.kind === 'mod' && line.status === 'untranslated')
        unmatched.push({ path: field.path, line: line.line, text: line.original })
    }
  }
  return {
    ok: true,
    id: source.id,
    name: source.name,
    file: {
      id: source.id,
      name: source.name,
      input: parsed.build,
      build,
      output: serializeBuildFile(build, { indent: detectIndent(source.text) }),
      report,
      preview: describeBuild(build, dict.index),
      unmatched,
      rate: report.modCandidates === 0 ? null : report.modTranslated / report.modCandidates,
    },
  }
}

export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}
