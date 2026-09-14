import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)

// O service worker é registrado pelo vite-plugin-pwa (injectRegister: 'auto'),
// que insere /registerSW.js no index.html do build. Registrar aqui de novo
// criaria duas inscrições concorrentes no mesmo SW.
