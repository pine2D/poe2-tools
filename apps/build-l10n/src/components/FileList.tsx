import type { SourceFile } from '../translate/runTranslation'
import { formatRate, type TranslateResult } from '../translate/runTranslation'
import { CoverageMeter, type MeterCell } from './CoverageMeter'
import { Icon, type IconName } from './Icon'

export interface FileListProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  selectedId: string | null
  /** 每份文件的编号行明细，画成次行的迷你装饰轨；解析失败或词典未就绪时给空数组 */
  meters: ReadonlyMap<string, readonly MeterCell[]>
  onSelect(id: string): void
  onRemove(id: string): void
  onDownload(id: string): void
}

// 词典未就绪（切 locale 或首次加载）时 results 可能暂时为空，这里仍按 sources 渲染
// 每一行，未匹配到结果的行显示"待词典就绪"并禁用下载，避免整份列表闪没
type RowKind = 'ok' | 'error' | 'pending'

function kindOf(result: TranslateResult | undefined): RowKind {
  if (result === undefined) return 'pending'
  return result.ok ? 'ok' : 'error'
}

const STATUS_ICON: Record<RowKind, IconName> = {
  ok: 'check',
  error: 'warning',
  pending: 'refresh',
}

const STATUS_TITLE: Record<RowKind, string> = {
  ok: '已翻译',
  error: '解析失败',
  pending: '等待词典',
}

function rateText(result: TranslateResult | undefined): string {
  if (result === undefined) return '待词典就绪'
  return result.ok ? formatRate(result.file.rate) : '解析失败'
}

export function FileList({
  sources,
  results,
  selectedId,
  meters,
  onSelect,
  onRemove,
  onDownload,
}: FileListProps) {
  // 空列表由 App 的空态引导区承担，这里不再自造第二句空文案
  if (sources.length === 0) return null
  return (
    <ul className="filelist" aria-label="已导入文件">
      {sources.map((source) => {
        const result = results.find((item) => item.id === source.id)
        const kind = kindOf(result)
        return (
          <li
            key={source.id}
            className={
              source.id === selectedId ? 'filelist__item filelist__item--active' : 'filelist__item'
            }
          >
            <div className="filelist__top">
              {/* 状态既有图标又有名字：不靠颜色单独承载 */}
              <Icon
                name={STATUS_ICON[kind]}
                size={15}
                title={STATUS_TITLE[kind]}
                className={`filelist__status filelist__status--${kind}`}
              />
              <button
                type="button"
                className="filelist__name"
                title={source.name}
                aria-current={source.id === selectedId ? 'true' : undefined}
                onClick={() => onSelect(source.id)}
              >
                {source.name}
              </button>
              <span className="filelist__rate">{rateText(result)}</span>
            </div>
            <div className="filelist__ops">
              {/* 迷你轨只回答「这份文件缺口多不多」，整条是装饰（见 CoverageMeter.tsx）。
                  aria-label 带上文件名，否则多文件时读屏里会有 N 条同名的「共 x 条编号行…」，
                  再加上概览卡那条，一页最多能撞出 N+1 个重名的 group。 */}
              <CoverageMeter cells={meters.get(source.id) ?? []} size="sm" label={source.name} />
              <button
                type="button"
                className="cta filelist__download"
                aria-label={`下载 ${source.name}`}
                disabled={result === undefined || !result.ok}
                onClick={() => onDownload(source.id)}
              >
                <Icon name="download" size={13} />
                下载
              </button>
              <button
                type="button"
                className="filelist__remove"
                aria-label={`移除 ${source.name}`}
                onClick={() => onRemove(source.id)}
              >
                <Icon name="close" size={14} />
              </button>
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
