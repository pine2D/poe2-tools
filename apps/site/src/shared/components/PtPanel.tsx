// pt-panel（spec §5.4）：无角饰的内层面板；带标题栏时自身内边距为 0，容器查询挂在面板上
import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { cx } from './Motif'
import { PtTitlebar, type PtTitlebarProps } from './PtTitlebar'

export interface PtPanelProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'className'> {
  /** 默认 'div' */
  as?: 'article' | 'section' | 'div' | 'figure' | 'aside'
  variant: 'card' | 'item' | 'inset'
  /** 只对 item：unique 边 #af6025、gem 边 #1ba29b；缺省为 base/collapsed 的 #6e5634 */
  edge?: 'unique' | 'gem'
  titlebar?: PtTitlebarProps
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

export function PtPanel({
  as: Tag = 'div',
  variant,
  edge,
  titlebar,
  className,
  bodyClassName,
  children,
  ...rest
}: PtPanelProps): ReactElement {
  const panelClass = cx(
    'pt-panel',
    `pt-panel--${variant}`,
    variant === 'item' && edge !== undefined && `pt-panel--${edge}`,
    titlebar !== undefined && 'pt-panel--titled',
    className,
  )
  if (titlebar === undefined) {
    return (
      <Tag className={panelClass} {...rest}>
        {children}
      </Tag>
    )
  }
  return (
    <Tag className={panelClass} {...rest}>
      <PtTitlebar {...titlebar} />
      <div className={cx('pt-panel__body', bodyClassName)}>
        {titlebar.chip !== undefined && (
          <span className="pt-chip pt-chip--body">{titlebar.chip}</span>
        )}
        {children}
      </div>
    </Tag>
  )
}
