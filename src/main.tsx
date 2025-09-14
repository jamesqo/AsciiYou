import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '@/App'
import { StoreProvider } from '@/stores/StoreContext'

const rootEl = document.getElementById('root')!
createRoot(rootEl).render(
// Disable strict mode for now because it doesn't play nice with the webcam feed
//   <React.StrictMode>
//     <StoreProvider><App /></StoreProvider>
//   </React.StrictMode>
    <StoreProvider><App /></StoreProvider>
)
