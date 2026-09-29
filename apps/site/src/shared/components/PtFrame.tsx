// pt-frame（spec §5.3、§4.5）：最外层金属框，四角角饰画在 ui-theme 的伪元素上。
// 同一路由状态最多两扇，框不得嵌套（spec §4.2）；框与祖先不得裁切（overflow / contain）。
import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import { cx } from './Motif'
import { PtTitlebar, type PtTitlebarProps } from './PtTitlebar'

export interface PtFrameProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'className'> {
  /** 默认 'section' */
  as?: 'section' | 'div'
  /** main：构筑主区（body 18/24/26）；hero：首页、扩展页、构筑空态；side：构筑侧栏。默认 'main' */
  variant?: 'main' | 'hero' | 'side'
  /** 省略则没有标题栏，内边距加在框自身（只用于无标题栏的 hero） */
  titlebar?: PtTitlebarProps
  className?: string
  bodyClassName?: string
  ref?: Ref<HTMLElement>
  children?: ReactNode
}

export function PtFrame({
  as: Tag = 'section',
  variant = 'main',
  titlebar,
  className,
  bodyClassName,
  ref,
  children,
  ...rest
}: PtFrameProps): ReactElement {
  const frameClass = cx('pt-frame', variant !== 'main' && `pt-frame--${variant}`, className)
  // section 与 div 都是 HTMLElement，同一个引用在两者上都成立；RefObject 在类型上不协变，
  // 所以统一收窄成 div 的引用类型（它同时满足 section 的 ref 类型）
  const frameRef = ref as Ref<HTMLDivElement> | undefined
  if (titlebar === undefined) {
    return (
      <Tag ref={frameRef} className={frameClass} {...rest}>
        {children}
      </Tag>
    )
  }
  return (
    <Tag ref={frameRef} className={frameClass} {...rest}>
      <PtTitlebar {...titlebar} />
      <div className={cx('pt-frame__body', bodyClassName)}>
        {titlebar.chip !== undefined && (
          <span className="pt-chip pt-chip--body">{titlebar.chip}</span>
        )}
        {children}
      </div>
    </Tag>
  )
}
