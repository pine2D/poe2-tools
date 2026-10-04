import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HomePage } from './HomePage'
// 样式顺序同构筑页入口：ui-theme 令牌（含尺寸阶梯）与组件 → 阶段名衬线 → 字体 → 骨架 → 共用示意 → 首页
import '@poe2-tools/ui-theme/index.css'
import '@poe2-tools/ui-theme/components/stagehead.css'
import '@poe2-tools/ui-theme/fonts.css'
import '../../shared/styles/base.css'
import '../../shared/styles/site.css'
import '../../shared/styles/l1-demo.css'
import '../../shared/styles/home.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少页面容器')
createRoot(root).render(
  <StrictMode>
    <HomePage />
  </StrictMode>,
)
