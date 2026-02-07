import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsApp } from './pages/settings/SettingsApp'
import './index.css'

const root = document.getElementById('root')
if (root === null) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
)
