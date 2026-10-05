// 阶段看板框内顶部：构筑概况与下载主按钮、多构筑切换
import type { Locale } from '@poe2-tools/build-core'
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
          {item.title}
        </label>
      ))}
    </div>
  )
}
