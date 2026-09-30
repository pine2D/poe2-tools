// 页头右侧的构筑页专属控件（spec §5.2、§5.12、§6.4.5）：简繁分段 + “设置”触发器与设置弹层。
// 外观来自 ui-theme（pt-seg、pt-trigger、pt-popover、pt-check）；弹层的位置、层级与动效在构筑页页面样式里。
import type { Locale } from '@poe2-tools/build-core'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../shared/components/Icon'
import type { TranslateOptions } from '../translate/runTranslation'

export interface OptionsBarProps {
  locale: Locale
  options: TranslateOptions
  onLocale(locale: Locale): void
  onOptions(options: TranslateOptions): void
}

const LOCALES: readonly { value: Locale; label: string; short: string }[] = [
  { value: 'zh-CN', label: '简体中文（国服）', short: '简体' },
  { value: 'zh-TW', label: '繁体中文（台服）', short: '繁体' },
]

// 复选框保留原生控件与 label / hint 结构：说明经 aria-describedby 关联，不进可访问名（spec §5.12）
function Toggle(props: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange(checked: boolean): void
}) {
  const { id, label, hint, checked, onChange } = props
  return (
    <div className="pt-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <p id={`${id}-hint`} className="pt-check__hint">
        {hint}
      </p>
    </div>
  )
}

export function OptionsBar({ locale, options, onLocale, onOptions }: OptionsBarProps) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [motion, setMotion] = useState(false)
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLInputElement>('input')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setMotion(true)
        setOpen(false)
      }
    }
    const leave = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setMotion(false)
        setOpen(false)
      }
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setMotion(false)
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', leave)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', leave)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])
  return (
    <div className="app__options">
      <div className="pt-seg" role="radiogroup" aria-label="目标语言">
        {LOCALES.map((item) => (
          <label key={item.value} className="pt-seg__item">
            <input
              type="radio"
              name="target-locale"
              value={item.value}
              className="visually-hidden"
              aria-label={item.label}
              checked={locale === item.value}
              onChange={() => onLocale(item.value)}
            />
            {item.short}
          </label>
        ))}
      </div>
      <div className="app__settings" ref={root}>
        <button
          type="button"
          className="pt-trigger"
          ref={trigger}
          id="settings-trigger"
          aria-expanded={open}
          aria-controls="settings-panel"
          onClick={(event) => {
            setMotion(event.detail > 0)
            setOpen((value) => !value)
          }}
        >
          设置
          <Icon name="chevron-down" size={14} />
        </button>
        <section
          className="pt-popover app__settings-panel"
          id="settings-panel"
          ref={panel}
          aria-label="设置"
          aria-hidden={!open}
          inert={!open}
          data-open={open}
          data-motion={motion}
        >
          <h2>导出设置</h2>
          <Toggle
            id="opt-bilingual"
            label="导出时保留英文原行"
            hint="译文下面再保留一行英文原文，方便对着攻略核对。文件会变长。"
            checked={options.bilingual}
            onChange={(checked) => onOptions({ ...options, bilingual: checked })}
          />
          <Toggle
            id="opt-uniques"
            label="补充传奇装备中文名"
            hint="在传奇装备的备注里补一行中文名，游戏读取用的原始名称保持不变。"
            checked={options.annotateUniques}
            onChange={(checked) => onOptions({ ...options, annotateUniques: checked })}
          />
          <p>预览中的“对照 / 译文”只改变阅读方式。</p>
        </section>
      </div>
    </div>
  )
}
