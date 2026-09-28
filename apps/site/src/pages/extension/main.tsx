import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ExtensionPage } from './ExtensionPage'
import '../../shared/styles/tokens.css'
import '../../shared/styles/base.css'
import '../../shared/styles/site.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少页面容器')
createRoot(root).render(
  <StrictMode>
    <ExtensionPage />
  </StrictMode>,
)
