// 侧栏文件列表（spec §5.12 文件项）：构筑名为主、文件名为辅；当前项由选择按钮上的 aria-current 表达（R6）。
// 状态：有待核对项时“⚠ 待核对 n”（n 与信息行同一口径，含名称类，B1），否则“✓ 词缀 x/y”；
// “待词典就绪”“解析失败”沿用改版前。
import { Icon } from '../../../shared/components/Icon'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'

export interface FileListProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  /** 已解析文件的待核对条数（collectMisses 的条数，含基底名、传奇名未收录），键为文件 id */
  misses: ReadonlyMap<string, number>
  selectedId: string | null
  onSelect(id: string): void
  onRemove(id: string): void
}

function FileStatus({ result, misses }: { result: TranslateResult | undefined; misses: number }) {
  if (result === undefined) {
    return (
      <span className="app__file-note">
        <Icon name="refresh" size={15} />
        待词典就绪
      </span>
    )
  }
  if (!result.ok) {
    return (
      <span className="app__file-note">
        <Icon name="warning" size={15} />
        解析失败
      </span>
    )
  }
  if (misses > 0) {
    return (
      <span className="pt-file__warn">
        <Icon name="warning" size={15} />
        {`待核对 ${misses}`}
      </span>
    )
  }
  const { modTranslated, modCandidates } = result.file.report
  return (
    <span className="pt-file__ok">
      <Icon name="check" size={15} />
      {`词缀 ${modTranslated}/${modCandidates}`}
    </span>
  )
}

export function FileList({
  sources,
  results,
  misses,
  selectedId,
  onSelect,
  onRemove,
}: FileListProps) {
  if (sources.length === 0) return null
  return (
    <ul className="app__files" aria-label="已导入文件">
      {sources.map((source, index) => {
        const result = results.find((item) => item.id === source.id)
        const duplicate = sources.filter((item) => item.name === source.name).length > 1
        const label = duplicate ? `${source.name}（第 ${index + 1} 份）` : source.name
        const title = result?.ok ? result.file.input.name : source.name
        return (
          <li key={source.id} className="pt-file">
            <button
              type="button"
              className="pt-file__pick"
              title={`${title} · ${label}`}
              aria-label={label}
              aria-current={source.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(source.id)}
            >
              <span className="pt-file__name">{title}</span>
              <span className="pt-file__orig">{label}</span>
            </button>
            <span className="pt-file__status">
              <FileStatus result={result} misses={misses.get(source.id) ?? 0} />
            </span>
            <button
              type="button"
              className="pt-file__remove"
              aria-label={`移除 ${label}`}
              onClick={() => onRemove(source.id)}
            >
              <Icon name="close" size={14} />
            </button>
            {result !== undefined && !result.ok && (
              <p className="app__file-error">{result.error}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
