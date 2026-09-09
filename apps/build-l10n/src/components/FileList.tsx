import { formatRate, type TranslateResult } from '../translate/runTranslation'

export interface FileListProps {
  results: readonly TranslateResult[]
  selectedId: string | null
  onSelect(id: string): void
  onRemove(id: string): void
  onDownload(id: string): void
}

export function FileList({ results, selectedId, onSelect, onRemove, onDownload }: FileListProps) {
  if (results.length === 0) return <p className="filelist__empty">还没有文件</p>
  return (
    <ul className="filelist">
      {results.map((result) => (
        <li
          key={result.id}
          className={
            result.id === selectedId ? 'filelist__item filelist__item--active' : 'filelist__item'
          }
        >
          <button
            type="button"
            className="filelist__name"
            aria-current={result.id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(result.id)}
          >
            {result.name}
          </button>
          <span className="filelist__rate">
            {result.ok ? formatRate(result.file.rate) : '解析失败'}
          </span>
          <button
            type="button"
            aria-label={`下载 ${result.name}`}
            disabled={!result.ok}
            onClick={() => onDownload(result.id)}
          >
            下载
          </button>
          <button
            type="button"
            aria-label={`移除 ${result.name}`}
            onClick={() => onRemove(result.id)}
          >
            移除
          </button>
          {!result.ok && <p className="filelist__error">{result.error}</p>}
        </li>
      ))}
    </ul>
  )
}
