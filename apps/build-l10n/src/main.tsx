import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// 样式按层引入，顺序即级联顺序：令牌 → 基线 → 控件 → 骨架 → 各区组件 → 响应式 → 无障碍兜底。
// 这 12 个文件是从单文件 styles.css 机械剪切出来的，规则一条都没挪位，所以这里的顺序
// 就是原文件的书写顺序。**改动顺序等于改动级联**（noDescendingSpecificity 是逐文件分析的，
// 拆开之后跨文件的顺序依赖 Biome 已经看不见了），要加新文件就追加在同层的末尾。
// Biome 不重排副作用 import（已实测），不用担心格式化把顺序打乱。
import './styles/tokens.css'
import './styles/base.css'
import './styles/controls.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/empty.css'
import './styles/meter.css'
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
