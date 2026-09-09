import type { Locale } from '@poe2-tools/build-core'
import type { TranslateOptions } from '../translate/runTranslation'

export interface OptionsBarProps {
  locale: Locale
  options: TranslateOptions
  canDownload: boolean
  onLocale(locale: Locale): void
  onOptions(options: TranslateOptions): void
  onDownloadAll(): void
}

export function OptionsBar(props: OptionsBarProps) {
  const { locale, options, canDownload, onLocale, onOptions, onDownloadAll } = props
  return (
    <div className="options">
      <label htmlFor="locale-select">目标语言</label>
      <select
        id="locale-select"
        value={locale}
        onChange={(event) => onLocale(event.target.value === 'zh-TW' ? 'zh-TW' : 'zh-CN')}
      >
        <option value="zh-CN">简体中文（国服）</option>
        <option value="zh-TW">繁体中文（台服）</option>
      </select>
      <label>
        <input
          type="checkbox"
          checked={options.bilingual}
          onChange={(event) => onOptions({ ...options, bilingual: event.target.checked })}
        />
        双语（保留英文原行）
      </label>
      <label>
        <input
          type="checkbox"
          checked={options.annotateUniques}
          onChange={(event) => onOptions({ ...options, annotateUniques: event.target.checked })}
        />
        传奇名注入
      </label>
      <button type="button" onClick={onDownloadAll} disabled={!canDownload}>
        全部下载
      </button>
    </div>
  )
}
