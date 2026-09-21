/**
 * Pseudo Transmitter Store
 *
 * A USB-connected handset (EdgeTX in "USB Joystick" mode) standing in for a real RC link, so
 * the screens that need a transmitter work with no flight controller and no receiver attached:
 * modes setup, quick setup, telemetry and the 3D view.
 *
 * Chromium already exposes the handset through the Gamepad API, so there is no native module,
 * no driver and no extra permission involved. Shaping lives in `utils/pseudo-tx.ts` and is
 * shared, in behaviour, with the simulator's own RC path so the two cannot disagree about
 * where centre is.
 *
 * The switch is AUTHORITATIVE. When it is on, the handset is the RC source, full stop - that is
 * what the label promises. An earlier version preferred flight-controller channels whenever any
 * were arriving, which quietly disabled the whole feature under SITL: the flight stack streams
 * RC_CHANNELS constantly, so the "live link" test was always true and the switch did nothing in
 * the one situation it exists for. Turning it on is an explicit choice; honour it.
 */

import { create } from 'zustand';
import {
  RC_CHANNEL_COUNT,
  RC_MID,
  type ChannelMap,
  type ChannelSource,
  type RawDevice,
  defaultMapping,
  detectMovedControl,
  devicesToChannels,
  looksLikeTransmitter,
  virtualChannels,
  mappingFromRcFunctions,
  DEFAULT_RC_FUNCTIONS,
  type RcFunctionMap,
} from '../utils/pseudo-tx';
import { packOverrideChannels } from '../utils/rc-vehicle-override';
import {
  claimRcOverride,
  releaseRcOverride,
  isTrainerActive,
  onTrainerActive,
  setTrainerActive,
} from '../utils/rc-source-arbiter';
import { useConnectionStore } from './connection-store';
import { useParameterStore } from './parameter-store';

/** 50 Hz, matching a real receiver's frame rate. */
const POLL_MS = 20;

let vehicleFrameCount = 0;
let vehicleFpsWindowStart = 0;

const EMPTY_DEVICE: RawDevice = { axes: [], buttons: [] };
const VIRTUAL_DEVICE_NAME = 'On-screen sticks';

/** RCMAP_* from the vehicle, so the sticks land on the channels it reads. */
function rcFunctionsFromParams(): RcFunctionMap {
  const p = useParameterStore.getState().parameters;
  const read = (name: string, fallback: number) => {
    const v = p.get(name)?.value;
    return typeof v === 'number' && v >= 1 ? v : fallback;
  };
  return {
    roll: read('RCMAP_ROLL', DEFAULT_RC_FUNCTIONS.roll),
    pitch: read('RCMAP_PITCH', DEFAULT_RC_FUNCTIONS.pitch),
    throttle: read('RCMAP_THROTTLE', DEFAULT_RC_FUNCTIONS.throttle),
    yaw: read('RCMAP_YAW', DEFAULT_RC_FUNCTIONS.yaw),
  };
}

/**
 * Shared across windows via localStorage, because every pop-out is a separate Electron
 * BrowserWindow with its OWN renderer process and therefore its own copy of this store.
 * Switching the handset on in the SITL tab has to reach the popped-out 3D view too, or that
 * window sits there with `enabled: false` and never streams anything.
 */
const ENABLED_KEY = 'ardudeck.pseudoTx.enabled';
const MAPPING_KEY = 'ardudeck.pseudoTx.mapping';

function readEnabledFlag(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEnabledFlag(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    // Private mode / storage disabled: the switch still works in this window.
  }
}

function readStoredMapping(): ChannelMap[] | null {
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const base = defaultMapping();
    return base.map((def, i) => {
      const m = parsed[i];
      if (!m || typeof m !== 'object') return def;
      return { ...def, ...(m as Partial<ChannelMap>) };
    });
  } catch {
    return null;
  }
}

function writeStoredMapping(mapping: ChannelMap[]): void {
  try {
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping));
  } catch {
    // Private mode / storage disabled: mapping just stays session-local.
  }
}

/**
 * The preload bridge, or undefined outside a renderer. Guarded so the store's logic stays
 * unit-testable in a plain node environment, where `window` does not exist at all.
 */
function api(): Window['electronAPI'] | undefined {
  return typeof window === 'undefined' ? undefined : window.electronAPI;
}

function readGamepad(
  index: number | null,
): { dev: RawDevice; id: string; index: number; mapping: string } | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => p != null);
  if (pads.length === 0) return null;
  const pad = (index != null && pads.find((p) => p.index === index)) || pads[0]!;
  return {
    dev: { axes: Array.from(pad.axes), buttons: pad.buttons.map((b) => b.pressed) },
    id: pad.id,
    index: pad.index,
    mapping: pad.mapping ?? '',
  };
}

interface PseudoTxState {
  /** User has switched the stand-in on. Off by default: it must never surprise anyone. */
  enabled: boolean;
  connected: boolean;
  deviceName: string;
  deviceIndex: number | null;
  /** Looks like a handset rather than a console pad. Advisory only. */
  isTransmitter: boolean;
  /**
   * Chromium's gamepad mapping mode. "standard" means it has forced the device into the
   * console-pad layout of 4 axes plus buttons, DISCARDING any further axes - which silently
   * hides every switch on a handset. Empty string means raw HID, which is what we want.
   */
  mappingMode: string;

  channels: number[];
  /**
   * On-screen stick axes in gamepad order [leftX, leftY, rightX, rightY], or
   * null when a physical device is the source. Fed through the same mapping
   * as a real pad so expo, deadband, reverse and channel assignment all apply.
   */
  virtualAxes: number[] | null;
  mapping: ChannelMap[];
  raw: RawDevice;

  /** Set when RC frames are not reaching SITL. */
  sendError: string | null;
  /** Frames actually handed to the bridge. Zero while 'on' means the chain is broken. */
  sentFrames: number;

  // Session-only by design (commands real aircraft): never persisted, never auto re-engaged.
  vehicleControl: boolean;
  /** Switch to on-screen sticks (axes) or back to a physical pad (null). */
  setVirtualAxes: (axes: number[] | null) => void;
  vehicleSendError: string | null;
  /** Override frames the vehicle acknowledged in the last second. */
  vehicleFps: number;

  /** Channel currently being taught by wiggling a control, or null. */
  learning: number | null;
  learnBaseline: RawDevice | null;

  pollTimer: ReturnType<typeof setInterval> | null;

  enable: () => void;
  disable: () => void;
  enableVehicleControl: () => { ok: boolean; reason?: string };
  disableVehicleControl: () => void;
  poll: () => void;
  startLearn: (channel: number) => void;
  cancelLearn: () => void;
  setSource: (channel: number, source: ChannelSource) => void;
  updateMap: (channel: number, patch: Partial<ChannelMap>) => void;
  resetMapping: () => void;
}

export const usePseudoTxStore = create<PseudoTxState>((set, get) => ({
  enabled: false,
  connected: false,
  deviceName: '',
  deviceIndex: null,
  isTransmitter: false,
  mappingMode: '',
  channels: Array(RC_CHANNEL_COUNT).fill(RC_MID),
  virtualAxes: null,
  mapping: readStoredMapping() ?? defaultMapping(),
  raw: EMPTY_DEVICE,
  sendError: null,
  sentFrames: 0,
  vehicleControl: false,
  vehicleSendError: null,
  vehicleFps: 0,
  learning: null,
  learnBaseline: null,
  pollTimer: null,

  enable: () => {
    writeEnabledFlag(true);
    if (get().pollTimer) return;
    const timer = setInterval(() => get().poll(), POLL_MS);
    set({ enabled: true, pollTimer: timer });
    // Feed SITL from the SAME timer that reads the handset.
    //
    // This used to live in a React effect inside the panel, which meant the stream only ran
    // while that panel happened to be mounted: switch it on from the Receiver tab, walk over
    // to telemetry, the component unmounted and the sticks stopped arriving. SITL then kept
    // seeing `ardupilotRcSender`'s safe default of throttle -1, which is why the aircraft
    // ARMED with the throttle stick at 100% - proof the handset was never reaching it.
    void api()?.ardupilotSitlRcStart?.().catch(() => {});
  },

  disable: () => {
    get().disableVehicleControl();
    writeEnabledFlag(false);
    const { pollTimer } = get();
    if (pollTimer) clearInterval(pollTimer);
    // Hand SITL back to its own safe defaults rather than leaving the last stick values latched.
    void api()?.ardupilotSitlRcStop?.().catch(() => {});
    set({
      enabled: false,
      pollTimer: null,
      connected: false,
      learning: null,
      learnBaseline: null,
      channels: Array(RC_CHANNEL_COUNT).fill(RC_MID),
    });
  },

  enableVehicleControl: () => {
    if (get().vehicleControl) return { ok: true };
    const { connectionState } = useConnectionStore.getState();
    if (!get().enabled) return { ok: false, reason: 'Switch the USB transmitter on first' };
    if (!connectionState.isConnected || connectionState.protocol !== 'mavlink') {
      return { ok: false, reason: 'Needs a connected MAVLink vehicle' };
    }
    const claim = claimRcOverride('joystick');
    if (!claim.ok) return { ok: false, reason: claim.reason };
    vehicleFrameCount = 0;
    vehicleFpsWindowStart = 0;
    set({ vehicleControl: true, vehicleSendError: null, vehicleFps: 0 });
    return { ok: true };
  },

  disableVehicleControl: () => {
    if (!get().vehicleControl) return;
    releaseRcOverride('joystick');
    set({ vehicleControl: false, vehicleFps: 0 });
    // Explicit release so the vehicle reverts to its own RC instead of holding
    // the last stick frame until ArduPilot's override timeout.
    void api()?.rcOverrideRelease?.().catch(() => {});
  },

  setVirtualAxes: (axes) => {
    if (axes === null) {
      // Leaving the on-screen sticks must not leave the vehicle holding the
      // last commanded position: drop control and let the poll re-detect.
      if (get().vehicleControl) get().disableVehicleControl();
      set({ virtualAxes: null, connected: false, deviceName: '', deviceIndex: null });
      return;
    }
    set({ virtualAxes: axes });
  },

  poll: () => {
    const { learning, learnBaseline, deviceIndex, virtualAxes } = get();

    // On-screen sticks stand in for the device, but they do NOT go through the
    // learned pad mapping: a pad needs one because its axis order is arbitrary,
    // while here we know which pad is throttle and the FC publishes which
    // channel each function lives on.
    const read = virtualAxes
      ? { dev: { axes: virtualAxes, buttons: [] as boolean[] }, id: VIRTUAL_DEVICE_NAME, index: -1, mapping: 'virtual' }
      : readGamepad(deviceIndex);
    if (!read) {
      // No sticks means no valid override frames: release the vehicle immediately.
      if (get().vehicleControl) get().disableVehicleControl();
      if (get().connected) set({ connected: false, deviceName: '' });
      return;
    }
    const { dev, id, index, mapping } = read;

    if (!get().connected || get().deviceIndex !== index) {
      const isTx = looksLikeTransmitter(id, dev.axes.length);
      set({
        connected: true,
        deviceName: id,
        deviceIndex: index,
        mappingMode: mapping,
        isTransmitter: isTx,
      });
      // Nothing taught yet and a console pad in hand: the vehicle already says
      // which channel each stick belongs on, so there is nothing to ask for.
      // A handset is left alone because it streams channels in order.
      if (!isTx && !virtualAxes && readStoredMapping() === null) {
        set({ mapping: mappingFromRcFunctions(rcFunctionsFromParams()) });
      }
    }

    // Teaching a channel: watch for a control that moves clearly away from its rest state.
    if (learning != null && learnBaseline) {
      const found = detectMovedControl(learnBaseline, dev);
      if (found) {
        get().setSource(learning, found);
        set({ learning: null, learnBaseline: null });
      }
    }

    // Read the mapping AFTER any learn above, not from the snapshot taken at entry: a channel
    // taught this tick must respond on this tick, not on the next one.
    const ch = virtualAxes
      ? virtualChannels(virtualAxes, rcFunctionsFromParams())
      : devicesToChannels(dev, get().mapping);
    set({ raw: dev, channels: ch });

    // Only the FOCUSED window may send.
    //
    // Chromium refreshes gamepad state for the focused document only. Every window runs this
    // poll (they are separate renderer processes), so an unfocused one keeps reading the axes
    // frozen at whatever they were when it lost focus. Letting it send too would interleave
    // stale frames with live ones at 50Hz. This is why the sticks died the moment the 3D view
    // was popped out: the main window still held the switch, but no longer the gamepad.
    if (typeof document !== 'undefined' && !document.hasFocus()) return;

    // The Trainer owns the sticks while it runs: keep reading (local screens
    // stay live) but put nothing on the wire, SITL or vehicle.
    if (isTrainerActive()) return;

    // SITL takes -1..1 per channel, not microseconds.
    const n = (pwm: number) => Math.min(1, Math.max(-1, (pwm - 1500) / 500));
    const bridge = api();
    // Say so LOUDLY if the bridge is missing. Optional chaining here silently does nothing,
    // which is how this shipped looking connected while sending absolutely nothing.
    if (!bridge?.ardupilotSitlRcSend) {
      if (!get().sendError) {
        set({ sendError: 'No SITL RC bridge in this window - frames are going nowhere' });
      }
      return;
    }
    set({ sentFrames: get().sentFrames + 1, sendError: null });
    void bridge.ardupilotSitlRcSend({
      roll: n(ch[0] ?? 1500),
      pitch: n(ch[1] ?? 1500),
      throttle: n(ch[2] ?? 1000),
      yaw: n(ch[3] ?? 1500),
      aux1: n(ch[4] ?? 1500),
      aux2: n(ch[5] ?? 1500),
      aux3: n(ch[6] ?? 1500),
      aux4: n(ch[7] ?? 1500),
    }).catch((e: unknown) => {
      set({ sendError: `SITL rejected RC: ${String(e)}` });
    });

    if (get().vehicleControl) {
      const { connectionState } = useConnectionStore.getState();
      if (!connectionState.isConnected || connectionState.protocol !== 'mavlink') {
        get().disableVehicleControl();
        set({ vehicleSendError: 'Vehicle link lost - joystick control released' });
        return;
      }
      const packed = packOverrideChannels(ch, get().mapping);
      const now = Date.now();
      if (vehicleFpsWindowStart === 0) vehicleFpsWindowStart = now;
      void bridge.rcOverrideSetChannels?.(packed).then((r) => {
        if (r && r.success === false) {
          set({ vehicleSendError: r.error ?? 'Override rejected by the link' });
          return;
        }
        vehicleFrameCount++;
        if (now - vehicleFpsWindowStart >= 1000) {
          set({ vehicleFps: vehicleFrameCount, vehicleSendError: null });
          vehicleFrameCount = 0;
          vehicleFpsWindowStart = now;
        } else if (get().vehicleSendError) {
          set({ vehicleSendError: null });
        }
      }).catch((e: unknown) => {
        set({ vehicleSendError: String(e) });
      });
    }
  },

  startLearn: (channel) => {
    const read = readGamepad(get().deviceIndex);
    set({ learning: channel, learnBaseline: read ? read.dev : EMPTY_DEVICE });
  },

  cancelLearn: () => set({ learning: null, learnBaseline: null }),

  setSource: (channel, source) => {
    const mapping = [...get().mapping];
    const cur = mapping[channel];
    if (!cur) return;
    mapping[channel] = { ...cur, source };
    set({ mapping });
    writeStoredMapping(mapping);
  },

  updateMap: (channel, patch) => {
    const mapping = [...get().mapping];
    const cur = mapping[channel];
    if (!cur) return;
    mapping[channel] = { ...cur, ...patch };
    set({ mapping });
    writeStoredMapping(mapping);
  },

  resetMapping: () => {
    // A handset streams its channels in order, so identity is right for it. A
    // console pad uses the stick convention, so place it by the vehicle's
    // RCMAP. With nothing plugged in yet we cannot tell, so keep identity and
    // let the connect path place a pad when one shows up.
    const mapping = get().connected && !get().isTransmitter
      ? mappingFromRcFunctions(rcFunctionsFromParams())
      : defaultMapping();
    set({ mapping });
    writeStoredMapping(mapping);
  },
}));

// Trainer preemption: release the vehicle (not just stop sending), and never
// re-engage on trainer exit; the user must arm the opt-in again themselves.
onTrainerActive((active) => {
  if (active) usePseudoTxStore.getState().disableVehicleControl();
});

/**
 * Join the handset to this window. Call once per renderer, from the entry point.
 *
 * Pop-outs boot the same bundle in a fresh renderer process, so without this the popped-out 3D
 * view would never poll at all - it would have no idea the switch was ever thrown.
 */
export function initPseudoTx(): void {
  if (typeof window === 'undefined') return;

  if (readEnabledFlag()) usePseudoTxStore.getState().enable();

  void window.electronAPI?.trainerSessionActive?.().then((active) => setTrainerActive(active));
  window.electronAPI?.onTrainerSession?.((active) => setTrainerActive(active));

  window.addEventListener('beforeunload', () => {
    if (usePseudoTxStore.getState().vehicleControl) {
      void window.electronAPI?.rcOverrideRelease?.().catch(() => {});
    }
  });

  window.addEventListener('storage', (e) => {
    if (e.key === MAPPING_KEY) {
      const stored = readStoredMapping();
      if (stored) usePseudoTxStore.setState({ mapping: stored });
      return;
    }
    if (e.key !== ENABLED_KEY) return;
    const s = usePseudoTxStore.getState();
    const on = e.newValue === '1';
    if (on && !s.enabled) s.enable();
    else if (!on && s.enabled) s.disable();
  });
}

/**
 * RC in the shape the telemetry screens already consume.
 *
 * The switch wins when it is on, including against a live flight controller or SITL: the user
 * asked for the handset. `rssi` is reported as 0 for the stand-in because there is no radio
 * involved and inventing a signal strength on a diagnostics screen would be a lie.
 *
 * A hook rather than a plain read so the OSD live panel, the flight-modes tab, the receiver tab
 * and the 3D view re-render as the sticks move.
 */
export function useEffectiveRc(fc: { channels: number[]; chancount: number; rssi: number }): {
  channels: number[];
  chancount: number;
  rssi: number;
  source: 'fc' | 'pseudo' | 'none';
} {
  const enabled = usePseudoTxStore((s) => s.enabled);
  const connected = usePseudoTxStore((s) => s.connected);
  const channels = usePseudoTxStore((s) => s.channels);

  if (enabled && connected) {
    return { channels, chancount: channels.length, rssi: 0, source: 'pseudo' };
  }
  const live = fc.channels.length > 0 && fc.channels.some((c) => c > 0);
  return { ...fc, source: live ? 'fc' : 'none' };
}

/**
 * RC channels for a consumer to display.
 *
 * The switch wins when it is on. Under SITL the flight stack always streams RC_CHANNELS, so a
 * "prefer whatever the FC sends" rule would permanently shadow the handset - which is the bug
 * this ordering exists to avoid.
 */
export function preferredRcChannels(fcChannels: number[] | undefined): {
  channels: number[];
  source: 'fc' | 'pseudo' | 'none';
} {
  const { enabled, connected, channels } = usePseudoTxStore.getState();
  if (enabled && connected) return { channels, source: 'pseudo' };

  const live = fcChannels && fcChannels.length > 0 && fcChannels.some((c) => c > 0);
  if (live) return { channels: fcChannels!, source: 'fc' };

  return { channels: fcChannels ?? [], source: 'none' };
}

// A hot update leaves the old interval running against the old store, so the
// sticks keep being written by code that no longer exists. Tear it down and
// let the next module instance start its own.
import.meta.hot?.dispose(() => {
  const t = usePseudoTxStore.getState().pollTimer;
  if (t) clearInterval(t);
});
