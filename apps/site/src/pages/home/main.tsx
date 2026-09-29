import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HomePage } from './HomePage'
import '@poe2-tools/ui-theme/index.css'
import '@poe2-tools/ui-theme/fonts.css'
import '../../shared/styles/base.css'
import '../../shared/styles/site.css'
import '../../shared/styles/home.css'

const root = document.getElementById('root')
if (root === null) throw new Error('缺少页面容器')
createRoot(root).render(
  <StrictMode>
    <HomePage />
  </StrictMode>,
)
