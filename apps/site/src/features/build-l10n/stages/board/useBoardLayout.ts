// 阶段看板的版面测量：吸顶阶段名条的列宽与位移、左右缘阴影、滚动提示、备注截断判定
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'
import type { Stage } from '../stages'

export interface BoardLayout {
  ghost: RefObject<HTMLDivElement | null>
  viewport: RefObject<HTMLDivElement | null>
  scroller: RefObject<HTMLElement | null>
  table: RefObject<HTMLTableElement | null>
  overflow: boolean
  widths: number[]
}

export function useBoardLayout(stages: readonly Stage[]): BoardLayout {
  const ghost = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLElement>(null)
  const table = useRef<HTMLTableElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [widths, setWidths] = useState<number[]>([])
  // 量列宽给吸顶阶段名条，按横向滚动位置写入左右缘阴影、滚动提示与阶段名条位移
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换构筑或增减阶段时表格重排，需要立即重新量列宽（ResizeObserver 只在表格尺寸变化时触发）
  useLayoutEffect(() => {
    const sc = scroller.current
    const vp = viewport.current
    const tb = table.current
    const gh = ghost.current
    if (!sc || !vp || !tb || !gh) return
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth
      vp.dataset.start = String(sc.scrollLeft > 1)
      vp.dataset.end = String(sc.scrollLeft < max - 1)
      setOverflow(max > 1)
      gh.style.setProperty('--ghost-x', `${sc.scrollLeft}px`)
      const head = tb.querySelector('thead')?.getBoundingClientRect()
      gh.dataset.show = String(
        head !== undefined && head.bottom < 0 && tb.getBoundingClientRect().bottom > 96,
      )
    }
    const measure = () => {
      // 幽灵条角格取实测的栏位列宽，不直接取 --slot-w（自动表格布局下实际列宽可能不同）
      const corner = tb.querySelector('.stageboard__corner')?.getBoundingClientRect().width
      if (corner !== undefined) gh.style.setProperty('--ghost-corner', `${corner}px`)
      // 作者备注只在被截断时给出“展开全文”；已展开的保持原判定
      for (const note of tb.querySelectorAll<HTMLDetailsElement>('details.stageboard__note')) {
        if (note.open) continue
        const text = note.querySelector('.stageboard__note-text')
        if (text !== null) note.dataset.clamped = String(text.scrollHeight > text.clientHeight + 1)
      }
      setWidths(
        // 用选择器而不是 tHead.rows：happy-dom 不实现 rows 集合
        [...tb.querySelectorAll('thead > tr:first-child > th')].map(
          (th) => th.getBoundingClientRect().width,
        ),
      )
      update()
    }
    // 浏览器对“部分可见”的焦点目标不滚动；按 scroll-padding / scroll-margin 滚到完整可见（WCAG 2.4.11）
    const onFocus = (event: FocusEvent) => {
      ;(event.target as Element)
        .closest('.stageboard__cell, .pt-btn')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    // 表格与滚动容器都要观察：容器变宽而表格因 min-width 不变时，溢出状态也要更新
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(tb)
    observer?.observe(sc)
    // 字体换入后列宽会变，首帧测量可能用的是后备字体
    let alive = true
    void document.fonts?.ready.then(() => {
      if (alive) measure()
    })
    sc.addEventListener('scroll', update, { passive: true })
    sc.addEventListener('focusin', onFocus)
    window.addEventListener('scroll', update, { passive: true })
    measure()
    return () => {
      alive = false
      observer?.disconnect()
      sc.removeEventListener('scroll', update)
      sc.removeEventListener('focusin', onFocus)
      window.removeEventListener('scroll', update)
    }
  }, [stages])
  return { ghost, viewport, scroller, table, overflow, widths }
}
