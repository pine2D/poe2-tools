// 搜索候选示意（l1demo__ 类，样式在 shared/styles/l1-demo.css）的共用部件：首页对照带与扩展介绍页“确认生效”共用。
// 只输出部件，不含外框与布局包裹：首页把候选框拆成框顶／框腰／框底三段落进对照带的 subgrid，扩展页用整框，
// 框（l1demo__box*）与布局由页面决定。部件只输出已有的 l1demo__ 类，不加新类或新属性。
import type { ReactElement } from 'react'
import { L1_DEMO_LABEL, L1_DEMO_QUERY } from '../l1Demo'
import { Icon } from './Icon'
import { cx, Motif } from './Motif'

/** 示例图注：“示例”小标签 + 一句说明；两页所有示例 figure 共用 */
export function L1DemoCaption({ id, children }: { id: string; children: string }): ReactElement {
  return (
    <figcaption className="l1demo__cap" id={id}>
      <span className="l1demo__tag">示例</span>
      <span>{children}</span>
    </figcaption>
  )
}

/** 搜索框上方的标签与自绘的 CoE 基底搜索框 */
export function L1DemoSearch(): ReactElement {
  return (
    <>
      <p className="l1demo__label">{L1_DEMO_LABEL}</p>
      <div className="l1demo__field">
        <Icon name="search" />
        {L1_DEMO_QUERY}
        <span className="l1demo__caret" aria-hidden="true" />
      </div>
    </>
  )
}

/** 候选框顶部的说明行 */
export function L1DemoHelp(): ReactElement {
  return (
    <p className="l1demo__help">
      “{L1_DEMO_QUERY}”：选择英文查询（方向键移动，Enter 选择，Escape 取消）
    </p>
  )
}

/** 一条候选；selected 只表示外观（类名），className 供页面挂放大行等页面类 */
export function L1DemoOption({
  zh,
  en,
  selected = false,
  className,
}: {
  zh: string
  en: string
  selected?: boolean
  className?: string
}): ReactElement {
  return (
    <div className={cx('l1demo__opt', selected && 'l1demo__opt--selected', className)}>
      <span>{zh}</span>
      <span aria-hidden="true">→</span>
      <span lang="en">{en}</span>
    </div>
  )
}

/** 候选框底部署名 */
export function L1DemoBy(): ReactElement {
  return (
    <div className="l1demo__by" aria-hidden="true">
      <Motif symbol="gem" className="pt-attr-ext" />
      PoE2 中文助手 · 非官方
    </div>
  )
}
