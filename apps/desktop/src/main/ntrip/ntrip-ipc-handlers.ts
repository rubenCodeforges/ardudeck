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
import type { SerialPortInfo } from '@ardudeck/comms';
import { getApiKey } from '../overlays/overlay-ipc-handlers.js';
import { NtripClient, fetchSourcetable } from './ntrip-client.js';
import { LocalBaseSource } from './local-base-source.js';
import { buildGgaSentence } from './gga.js';
import { fragmentRtcm, type RtcmFrame, type RtcmInjectFragment } from './rtcm.js';
import { t } from '../../shared/i18n/index.js';

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
  /** Serial ports free for the local base picker (MAVLink-occupied excluded). */
  listAvailableSerialPorts: () => Promise<SerialPortInfo[]>;
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
let localBase: LocalBaseSource | null = null;
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
    // Same invariant for the serial base: one injector per vehicle.
    if (localBase?.isStreaming()) localBase.disconnect();
    r.requestStatus();
  } else {
    // Engine gone: the panel falls back to the active local source's view.
    const source = activeLocalSource();
    if (source) pushStatus({ ...source.getStatus(), owner: 'local' });
  }
}

/** The provider the persisted source setting points at ('ntrip' or 'serial'). */
function activeLocalSource(): NtripClient | LocalBaseSource | null {
  return loadConfig().source === 'serial' ? localBase : client;
}

/** Status push from the engine's NTRIP client, relayed by ipc-handlers. */
export function pushOrchestratorNtripStatus(status: NtripStatus): void {
  remoteStatus = { ...status, owner: 'orchestrator' };
  pushStatus(remoteStatus);
}

export function setupNtripHandlers(_mainWindow: BrowserWindow, deps: NtripHandlerDeps): void {
  // One injector for both sources: sequence + chain are per-vehicle state.
  const injectFrame = (frame: RtcmFrame, note: (ok: boolean) => void) => {
    const fragments = fragmentRtcm(frame.bytes, rtcmSequence++);
    if (fragments.length === 0) {
      // Oversize for the 4-fragment GPS_RTCM_DATA envelope; should not
      // happen with standard RTCM3 correction messages.
      note(false);
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
      note(ok);
    });
  };
  // While the engine owns NTRIP the local sources are inert; suppress their
  // pushes so a trailing 'disconnected' cannot clobber the engine's status.
  const pushLocalStatus = (status: NtripStatus) => {
    if (!remote) pushStatus({ ...status, owner: 'local' });
  };

  client = new NtripClient({
    getPassword: () => getApiKey('ntrip') ?? '',
    getGga: () => {
      const gps = deps.getGgaPosition();
      return gps ? buildGgaSentence(gps) : null;
    },
    onRtcmFrame: (frame) => injectFrame(frame, (ok) => client?.noteInjection(ok)),
    onStatus: pushLocalStatus,
  });

  localBase = new LocalBaseSource({
    onRtcmFrame: (frame) => injectFrame(frame, (ok) => localBase?.noteInjection(ok)),
    onStatus: pushLocalStatus,
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_GET_CONFIG, () => loadConfig());

  ipcMain.handle(IPC_CHANNELS.NTRIP_LIST_SERIAL_PORTS, () => deps.listAvailableSerialPorts());

  ipcMain.handle(IPC_CHANNELS.NTRIP_SET_CONFIG, (_e, config: NtripConfig) => {
    configStore.set('config', { ...loadConfig(), ...config });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_CONNECT, () => {
    const config = loadConfig();
    if (config.source === 'serial') {
      if (remote) {
        // Two injectors interleaving GPS_RTCM_DATA sequences corrupts reassembly.
        return {
          success: false,
          error: 'The multi-vehicle engine owns RTK corrections while connected. Local base injection through the engine is not supported yet; use an NTRIP caster or stop the engine.',
        };
      }
      client?.disconnect();
      rtcmSequence = 0;
      return localBase!.connect(config);
    }
    if (remote) {
      if (!config.host) return { success: false, error: t('main:ntrip.hostNotSet') };
      if (!config.mountpoint) return { success: false, error: t('main:ntrip.mountpointNotSet') };
      remote.connect(config, getApiKey('ntrip') ?? '');
      return { success: true };
    }
    localBase?.disconnect();
    rtcmSequence = 0;
    return client!.connect(config);
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_DISCONNECT, () => {
    if (remote) {
      remote.disconnect();
      return;
    }
    client?.disconnect();
    localBase?.disconnect();
  });

  ipcMain.handle(IPC_CHANNELS.NTRIP_GET_STATUS, (): NtripStatus => {
    if (remote) return remoteStatus;
    const source = activeLocalSource() ?? client!;
    return { ...source.getStatus(), owner: 'local' };
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

/** Drop the caster/base connection on app shutdown. */
export function cleanupNtrip(): void {
  client?.disconnect();
  localBase?.disconnect();
}
