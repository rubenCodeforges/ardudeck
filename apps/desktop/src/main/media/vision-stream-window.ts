/**
 * Hidden window that renders the synthetic Vision view on its own and publishes
 * it. Capturing a panel of the main window also captured whatever sat on top of
 * it (map instruments, popovers); a window of its own has nothing else in it.
 */

import { BrowserWindow, type WebContents } from 'electron';
import { broadcast, loadRendererRoute, preloadPath, registerSecondaryWindow } from '../window-manager.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  IDLE_STREAM,
  VISION_STREAM_SIZE,
  type CanvasStreamSnapshot,
  type VisionStreamOpenOptions,
} from '../../shared/camera-types.js';
import { t } from '../../shared/i18n/index.js';

let win: BrowserWindow | null = null;
let snap: CanvasStreamSnapshot = IDLE_STREAM;

function publish(next: CanvasStreamSnapshot): void {
  snap = next;
  broadcast(IPC_CHANNELS.VISION_STREAM_CHANGED, snap);
}

export function visionStreamSnapshot(): CanvasStreamSnapshot {
  return snap;
}

export function openVisionStreamWindow(opts: VisionStreamOpenOptions): void {
  closeVisionStreamWindow();
  publish({ ...IDLE_STREAM, state: 'starting' });
  const w = new BrowserWindow({
    ...VISION_STREAM_SIZE,
    useContentSize: true,
    show: false,
    title: t('main:media.visionStreamTitle'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win = w;
  registerSecondaryWindow(w);
  const params = new URLSearchParams();
  params.set('detached', '1');
  params.set('componentId', 'vision-stream');
  params.set('title', t('main:media.visionStreamTitle'));
  params.set('props', JSON.stringify(opts));
  loadRendererRoute(w, params);
  w.webContents.on('render-process-gone', (_e, details) => {
    if (win !== w) return;
    publish({ ...IDLE_STREAM, state: 'error', error: `Stream renderer stopped (${details.reason})` });
    closeVisionStreamWindow(true);
  });
  w.on('closed', () => {
    if (win !== w) return;
    win = null;
    if (snap.state !== 'error') publish(IDLE_STREAM);
  });
}

/** `keepError` leaves a failure on screen after the window goes away. */
export function closeVisionStreamWindow(keepError = false): void {
  const w = win;
  win = null;
  if (w && !w.isDestroyed()) w.destroy();
  if (!keepError || snap.state !== 'error') publish(IDLE_STREAM);
}

/** Status from the stream window's renderer. A failure closes the window so nothing retries on its own. */
export function reportVisionStream(sender: WebContents, next: CanvasStreamSnapshot): void {
  if (!win || win.isDestroyed() || win.webContents.id !== sender.id) return;
  publish(next);
  if (next.state === 'error') closeVisionStreamWindow(true);
}
