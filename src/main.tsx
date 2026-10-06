import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/tables.css'
import './styles/kalender.css'
import './styles/inspector.css'
import App from './App.tsx'
import { loadPref } from './store/prefs'

// Before the first paint, so a dark page does not flash light.
document.documentElement.classList.toggle('dark', loadPref<string>('theme', 'light') === 'dark')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
