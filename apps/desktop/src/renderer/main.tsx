import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DetachedRoot } from './detached/DetachedRoot';
// Subpath, not the barrel: the barrel re-exports core/signing.js (node:crypto),
// which Vite externalizes in the renderer.
import { registerArduDeckDialect } from '@ardudeck/mavlink-ts/dialect';
import { initI18n } from './i18n';
import { initPseudoTx } from './stores/pseudo-tx-store';
import { initVehicleProfiles } from './stores/vehicle-profile-store';
import { initVehicleCalibration } from './stores/vehicle-calibration-store';
import './styles/globals.css';

// Pop-out windows share this same renderer bundle/entry. The main window opens
// `index.html` with no query; detached pop-outs open it with `?detached=1&…`
// and the component-registry chooses what to render. This avoids a second Vite
// entry and keeps Zustand/Tailwind/etc. cached between windows.
// The inspector names and decodes messages straight from MESSAGE_REGISTRY, so the
// renderer needs the dialect too, not just the main process.
// i18next has to exist before the first render: components call `useTranslation`
// during it. `initI18n` also seeds the language from the fast-start mirror, and
// `initializeSettings` in App refreshes it once the settings file has loaded.
initI18n();
registerArduDeckDialect();
initVehicleProfiles();
initVehicleCalibration();

const params = new URLSearchParams(window.location.search);
const isDetached = params.get('detached') === '1';

// Every window, main and pop-out alike: the handset has to follow you into the popped-out
// 3D view, and only whichever window has focus gets to drive (see the store).
initPseudoTx();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDetached ? <DetachedRoot /> : <App />}
  </React.StrictMode>,
);

// Dev-only: initialize test driver IPC handlers (main window only — pop-outs
// don't need test driver hooks). Uses import.meta.env.DEV for Vite tree-shaking.
if (import.meta.env.DEV && !isDetached) {
  import('./testing/ipc-handlers');
}
