import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 工坊冻结（spec §6.6）：只引入冻结的 legacy 样式与工坊自有样式，不引入 shared/styles 与 ui-theme
import './legacy-tokens.css'
import './legacy-base.css'
import './craft.css'
import './import-readiness.css'
import { CraftApp } from './CraftApp'

import './legacy-site.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少应用挂载节点')

createRoot(root).render(
  <StrictMode>
    <CraftApp />
  </StrictMode>,
)
