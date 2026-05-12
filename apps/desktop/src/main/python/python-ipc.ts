/**
 * IPC handlers and broadcast wiring for the Python Plugins subsystem.
 *
 * This module is the only place that touches `ipcMain` for Python; all the
 * other files in `apps/desktop/src/main/python/` are pure logic so they can
 * be unit-tested without an Electron context.
 */

import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  type PythonDetectResult,
  type PythonPluginEvent,
  type PythonPluginInstallProgress,
  type PythonPluginLogEvent,
  type PythonPluginStatusEvent,
  type PythonRpcParams,
} from '../../shared/python-plugin-types.js';
import { detectPython, clearPythonCache } from './python-detector.js';
import { importPluginFromFolder, pythonPluginRegistry } from './python-plugin-registry.js';

type PluginCommandRequest = {
  requestId: string;
  slug: string;
  command: string;
  payload: unknown;
};

const pendingCommandResults = new Map<
  string,
  { slug: string; command: string; startedAt: number }
>();

export function setupPythonIpc(mainWindow: BrowserWindow): void {
  // ---- broadcast wiring -----------------------------------------------------
  pythonPluginRegistry.on('status', (event: PythonPluginStatusEvent) => {
    safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_STATUS, event);
  });
  pythonPluginRegistry.on('log', (event: PythonPluginLogEvent) => {
    safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, event);
  });
  pythonPluginRegistry.on('event', (event: PythonPluginEvent) => {
    safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_EVENT, event);
  });
  pythonPluginRegistry.on('command', (evt: { slug: string; command: string; payload: unknown }) => {
    const requestId = `${evt.slug}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    pendingCommandResults.set(requestId, {
      slug: evt.slug,
      command: evt.command,
      startedAt: Date.now(),
    });
    const request: PluginCommandRequest = {
      requestId,
      slug: evt.slug,
      command: evt.command,
      payload: evt.payload,
    };
    safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_COMMAND_REQUEST, request);
    safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, {
      slug: evt.slug,
      level: 'info',
      message: `[command] request ${evt.command}`,
      timestamp: Date.now(),
    } satisfies PythonPluginLogEvent);
  });

  ipcMain.on(
    IPC_CHANNELS.PYTHON_PLUGIN_COMMAND_RESULT,
    (_event, result: { requestId: string; ok: boolean; error?: string }) => {
      const pending = pendingCommandResults.get(result.requestId);
      if (!pending) return;
      pendingCommandResults.delete(result.requestId);
      safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, {
        slug: pending.slug,
        level: result.ok ? 'info' : 'error',
        message: result.ok
          ? `[command] ${pending.command} executed (${Date.now() - pending.startedAt}ms)`
          : `[command] ${pending.command} failed: ${result.error ?? 'unknown error'}`,
        timestamp: Date.now(),
      } satisfies PythonPluginLogEvent);
    },
  );

  // Initial scan, fire-and-forget. Errors are surfaced via PYTHON_PLUGIN_STATUS.
  pythonPluginRegistry.refresh().catch((err) => {
    console.error('[PythonIPC] initial refresh failed:', err);
  });
  // Auto-start installed plugins that are ready for runtime.
  // This lets users keep using their plugin after app restart without
  // manually pressing "Start" every time.
  void autoStartReadyPlugins(mainWindow);

  // ---- request/response handlers -------------------------------------------
  ipcMain.handle(IPC_CHANNELS.PYTHON_DETECT, async (): Promise<PythonDetectResult> => {
    clearPythonCache();
    const interpreter = await detectPython();
    if (!interpreter) {
      return {
        ok: false,
        error: 'Python 3.10+ not found. Install Python and ensure it is on PATH, or set ARDUDECK_PYTHON.',
      };
    }
    return { ok: true, interpreter };
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_OPEN_DIR, async () => {
    const root = await pythonPluginRegistry.root();
    await shell.openPath(root);
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_REFRESH, async () => {
    return pythonPluginRegistry.refresh();
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_LIST, () => {
    return pythonPluginRegistry.list();
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_INSTALL, async (_, fromPath?: string) => {
    let sourceFolder = fromPath;
    if (!sourceFolder) {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Select a Python plugin folder',
        properties: ['openDirectory'],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { ok: false, error: 'cancelled' };
      }
      sourceFolder = picked.filePaths[0];
    }

    if (!sourceFolder) {
      return { ok: false, error: 'cancelled' };
    }

    try {
      const slug = await importPluginFromFolder(sourceFolder);
      await pythonPluginRegistry.install(
        slug,
        (level, line) => {
          const progress: PythonPluginInstallProgress = {
            slug,
            phase: 'pip',
            line,
            finished: false,
          };
          safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_INSTALL_PROGRESS, progress);
          safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, {
            slug,
            level,
            message: line,
            timestamp: Date.now(),
          } satisfies PythonPluginLogEvent);
        },
        (phase) => {
          const progress: PythonPluginInstallProgress = {
            slug,
            phase,
            finished: phase === 'done',
          };
          safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_INSTALL_PROGRESS, progress);
        },
      );
      return { ok: true, slug };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_UNINSTALL, async (_, slug: string) => {
    try {
      await pythonPluginRegistry.uninstall(slug);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_START, async (_, slug: string) => {
    try {
      const descriptor = await pythonPluginRegistry.start(slug);
      return { ok: true, descriptor };
    } catch (err) {
      console.log('err', err);
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PYTHON_PLUGIN_STOP, async (_, slug: string) => {
    try {
      await pythonPluginRegistry.stop(slug);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.PYTHON_PLUGIN_CALL,
    async (_, slug: string, method: string, params: PythonRpcParams) => {
      try {
        const result = await pythonPluginRegistry.call(slug, method, params);
        return { ok: true, result };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );
}

/** Stop all sidecars at app shutdown. Safe to call multiple times. */
export async function cleanupPythonPlugins(): Promise<void> {
  await pythonPluginRegistry.stopAll();
}

export function publishTelemetryToPythonPlugins(batch: unknown): void {
  pythonPluginRegistry.publishTelemetryBatch(batch);
}

function safeSend(window: BrowserWindow, channel: string, payload: unknown): void {
  if (window.isDestroyed()) return;
  window.webContents.send(channel, payload);
}

async function autoStartReadyPlugins(mainWindow: BrowserWindow): Promise<void> {
  try {
    const list = await pythonPluginRegistry.list();
    const candidates = list.filter(
      (p) => p.hasVenv && (p.status === 'ready' || p.status === 'stopped'),
    );
    for (const plugin of candidates) {
      try {
        await pythonPluginRegistry.start(plugin.slug);
        safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, {
          slug: plugin.slug,
          level: 'info',
          message: '[auto-start] plugin started on app launch',
          timestamp: Date.now(),
        } satisfies PythonPluginLogEvent);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        safeSend(mainWindow, IPC_CHANNELS.PYTHON_PLUGIN_LOG, {
          slug: plugin.slug,
          level: 'error',
          message: `[auto-start] failed: ${message}`,
          timestamp: Date.now(),
        } satisfies PythonPluginLogEvent);
      }
    }
  } catch (err) {
    console.error('[PythonIPC] auto-start failed:', err);
  }
}
