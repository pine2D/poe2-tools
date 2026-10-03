import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// 样式按令牌与组件（ui-theme）、字体、骨架、构筑页组件、响应式和无障碍顺序引入。
import '@poe2-tools/ui-theme/index.css'
import '@poe2-tools/ui-theme/scale.css'
import '@poe2-tools/ui-theme/fonts.css'
import '../../shared/styles/base.css'
import '../../shared/styles/controls.css'
import '../../shared/styles/layout.css'
import '../../shared/styles/sidebar.css'
import '../../shared/styles/empty.css'
import '../../shared/styles/overview.css'
import '../../shared/styles/stageboard.css'
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
