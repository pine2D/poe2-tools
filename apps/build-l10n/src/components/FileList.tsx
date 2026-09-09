import type { SourceFile } from '../translate/runTranslation'
import { formatRate, type TranslateResult } from '../translate/runTranslation'

export interface FileListProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  selectedId: string | null
  onSelect(id: string): void
  onRemove(id: string): void
  onDownload(id: string): void
}

// 词典未就绪（切 locale 或首次加载）时 results 可能暂时为空，这里仍按 sources 渲染
// 每一行，未匹配到结果的行显示"待词典就绪"并禁用下载，避免整份列表闪没
function rateText(result: TranslateResult | undefined): string {
  if (result === undefined) return '待词典就绪'
  return result.ok ? formatRate(result.file.rate) : '解析失败'
}

export function FileList({
  sources,
  results,
  selectedId,
  onSelect,
  onRemove,
  onDownload,
}: FileListProps) {
  if (sources.length === 0) return <p className="filelist__empty">还没有文件</p>
  return (
    <ul className="filelist">
      {sources.map((source) => {
        const result = results.find((item) => item.id === source.id)
        return (
          <li
            key={source.id}
            className={
              source.id === selectedId ? 'filelist__item filelist__item--active' : 'filelist__item'
            }
          >
            <button
              type="button"
              className="filelist__name"
              aria-current={source.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(source.id)}
            >
              {source.name}
            </button>
            <span className="filelist__rate">{rateText(result)}</span>
            <button
              type="button"
              aria-label={`下载 ${source.name}`}
              disabled={result === undefined || !result.ok}
              onClick={() => onDownload(source.id)}
            >
              下载
            </button>
            <button
              type="button"
              aria-label={`移除 ${source.name}`}
              onClick={() => onRemove(source.id)}
            >
              移除
            </button>
            {result !== undefined && !result.ok && (
              <p className="filelist__error">{result.error}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
