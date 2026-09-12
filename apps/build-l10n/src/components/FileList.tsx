import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import { Icon } from './Icon'

export interface FileListProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  selectedId: string | null
  onSelect(id: string): void
  onRemove(id: string): void
}

export function FileList({ sources, results, selectedId, onSelect, onRemove }: FileListProps) {
  if (sources.length === 0) return null
  return (
    <ul className="filelist" aria-label="已导入文件">
      {sources.map((source, index) => {
        const result = results.find((item) => item.id === source.id)
        const duplicate = sources.filter((item) => item.name === source.name).length > 1
        const label = duplicate ? `${source.name}（第 ${index + 1} 份）` : source.name
        const title = result?.ok ? result.file.input.name : source.name
        const status =
          result === undefined
            ? '待词典就绪'
            : !result.ok
              ? '解析失败'
              : `词缀 ${result.file.report.modTranslated}/${result.file.report.modCandidates}`
        return (
          <li
            key={source.id}
            className={
              source.id === selectedId ? 'filelist__item filelist__item--active' : 'filelist__item'
            }
          >
            <div className="filelist__top">
              <button
                type="button"
                className="filelist__name"
                title={`${title} · ${label}`}
                aria-label={label}
                aria-current={source.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(source.id)}
              >
                <strong>{title}</strong>
                <small>{label}</small>
              </button>
              <button
                type="button"
                className="filelist__remove"
                aria-label={`移除 ${label}`}
                onClick={() => onRemove(source.id)}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="filelist__ops">
              <Icon
                name={result === undefined ? 'refresh' : result.ok ? 'check' : 'warning'}
                size={13}
              />
              <span className="filelist__rate">{status}</span>
            </div>
            {result !== undefined && !result.ok && (
              <p className="filelist__error">{result.error}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
