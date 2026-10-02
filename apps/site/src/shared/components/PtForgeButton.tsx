// pt-forge-btn（spec §5.5）：金属主按钮。每个路由状态至多一个，只能用在 spec §4.2 白名单的位置：
// 首页“打开构筑汉化”（a，wide）、构筑空态“选择 .build 文件”（label）、“下载中文 .build”（button）、
// 扩展页“下载扩展”（a）。
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react'
import { cx, Motif } from './Motif'

interface ForgeOwnProps {
  /** 通栏：文字靠左、箭头“→”靠右（只用于首页入口卡） */
  wide?: boolean
  className?: string
  children: ReactNode
}

export type PtForgeButtonProps =
  | (ForgeOwnProps & { as?: 'button' } & Omit<
        ButtonHTMLAttributes<HTMLButtonElement>,
        keyof ForgeOwnProps
      >)
  | (ForgeOwnProps & { as: 'a'; href: string } & Omit<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        keyof ForgeOwnProps | 'href'
      >)
  | (ForgeOwnProps & { as: 'label'; htmlFor: string } & Omit<
        LabelHTMLAttributes<HTMLLabelElement>,
        keyof ForgeOwnProps | 'htmlFor'
      >)

function ForgeContent({ wide, children }: { wide: boolean; children: ReactNode }) {
  return (
    <>
      <Motif symbol="gem" className="pt-forge-btn__cap pt-forge-btn__cap--l" />
      {wide ? (
        <>
          <span>{children}</span>
          <span aria-hidden="true">→</span>
        </>
      ) : (
        children
      )}
      <Motif symbol="gem" className="pt-forge-btn__cap pt-forge-btn__cap--r" />
    </>
  )
}

export function PtForgeButton(props: PtForgeButtonProps): ReactElement {
  const wide = props.wide ?? false
  const classes = cx('pt-forge-btn', wide && 'pt-forge-btn--wide', props.className)
  const content = <ForgeContent wide={wide}>{props.children}</ForgeContent>
  if (props.as === 'a') {
    const { as: _as, wide: _wide, className: _className, children: _children, ...rest } = props
    return (
      <a {...rest} className={classes}>
        {content}
      </a>
    )
  }
  if (props.as === 'label') {
    const {
      as: _as,
      wide: _wide,
      className: _className,
      children: _children,
      htmlFor,
      ...rest
    } = props
    return (
      <label {...rest} htmlFor={htmlFor} className={classes}>
        {content}
      </label>
    )
  }
  const {
    as: _as,
    wide: _wide,
    className: _className,
    children: _children,
    type = 'button',
    ...rest
  } = props
  return (
    <button {...rest} type={type} className={classes}>
      {content}
    </button>
  )
}
