import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tokens.css'
import '../styles/base.css'
import './craft.css'
import './import-readiness.css'
import { CraftApp } from './CraftApp'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少应用挂载节点')

createRoot(root).render(
  <StrictMode>
    <CraftApp />
  </StrictMode>,
)
