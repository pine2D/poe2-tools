// 金属页签（spec §5.7）：ARIA tabs 模式，roving tabindex——只有选中页签 tabIndex=0；
// ←/→ 移到前/后一个并立即切换（首尾循环），Home/End 到首/末，切换后焦点跟到新页签。
// 页签行 .pt-tabs-row、右侧工具组与 tabpanel 由使用方组合（构筑页见 Preview）。
import type { KeyboardEvent, ReactElement } from 'react'

export interface PtTab<K extends string> {
  key: K
  label: string
  count: number
}

export interface PtTabsProps<K extends string> {
  tabs: readonly PtTab<K>[]
  selected: K
  onSelect(key: K): void
  /** tablist 的 aria-label（构筑页为“构筑内容”） */
  label: string
  /** aria-controls 指向的面板 id（构筑页为 'build-tabpanel'） */
  panelId: string
}

/** `tab-${key}`：构筑页得到 tab-gear、tab-skills、tab-passives */
export function ptTabId(key: string): string {
  return `tab-${key}`
}

function targetIndex(key: string, index: number, count: number): number | null {
  if (key === 'ArrowRight') return (index + 1) % count
  if (key === 'ArrowLeft') return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

export function PtTabs<K extends string>({
  tabs,
  selected,
  onSelect,
  label,
  panelId,
}: PtTabsProps<K>): ReactElement {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = targetIndex(event.key, index, tabs.length)
    const tab = next === null ? undefined : tabs[next]
    if (tab === undefined) return
    event.preventDefault()
    onSelect(tab.key)
    // 全部页签常驻 DOM，只换 aria-selected 与 tabIndex，直接把焦点交给目标页签
    document.getElementById(ptTabId(tab.key))?.focus()
  }
  return (
    <div className="pt-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const on = tab.key === selected
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className="pt-tab"
            id={ptTabId(tab.key)}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            <span className="pt-tab__count">{tab.count}</span>
          </button>
        )
      })}
    </div>
  )
}
