// pt-forge-btn（spec §5.5）：金属主按钮。每个路由状态至多一个，只能用在 spec §4.2 白名单的位置：
// 构筑空态“选择 .build 文件”（label）、“下载中文 .build”（button）、扩展页“下载扩展”（a）。
// 二期起首页不用金属主按钮（两个入口是同款 pt-btn）。
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react'
import { cx, Motif } from './Motif'

interface ForgeOwnProps {
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

function ForgeContent({ children }: { children: ReactNode }) {
  return (
    <>
      <Motif symbol="gem" className="pt-forge-btn__cap pt-forge-btn__cap--l" />
      {children}
      <Motif symbol="gem" className="pt-forge-btn__cap pt-forge-btn__cap--r" />
    </>
  )
}

export function PtForgeButton(props: PtForgeButtonProps): ReactElement {
  const classes = cx('pt-forge-btn', props.className)
  const content = <ForgeContent>{props.children}</ForgeContent>
  if (props.as === 'a') {
    const { as: _as, className: _className, children: _children, ...rest } = props
    return (
      <a {...rest} className={classes}>
        {content}
      </a>
    )
  }
  if (props.as === 'label') {
    const { as: _as, className: _className, children: _children, htmlFor, ...rest } = props
    return (
      <label {...rest} htmlFor={htmlFor} className={classes}>
        {content}
      </label>
    )
  }
  const { as: _as, className: _className, children: _children, type = 'button', ...rest } = props
  return (
    <button {...rest} type={type} className={classes}>
      {content}
    </button>
  )
}
