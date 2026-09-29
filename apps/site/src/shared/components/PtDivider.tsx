// pt-divider（spec §5.9）：两侧渐隐线 + 中心菱结；只用在 spec §5.9 列出的位置
import type { ReactElement } from 'react'
import { cx, Motif } from './Motif'

export interface PtDividerProps {
  variant?: 'hero' | 'indent'
  className?: string
}

export function PtDivider({ variant, className }: PtDividerProps): ReactElement {
  return (
    <div
      className={cx('pt-divider', variant !== undefined && `pt-divider--${variant}`, className)}
      aria-hidden="true"
    >
      <Motif symbol="knot" />
    </div>
  )
}
