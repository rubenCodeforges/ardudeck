/**
 * ntrip-ipc-handlers (issue #60): wires the NtripClient to Electron. Config
 * lives in its own electron-store; the caster password lives in the encrypted
 * API-key store under service 'ntrip' (renderer saves it via the existing
 * setApiKey bridge). RTCM frames are fragmented here and handed to the
 * injection callback provided by ipc-handlers, which owns the MAVLink link.
 *
 * Ownership seam: when the multi-vehicle engine (orchestrator) is connected,
 * the ORCHESTRATOR owns the NTRIP client end to end - it injects corrections
 * into every vehicle, and exactly one injector may own RTCM per vehicle
 * (GPS_RTCM_DATA reassembly keys on the sequence + fragment ids, so two
 * senders interleaving corrupts it). This module then only relays config and
 * status over the engine's control channel; the local client stays for direct
 * single-vehicle links and is force-disconnected when the engine takes over.
 */

import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  DEFAULT_NTRIP_CONFIG,
  INITIAL_NTRIP_STATUS,
  type NtripConfig,
  type NtripSourcetableResult,
  type NtripStatus,
} from '../../shared/ntrip-types.js';
import type { GpsData } from '../../shared/telemetry-types.js';
import { getApiKey } from '../overlays/overlay-ipc-handlers.js';
import { NtripClient, fetchSourcetable } from './ntrip-client.js';
import { buildGgaSentence } from './gga.js';
import { fragmentRtcm, type RtcmInjectFragment } from './rtcm.js';

interface NtripStoreSchema {
  config: NtripConfig;
}

const configStore = new Store<NtripStoreSchema>({
  name: 'ntrip',
  defaults: { config: DEFAULT_NTRIP_CONFIG },
});

function loadConfig(): NtripConfig {
  return { ...DEFAULT_NTRIP_CONFIG, ...configStore.get('config') };
}

export interface NtripHandlerDeps {
  /** Serialize + send one GPS_RTCM_DATA to the vehicle. False = not sent. */
  sendGpsRtcm: (fragment: RtcmInjectFragment) => Promise<boolean>;
  /** Fresh vehicle GPS for GGA upload, or null when unavailable/stale. */
  getGgaPosition: () => GpsData | null;
}

/**
 * The orchestrator end of the seam: how this module drives the engine's NTRIP
 * client over the control channel. Registered by ipc-handlers when the
 * orchestration link opens, cleared when it closes.
 */
export interface NtripOrchestratorRemote {
  connect: (config: NtripConfig, password: string) => void;
  disconnect: () => void;
  requestStatus: () => void;
  fetchSourcetable: (config: NtripConfig, password: string) => Promise<NtripSourcetableResult>;
}

let client: NtripClient | null = null;
/** Non-null while an orchestration link is up: the engine owns NTRIP. */
let remote: NtripOrchestratorRemote | null = null;
/** Latest status pushed by the engine's client, served while remote owns it. */
let remoteStatus: NtripStatus = { ...INITIAL_NTRIP_STATUS, rtcmTypeCounts: {}, owner: 'orchestrator' };
/** GPS_RTCM_DATA sequence id, incremented per RTCM message (5 bits). */
let rtcmSequence = 0;
/** Serializes injection so fragments of consecutive frames don't interleave. */
let injectChain: Promise<void> = Promise.resolve();

function pushStatus(status: NtripStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.NTRIP_STATUS, status);
  }
}

/**
 * Hand NTRIP ownership to the engine (or back). Called by ipc-handlers when
 * the orchestration link opens/closes. Taking ownership force-disconnects a
 * streaming local client: one injector per vehicle, no exceptions.
 */
export function setNtripOrchestrator(r: NtripOrchestratorRemote | null): void {
  remote = r;
  remoteStatus = { ...INITIAL_NTRIP_STATUS, rtcmTypeCounts: {}, owner: 'orchestrator' };
  if (r) {
    const local = client?.getStatus();
    if (local && local.state !== 'disconnected' && local.state !== 'error') {
      client?.disconnect();
    }
    r.requestStatus();
  } else {
    // Engine gone: the panel falls back to the local client's view.
    if (client) pushStatus({ ...client.getStatus(), owner: 'local' });
  }
}

/** Status push from the engine's NTRIP client, relayed by ipc-handlers. */
export function pushOrchestratorNtripStatus(status: NtripStatus): void {
  remoteStatus = { ...status, owner: 'orchestrator' };
  pushStatus(remoteStatus);
}

export function setupNtripHandlers(_mainWindow: BrowserWindow, deps: NtripHandlerDeps): void {
  client = new NtripClient({
    getPassword: () => getApiKey('ntrip') ?? '',
    getGga: () => {
      const gps = deps.getGgaPosition();
      return gps ? buildGgaSentence(gps) : null;
    },
    onRtcmFrame: (frame) => {
      const fragments = fragmentRtcm(frame.bytes, rtcmSequence++);
      const c = client;
      if (fragments.length === 0) {
        // Oversize for the 4-fragment GPS_RTCM_DATA envelope; should not
        // happen with standard RTCM3 correction messages.
        c?.noteInjection(false);
        return;
      }
      injectChain = injectChain.then(async () => {
        let ok = true;
        for (const fragment of fragments) {
          try {
            if (!(await deps.sendGpsRtcm(fragment))) ok = false;
          } catch {
            ok = false;
          }
        }
        c?.noteInjection(ok);
      });
    },
    // While the engine owns NTRIP the local client is inert; suppress its
    // pushes so a trailing 'disconnected' cannot clobber the engine's status.
    onStatus: (status) => {
      if (!remote) pushStatus({ ...status, owner: 'local' });
    },
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_GET_CONFIG, () => loadConfig());

  ipcMain.handle(IPC_CHANNELS.NTRIP_SET_CONFIG, (_e, config: NtripConfig) => {
    configStore.set('config', { ...loadConfig(), ...config });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_CONNECT, () => {
    const config = loadConfig();
    if (remote) {
      if (!config.host) return { success: false, error: 'Caster host is not set' };
      if (!config.mountpoint) return { success: false, error: 'Mountpoint is not set' };
      remote.connect(config, getApiKey('ntrip') ?? '');
      return { success: true };
    }
    rtcmSequence = 0;
    return client!.connect(config);
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_DISCONNECT, () => {
    if (remote) {
      remote.disconnect();
      return;
    }
    client?.disconnect();
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_GET_STATUS, (): NtripStatus => {
    if (remote) return remoteStatus;
    return { ...client!.getStatus(), owner: 'local' };
  });

  ipcMain.handle(
    IPC_CHANNELS.NTRIP_GET_SOURCETABLE,
    (): Promise<NtripSourcetableResult> => {
      const password = getApiKey('ntrip') ?? '';
      if (remote) return remote.fetchSourcetable(loadConfig(), password);
      return fetchSourcetable(loadConfig(), password);
    },
  );
}

/** Drop the caster connection on app shutdown. */
export function cleanupNtrip(): void {
  client?.disconnect();
}
