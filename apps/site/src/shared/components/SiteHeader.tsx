// 全站页头 pt-header（spec §5.2、§6.1）：logo 与字标、衬线导航、页面专属控件与 GitHub。没有主题选择（D2）。
import type { ReactElement, ReactNode } from 'react'
import { Motif } from './Motif'

export interface SiteHeaderProps {
  active: 'home' | 'build' | 'extension'
  /** 页面专属控件（构筑页：简繁分段与“设置”），排在 GitHub 链接之前 */
  children?: ReactNode
}

export function SiteHeader({ active, children }: SiteHeaderProps): ReactElement {
  return (
    <header className="pt-header">
      <div className="pt-header__inner">
        <a className="pt-brand" href="/" aria-label="PoE2 Tools 首页">
          <Motif symbol="logo" />
          <span>
            <b>PoE2</b> Tools
          </span>
        </a>
        <nav className="pt-nav" aria-label="工具导航">
          <a href="/build/" aria-current={active === 'build' ? 'page' : undefined}>
            构筑汉化
          </a>
          <a href="/extension/" aria-current={active === 'extension' ? 'page' : undefined}>
            中文助手
          </a>
        </nav>
        <div className="pt-header__end">
          {children}
          <a className="pt-header__github" href="https://github.com/pine2D/poe2-tools">
            GitHub
          </a>
        </div>
      </div>
    </header>
  )
}
