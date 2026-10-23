import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/tables.css'
import './styles/behov.css'
import './styles/register.css'
import './styles/resultat.css'
import './styles/kalender.css'
import './styles/inspector.css'
import './styles/bemanning.css'
import './styles/dagsplan.css'
import './styles/print.css'
import App from './App.tsx'
import { loadPref } from './store/prefs'
import { setCssVars } from './ui/cssVars'

// Before the first paint, so a dark page does not flash light.
document.documentElement.classList.toggle('dark', loadPref<string>('theme', 'light') === 'dark')
setCssVars(document.documentElement)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
