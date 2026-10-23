// 左列“构筑 → 阶段”分组（B4-15）：组序与组内顺序直接取看板的 seriesList（含手动调序），不另造归组规则；
// 解析失败的文件不进任何构筑，按导入顺序排在最后一组。词典未就绪时还没有翻译结果，无从归组，返回 null 保持平铺。
import { type Series, seriesLabel } from '../stages/stages'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'

export interface FileGroupItem {
  source: SourceFile
  /** 看板列头的阶段名；失败文件为 null */
  stage: string | null
}

export interface FileGroup {
  key: string
  kind: 'series' | 'failed'
  /** series：与看板一致的构筑名（用户文本）；failed：固定标签 */
  title: string
  items: FileGroupItem[]
}

export const FAILED_GROUP_KEY = 'failed'

export function fileGroups(
  sources: readonly SourceFile[],
  results: readonly TranslateResult[],
  seriesList: readonly Series[],
): FileGroup[] | null {
  if (sources.length === 0) return null
  const byId = new Map(results.map((result) => [result.id, result]))
  if (sources.some((source) => !byId.has(source.id))) return null
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const placed = new Set<string>()
  const groups: FileGroup[] = []
  for (const series of seriesList) {
    const items: FileGroupItem[] = []
    for (const stage of series.stages) {
      const source = sourceById.get(stage.file.id)
      if (source === undefined || placed.has(source.id)) continue
      placed.add(source.id)
      items.push({ source, stage: stage.label })
    }
    if (items.length > 0) {
      groups.push({ key: series.key, kind: 'series', title: seriesLabel(series), items })
    }
  }
  // 成功却不在任何构筑里的（groupSeries 覆盖全部成功结果，理论上没有）各自成组，保证每份都可见
  for (const source of sources) {
    const result = byId.get(source.id)
    if (placed.has(source.id) || result?.ok !== true) continue
    placed.add(source.id)
    groups.push({
      key: `file:${source.id}`,
      kind: 'series',
      title: source.name,
      items: [{ source, stage: null }],
    })
  }
  const failed = sources.filter((source) => !placed.has(source.id))
  if (failed.length > 0) {
    groups.push({
      key: FAILED_GROUP_KEY,
      kind: 'failed',
      title: '无法解析',
      items: failed.map((source) => ({ source, stage: null })),
    })
  }
  return groups
}

/** 左列的显示顺序（文件 id），移除后按它挑相邻文件 */
export function displayOrder(
  groups: readonly FileGroup[] | null,
  sources: readonly SourceFile[],
): string[] {
  return groups === null
    ? sources.map((source) => source.id)
    : groups.flatMap((group) => group.items.map((item) => item.source.id))
}
