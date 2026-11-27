import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 工坊沿用独立样式，保留原有深色外观。
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
