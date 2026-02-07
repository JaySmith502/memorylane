import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MainWindowApp } from './pages/main-window/MainWindowApp'
import './index.css'

const root = document.getElementById('root')
if (root === null) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <MainWindowApp />
  </StrictMode>,
)
