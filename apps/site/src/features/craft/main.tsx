import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../shared/styles/tokens.css'
import '../../shared/styles/base.css'
import './craft.css'
import './import-readiness.css'
import { CraftApp } from './CraftApp'

import '../../shared/styles/site.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少应用挂载节点')

createRoot(root).render(
  <StrictMode>
    <CraftApp />
  </StrictMode>,
)
