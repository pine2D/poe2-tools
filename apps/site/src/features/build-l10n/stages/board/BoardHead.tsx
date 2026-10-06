// 阶段看板框内顶部：构筑概况与下载主按钮、多构筑切换
import type { Locale } from '@poe2-tools/build-core'
import { useEffect, useRef } from 'react'
import { Icon } from '../../../../shared/components/Icon'
import { PtForgeButton } from '../../../../shared/components/PtForgeButton'
import type { Series } from '../stages'

export interface BoardFactsProps {
  series: Series
  locale: Locale
  totalMisses: number
  onDownload(): void
}

export function BoardFacts({ series, locale, totalMisses, onDownload }: BoardFactsProps) {
  const { stages } = series
  const single = stages.length === 1 ? stages[0] : undefined
  const ascendancy = stages[0]?.file.preview.ascendancy ?? null
  return (
    <div className="stageboard__head">
      <ul className="stageboard__facts">
        {ascendancy !== null && (
          <li
            lang={locale}
          >{`${ascendancy.classText ?? ascendancy.classCode} · ${ascendancy.text ?? ascendancy.code}`}</li>
        )}
        {series.author !== null && (
          <li>
            作者 <b data-user-text="">{series.author}</b>
          </li>
        )}
        <li>
          <b className="pt-num">{stages.length}</b> 个阶段
        </li>
        <li>
          {totalMisses > 0 ? (
            <span className="stageboard__miss">
              <Icon name="warning" size={16} />
              待核对 <b className="pt-num">{totalMisses}</b>
            </span>
          ) : (
            '暂无待核对项'
          )}
        </li>
        <li className="stageboard__hint">点格子看中英词缀；“逐项核对”可定位每一处待核对</li>
      </ul>
      <PtForgeButton
        aria-label={
          single === undefined ? `打包下载 ${stages.length} 个阶段` : `下载 ${single.file.name}`
        }
        onClick={onDownload}
      >
        <Icon name="download" size={18} />
        <span>
          下载中文 <span className="pt-ext">.build</span>
        </span>
      </PtForgeButton>
    </div>
  )
}

export interface SeriesSwitchProps {
  allSeries: readonly Series[]
  currentKey: string
  onSeries(key: string): void
}

export function SeriesSwitch({ allSeries, currentKey, onSeries }: SeriesSwitchProps) {
  return (
    <div className="pt-seg stageboard__switch" role="radiogroup" aria-label="切换构筑">
      {allSeries.map((item) => (
        <label key={item.key} className="pt-seg__item">
          <input
            type="radio"
            className="visually-hidden"
            name="stage-series"
            checked={item.key === currentKey}
            onChange={() => onSeries(item.key)}
          />
          <span data-user-text="">
            {item.title}
            {item.separated &&
              ` · ${item.author ?? '作者未填写'} · ${item.stages[0]?.file.preview.ascendancy?.text ?? item.stages[0]?.file.input.ascendancy ?? '升华未填写'}`}
          </span>
        </label>
      ))}
    </div>
  )
}

/** 顺序只影响阅读和 ZIP 条目顺序，不改文件里的阶段信息或装备数据。 */
export function StageOrder({
  series,
  onOrder,
}: {
  series: Series
  onOrder(ids: readonly string[] | null): void
}) {
  const list = useRef<HTMLOListElement>(null)
  const summary = useRef<HTMLElement>(null)
  const moved = useRef<string | null>(null)
  useEffect(() => {
    if (moved.current === null || !series.stages.some((stage) => stage.file.id === moved.current)) {
      return
    }
    const row = [...(list.current?.children ?? [])].find(
      (item) => (item as HTMLElement).dataset.fileId === moved.current,
    )
    row?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    moved.current = null
  }, [series.stages])
  const move = (at: number, offset: -1 | 1) => {
    const ids = series.stages.map((stage) => stage.file.id)
    const from = ids[at]
    const to = ids[at + offset]
    if (from === undefined || to === undefined) return
    ids[at] = to
    ids[at + offset] = from
    moved.current = from
    onOrder(ids)
  }
  return (
    <div className="stageboard__order">
      <p role="status">
        {series.order === 'manual'
          ? '阶段按你调整的顺序排列。'
          : series.order === 'import'
            ? '部分文件没有天赋，已按导入顺序排列。'
            : '阶段按天赋点数排列，可调整顺序。'}
      </p>
      <details>
        <summary ref={summary}>调整阶段顺序</summary>
        <ol ref={list} aria-label="阶段顺序">
          {series.stages.map((stage, i) => (
            <li key={stage.file.id} data-file-id={stage.file.id}>
              <span className="stageboard__order-label" data-user-text="">
                {stage.label}
              </span>
              <button
                type="button"
                className="pt-btn pt-btn--quiet pt-btn--sm"
                aria-label={`将${stage.label}上移`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                上移
              </button>
              <button
                type="button"
                className="pt-btn pt-btn--quiet pt-btn--sm"
                aria-label={`将${stage.label}下移`}
                disabled={i === series.stages.length - 1}
                onClick={() => move(i, 1)}
              >
                下移
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="pt-btn pt-btn--sm"
          disabled={series.order !== 'manual'}
          onClick={() => {
            onOrder(null)
            summary.current?.focus()
          }}
        >
          恢复建议顺序
        </button>
      </details>
    </div>
  )
}
