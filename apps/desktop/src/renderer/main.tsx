import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Dev-only: initialize test driver IPC handlers
// Uses import.meta.env.DEV (not window.electronAPI.isDev) for Vite tree-shaking —
// production builds eliminate this entire branch and the testing module.
if (import.meta.env.DEV) {
  import('./testing/ipc-handlers');
}
