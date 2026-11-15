import { type ReactNode, useId } from 'react'
import { Icon } from '../../../shared/components/Icon'
import type { SourceFile, TranslateResult } from '../translate/runTranslation'
import type { FileGroup } from './fileGroups'

interface DeliveryProps {
  sources: readonly SourceFile[]
  results: readonly TranslateResult[]
  groups: readonly FileGroup[] | null
  misses: ReadonlyMap<string, number>
  currentKey: string | undefined
  reviewId: string | null
  review: ReactNode
  onReview(id: string): void
  onDownload(id: string): void
  onRemove(id: string): void
  onCompare(key: string): void
  onSeries(key: string): void
}

/** 交付列表复用阶段分组与顺序；同一时刻只挂载一份详细核对。 */
export function Delivery({
  sources,
  results,
  groups,
  misses,
  currentKey,
  reviewId,
  review,
  onReview,
  onDownload,
  onRemove,
  onCompare,
  onSeries,
}: DeliveryProps) {
  const prefix = useId()
  const shown = groups ?? [
    {
      key: 'waiting',
      kind: 'failed' as const,
      title: '已导入文件',
      items: sources.map((source) => ({ source, stage: null })),
    },
  ]
  const resultById = new Map(results.map((result) => [result.id, result]))
  return (
    <ul className="delivery__groups" aria-label="已导入文件">
      {shown.map((group, groupIndex) => (
        <li className="delivery__group" key={group.key}>
          <div className="delivery__group-head">
            <h3
              id={`${prefix}-group-${groupIndex}`}
              className="delivery__group-title"
              data-user-text=""
            >
              {group.title}
            </h3>
            {group.kind === 'series' && (
              <div className="delivery__actions">
                {shown.filter((item) => item.kind === 'series').length > 1 && (
                  <button
                    type="button"
                    className="pt-btn pt-btn--quiet pt-btn--xs"
                    aria-pressed={group.key === currentKey}
                    onClick={() => onSeries(group.key)}
                  >
                    {group.key === currentKey ? '当前构筑' : '选为当前构筑'}
                  </button>
                )}
                <button
                  type="button"
                  className="pt-btn pt-btn--quiet pt-btn--xs"
                  aria-label={`阶段比较 ${group.title}`}
                  onClick={() => onCompare(group.key)}
                >
                  阶段比较
                </button>
              </div>
            )}
          </div>
          <ul className="delivery__files" aria-labelledby={`${prefix}-group-${groupIndex}`}>
            {group.items.map(({ source, stage }, index) => {
              const result = resultById.get(source.id)
              const count = misses.get(source.id) ?? 0
              const label =
                sources.filter((item) => item.name === source.name).length > 1
                  ? `${source.name}（第 ${sources.indexOf(source) + 1} 份）`
                  : source.name
              const expanded = reviewId === source.id
              const reviewName = count > 0 ? '查看待核对' : '查看内容'
              const reviewDomId = `${prefix}-review-${groupIndex}-${index}`
              return (
                <li key={source.id} className="delivery__file" data-file-id={source.id}>
                  <div className="delivery__row">
                    <div className="delivery__file-info">
                      {stage !== null && (
                        <strong className="pt-stagehead delivery__stage" data-user-text="">
                          {stage}
                        </strong>
                      )}
                      <span className="delivery__filename">{label}</span>
                      <span
                        className={
                          result?.ok && count > 0
                            ? 'delivery__status delivery__status--pending'
                            : 'delivery__status'
                        }
                      >
                        <Icon
                          name={
                            result === undefined
                              ? 'refresh'
                              : !result.ok || count > 0
                                ? 'warning'
                                : 'check'
                          }
                          size={15}
                        />
                        {result === undefined
                          ? '待词典就绪'
                          : !result.ok
                            ? '解析失败'
                            : count > 0
                              ? `待核对 ${count} · 保留原文，可下载`
                              : '可下载 · 暂无待核对项'}
                      </span>
                    </div>
                    <div className="delivery__actions">
                      {result?.ok && (
                        <>
                          <button
                            type="button"
                            className="pt-btn pt-btn--xs delivery__review-button"
                            data-review-id={source.id}
                            aria-label={`${reviewName} ${label}`}
                            aria-expanded={expanded}
                            aria-controls={expanded ? reviewDomId : undefined}
                            onClick={() => onReview(source.id)}
                          >
                            {expanded ? '收起内容' : reviewName}
                          </button>
                          <button
                            type="button"
                            className="pt-btn pt-btn--quiet pt-btn--xs"
                            aria-label={`下载 ${label}`}
                            onClick={() => onDownload(source.id)}
                          >
                            单份下载
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="pt-btn pt-btn--quiet pt-btn--xs delivery__remove"
                        aria-label={`移除 ${label}`}
                        onClick={() => onRemove(source.id)}
                      >
                        <Icon name="close" size={18} />
                      </button>
                    </div>
                  </div>
                  {result !== undefined && !result.ok && (
                    <details className="delivery__error">
                      <summary>查看解析错误</summary>
                      <p>{result.error}</p>
                    </details>
                  )}
                  {expanded && (
                    <div className="delivery__review" id={reviewDomId}>
                      {review}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}
