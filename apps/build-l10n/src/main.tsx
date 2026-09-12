import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// 样式按令牌、骨架、组件、响应式和无障碍顺序引入。
import './styles/tokens.css'
import './styles/base.css'
import './styles/controls.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/empty.css'
import './styles/overview.css'
import './styles/cards.css'
import './styles/table.css'
import './styles/responsive.css'
import './styles/a11y.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少 #root 容器')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
