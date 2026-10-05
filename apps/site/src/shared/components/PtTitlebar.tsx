// pt-titlebar（spec §5.3）：居中衬线金字标题，右侧可选 chip；两端不加端饰
import type { ReactElement, ReactNode } from 'react'

export interface PtTitlebarProps {
  /** 标题内容；含 “.build” 时调用方把它包进 <span className="pt-ext"> */
  title: ReactNode
  /** 标题元素，沿用各处现有标题级别；默认 'h2'。构筑空态“导入 .build”用 'p'（M0 B7） */
  as?: 'h1' | 'h2' | 'h3' | 'p'
  id?: string
  /** 省略号截断时的全文，写入标题元素的 title 属性；来自用户文件的标题必须给 */
  fullText?: string
  /** 来自用户文件（构筑名、文件名）：标题元素加 data-user-text */
  userText?: boolean
  /** 右侧 chip 文案 */
  chip?: string
  /** -1：标题可被程序聚焦（视图切换后交接焦点），不进 Tab 序列 */
  tabIndex?: -1
}

export function PtTitlebar({
  title,
  as: Tag = 'h2',
  id,
  fullText,
  userText = false,
  chip,
  tabIndex,
}: PtTitlebarProps): ReactElement {
  return (
    <header className="pt-titlebar">
      <Tag
        className="pt-titlebar__title"
        id={id}
        tabIndex={tabIndex}
        title={fullText}
        data-user-text={userText ? '' : undefined}
      >
        {title}
      </Tag>
      {chip !== undefined && <span className="pt-chip">{chip}</span>}
    </header>
  )
}
