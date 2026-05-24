import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@40kauspex/ui/globals.css'
import App from './App'

// Standalone entry — used when running mfe-companion on its own (port 3002).
// Inside the shell the component is consumed over Module Federation and the
// shell supplies the router, so `App` itself never mounts a BrowserRouter.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
