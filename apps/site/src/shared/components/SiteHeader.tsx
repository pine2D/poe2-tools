import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function SiteHeader({
  active,
  children,
}: {
  active: 'home' | 'build' | 'extension'
  children?: ReactNode
}) {
  return (
    <header className="site-header">
      <a className="site-brand" href="/" aria-label="PoE2 Tools 首页">
        <Icon name="brand" size={28} />
        <span>
          PoE2 <strong>Tools</strong>
        </span>
      </a>
      <nav className="site-nav" aria-label="工具导航">
        <a href="/build/" aria-current={active === 'build' ? 'page' : undefined}>
          构筑汉化
        </a>
        <a href="/extension/" aria-current={active === 'extension' ? 'page' : undefined}>
          中文助手
        </a>
      </nav>
      <div className="site-header-actions">
        {children}
        <a className="site-github" href="https://github.com/pine2D/poe2-tools">
          GitHub
        </a>
      </div>
    </header>
  )
}
