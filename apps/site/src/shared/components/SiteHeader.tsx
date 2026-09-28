import type { ReactNode } from 'react'
import type { ThemeMode } from '../theme/useTheme'
import { Icon } from './Icon'

export function SiteHeader({
  active,
  mode,
  onMode,
  children,
}: {
  active: 'home' | 'build' | 'extension'
  mode: ThemeMode
  onMode?: (mode: ThemeMode) => void
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
        {onMode && (
          <label className="site-theme">
            <span className="visually-hidden">界面主题</span>
            <select value={mode} onChange={(event) => onMode(event.target.value as ThemeMode)}>
              <option value="system">跟随系统</option>
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </label>
        )}
        {children}
        <a className="site-github" href="https://github.com/pine2D/poe2-tools">
          GitHub
        </a>
      </div>
    </header>
  )
}
