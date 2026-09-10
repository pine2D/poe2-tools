import type { Locale } from '@poe2-tools/build-core'
import type { TranslateOptions } from '../translate/runTranslation'
import { Icon } from './Icon'

export interface OptionsBarProps {
  locale: Locale
  options: TranslateOptions
  onLocale(locale: Locale): void
  onOptions(options: TranslateOptions): void
}

const LOCALES: readonly { value: Locale; label: string }[] = [
  { value: 'zh-CN', label: '简体中文（国服）' },
  { value: 'zh-TW', label: '繁体中文（台服）' },
]

const BILINGUAL_HINT = '译文下面再保留一行英文原文，方便对着攻略核对。文件会变长。'
const UNIQUES_HINT =
  '给传奇装备的备注里补一行中文名；游戏读取用的 unique_name 原样保留，不影响加载。'

// 单个开关：原生 checkbox（用 appearance:none 自绘外观，焦点与键盘行为全部保留），
// 文字标签在 label 里，说明文字放在 label 外的隐藏段落并用 aria-describedby 关联——
// 说明如果写进 label，可访问名就会变成"标签 + 一整段说明"，读屏与测试都难用。
// title 挂在最外层 span 上：ⓘ 只画一个图标而悬停毫无反馈，等于画了个假按钮；原生 title
// 是零依赖零 JS 的最省做法，明眼用户悬停整个开关就能读到同一句说明。title 不会污染
// checkbox 的可访问名（它有显式 <label for>，title 只在无名时才当兜底名）。
function Toggle(props: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange(checked: boolean): void
}) {
  const { id, label, hint, checked, onChange } = props
  const hintId = `${id}-hint`
  return (
    <span className="opt" title={hint}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <Icon name="info" size={14} className="opt__info" />
      <span id={hintId} className="visually-hidden">
        {hint}
      </span>
    </span>
  )
}

export function OptionsBar({ locale, options, onLocale, onOptions }: OptionsBarProps) {
  return (
    <div className="options">
      {/* 分段控件用真 radio：比 role="radio" 的按钮少一层 ARIA 债，方向键分组行为由浏览器给。
          容器**不能**用 <fieldset>：aria-query 里 fieldset 的隐式 role 是 group，radiogroup
          在 HTML 中没有任何元素映射，写 fieldset 会让 getByRole('radiogroup') 永远找不到。
          所以显式 role="radiogroup" + aria-labelledby 指到那行标签文字。 */}
      <div className="seg" role="radiogroup" aria-labelledby="seg-label">
        <span id="seg-label" className="seg__legend">
          目标语言
        </span>
        {LOCALES.map((item) => (
          <label
            key={item.value}
            className={locale === item.value ? 'seg__item seg__item--on' : 'seg__item'}
          >
            <input
              type="radio"
              name="target-locale"
              value={item.value}
              className="visually-hidden"
              checked={locale === item.value}
              onChange={() => onLocale(item.value)}
            />
            {item.label}
          </label>
        ))}
      </div>
      <Toggle
        id="opt-bilingual"
        label="双语（保留英文原行）"
        hint={BILINGUAL_HINT}
        checked={options.bilingual}
        onChange={(checked) => onOptions({ ...options, bilingual: checked })}
      />
      <Toggle
        id="opt-uniques"
        label="传奇名注入"
        hint={UNIQUES_HINT}
        checked={options.annotateUniques}
        onChange={(checked) => onOptions({ ...options, annotateUniques: checked })}
      />
    </div>
  )
}
