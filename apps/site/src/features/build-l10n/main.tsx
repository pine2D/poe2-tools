import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// 样式按令牌、骨架、组件、响应式和无障碍顺序引入。
import '../../shared/styles/tokens.css'
import '../../shared/styles/base.css'
import '../../shared/styles/controls.css'
import '../../shared/styles/layout.css'
import '../../shared/styles/sidebar.css'
import '../../shared/styles/empty.css'
import '../../shared/styles/overview.css'
import '../../shared/styles/cards.css'
import '../../shared/styles/table.css'
import '../../shared/styles/responsive.css'
import '../../shared/styles/a11y.css'

import '../../shared/styles/site.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少 #root 容器')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
