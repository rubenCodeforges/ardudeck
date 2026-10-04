/**
 * Voice announcer: speaks flight events through the same ElevenLabs phrase
 * set the EdgeTX widget ships (one voice everywhere). NO OS/browser TTS,
 * ever - if a phrase is missing, extend PHRASES in generate-hud-voice.mjs
 * and regenerate; until then the fallback is a severity tone, not a
 * different voice. Subscribes to the shared telemetry stores (= active
 * vehicle) outside React; init once from App.
 */
import { useTelemetryStore } from '../stores/telemetry-store';
import { useMessagesStore } from '../stores/messages-store';
import { useConnectionStore } from '../stores/connection-store';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { useSettingsStore } from '../stores/settings-store';
import { useMissionStore } from '../stores/mission-store';

/** Statustext substrings -> phrase wav (first hit wins, case-insensitive).
 *  Mirrors MSG_SOUNDS in the widget's loadable.lua. */
const MSG_SOUNDS: Array<[string, string]> = [
  ['prearm', 'arm_denied'],
  ['autotune: success', 'autotune_done'],
  ['autotune: failed', 'autotune_failed'],
  ['gps glitch', 'gps_glitch'],
  ['glitch cleared', 'glitch_cleared'],
  ['variance', 'ekf_variance'],
  ['is using gps', 'ekf_using_gps'],
  ['ekf primary changed', 'ekf_lane'],
  ['yaw alignment complete', 'yaw_aligned'],
  ['yaw re-aligned', 'yaw_aligned'],
  ['radio failsafe', 'rc_failsafe'],
  ['crash: disarming', 'crash'],
  ['terrain data missing', 'terrain_missing'],
  ['mission complete', 'mission_complete'],
  ['vibration compensation on', 'high_vibe'],
  ['set home', 'home_set'],
  ['ence breach', 'fence_breach'],
  ['is low', 'batt_low'],
  ['is critical', 'batt_crit'],
];

/** Mode name -> phrase wav. Keyed by NAME (not number) so plane/rover modes
 *  that share a copter mode's name reuse its recording. */
const MODE_WAVS: Record<string, string> = {
  'STABILIZE': 'mode_0', 'ACRO': 'mode_1', 'ALT HOLD': 'mode_2',
  'ALTHOLD': 'mode_2', 'AUTO': 'mode_3', 'GUIDED': 'mode_4',
  'LOITER': 'mode_5', 'RTL': 'mode_6', 'CIRCLE': 'mode_7', 'LAND': 'mode_9',
  'DRIFT': 'mode_11', 'SPORT': 'mode_13', 'FLIP': 'mode_14',
  'AUTOTUNE': 'mode_15', 'POSHOLD': 'mode_16', 'POS HOLD': 'mode_16',
  'BRAKE': 'mode_17', 'THROW': 'mode_18', 'GUIDED NOGPS': 'mode_20',
  'SMART RTL': 'mode_21', 'SMARTRTL': 'mode_21', 'FLOWHOLD': 'mode_22',
  'ZIGZAG': 'mode_24', 'AUTO RTL': 'mode_27',
  // plane
  'MANUAL': 'mode_manual', 'TRAINING': 'mode_training', 'FBWA': 'mode_fbwa',
  'FBWB': 'mode_fbwb', 'CRUISE': 'mode_cruise', 'TAKEOFF': 'mode_takeoff',
  'THERMAL': 'mode_thermal', 'QSTABILIZE': 'mode_qstabilize',
  'QHOVER': 'mode_qhover', 'QLOITER': 'mode_qloiter', 'QLAND': 'mode_qland',
  'QRTL': 'mode_qrtl', 'QACRO': 'mode_qacro',
  // rover
  'STEERING': 'mode_steering', 'HOLD': 'mode_hold', 'FOLLOW': 'mode_follow',
  'SIMPLE': 'mode_simple', 'DOCK': 'mode_dock',
};

interface QueueItem {
  wav?: string;
  /** beeps if the wav is missing/not yet generated - never OS speech */
  tone?: 'warn' | 'error' | 'crit';
  critical?: boolean;
  /** dedupe key */
  key: string;
}

let started = false;
let ctx: AudioContext | null = null;
const bufferCache = new Map<string, AudioBuffer | null>();
const queue: QueueItem[] = [];
let playing = false;
const lastSpokenAt = new Map<string, number>();
const DEDUPE_MS = 4000;

function muted(): boolean {
  return useSettingsStore.getState().voiceAlertsMuted;
}

function linkUp(): boolean {
  const conn = useConnectionStore.getState().connectionState;
  if (conn.isConnected) return true;
  return Object.keys(useActiveVehicleStore.getState().knownVehicles).length > 0;
}

/**
 * Hand-rolled PCM16 WAV -> AudioBuffer. NEVER use decodeAudioData here:
 * with contextIsolation it segfaults the renderer while detaching the
 * input buffer (DOMDataStore::GetWrapper null deref, proven on Electron
 * 28 with a minimal repro; this crashed the app in a reload loop).
 */
function wavToAudioBuffer(bytes: Uint8Array, audioCtx: AudioContext): AudioBuffer | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44) return null;
  if (dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null; // RIFF...WAVE
  let pos = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataOfs = -1;
  let dataLen = 0;
  while (pos + 8 <= bytes.byteLength) {
    const id = dv.getUint32(pos, false);
    const size = dv.getUint32(pos + 4, true);
    if (id === 0x666d7420) { // 'fmt '
      channels = dv.getUint16(pos + 10, true);
      sampleRate = dv.getUint32(pos + 12, true);
      bits = dv.getUint16(pos + 22, true);
    } else if (id === 0x64617461) { // 'data'
      dataOfs = pos + 8;
      dataLen = size;
    }
    pos += 8 + size + (size & 1);
  }
  if (dataOfs < 0 || channels < 1 || bits !== 16 || sampleRate < 8000) return null;
  dataLen = Math.min(dataLen, bytes.byteLength - dataOfs);
  const frames = Math.floor(dataLen / 2 / channels);
  if (frames <= 0) return null;
  const out = audioCtx.createBuffer(channels, frames, sampleRate);
  for (let c = 0; c < channels; c++) {
    const ch = out.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      ch[i] = dv.getInt16(dataOfs + (i * channels + c) * 2, true) / 32768;
    }
  }
  return out;
}

async function getBuffer(name: string): Promise<AudioBuffer | null> {
  if (bufferCache.has(name)) return bufferCache.get(name)!;
  let buf: AudioBuffer | null = null;
  try {
    const data = await window.electronAPI?.voiceGetWav?.(name);
    if (data && ctx) buf = wavToAudioBuffer(data, ctx);
  } catch { /* missing phrase falls back to TTS at the call site */ }
  bufferCache.set(name, buf);
  return buf;
}

function playWav(buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx) return resolve();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => resolve();
    src.start();
  });
}

/** Severity beeps for phrases with no recording yet: 1x warn, 2x error,
 *  3x critical. Pure oscillator - the one thing that is NOT a voice. */
function playTone(kind: 'warn' | 'error' | 'crit'): Promise<void> {
  return new Promise((resolve) => {
    if (!ctx) return resolve();
    const count = kind === 'crit' ? 3 : kind === 'error' ? 2 : 1;
    const freq = kind === 'warn' ? 988 : 1319;
    const t0 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.25;
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t0 + i * 0.22);
      osc.stop(t0 + i * 0.22 + 0.15);
    }
    setTimeout(resolve, count * 220 + 50);
  });
}

async function playNext(): Promise<void> {
  if (playing) return;
  const item = queue.shift();
  if (!item) return;
  if (muted()) { queue.length = 0; return; }
  playing = true;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const buffer = item.wav ? await getBuffer(item.wav) : null;
    if (buffer) await playWav(buffer);
    else if (item.tone) await playTone(item.tone);
  } finally {
    playing = false;
    if (queue.length > 0) void playNext();
  }
}

function announce(item: QueueItem): void {
  if (muted() || !linkUp()) return;
  const now = Date.now();
  // dedupe by event key AND by wav: the same phrase can arrive from two
  // sources (battery threshold + FC failsafe statustext, GPS transition +
  // glitch statustext) and back-to-back repeats read as an echo
  const last = lastSpokenAt.get(item.key) ?? 0;
  const lastWav = item.wav ? (lastSpokenAt.get(`wav:${item.wav}`) ?? 0) : 0;
  if (now - last < DEDUPE_MS || now - lastWav < DEDUPE_MS) return;
  lastSpokenAt.set(item.key, now);
  if (item.wav) lastSpokenAt.set(`wav:${item.wav}`, now);
  if (item.critical) {
    // criticals flush routine chatter and jump the queue
    queue.length = 0;
    queue.unshift(item);
  } else {
    if (queue.length >= 5) return; // never build a backlog of stale phrases
    queue.push(item);
  }
  void playNext();
}

function modeItem(mode: string): QueueItem {
  const wav = MODE_WAVS[mode.toUpperCase().replace(/_/g, ' ')] ?? 'mode_changed';
  return { wav, key: `mode:${mode}` };
}

/**
 * A whole number as a list of phrase wavs (English), composed from the small
 * number set: 0-20 + tens + "hundred". Covers 0-999 with real words; above
 * that, falls back to digit-by-digit (always available). e.g. 123 ->
 * [num_1, num_hundred, num_20, num_3].
 */
function numberToWavs(n: number): string[] {
  if (n < 0 || !Number.isFinite(n)) return [];
  n = Math.floor(n);
  if (n <= 20) return [`num_${n}`];
  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const unit = n % 10;
    return unit ? [`num_${tens}`, `num_${unit}`] : [`num_${tens}`];
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return rem ? [`num_${h}`, 'num_hundred', ...numberToWavs(rem)] : [`num_${h}`, 'num_hundred'];
  }
  return String(n).split('').map((d) => `num_${d}`);
}

/**
 * Play several phrase wavs back-to-back as one utterance (e.g. "Waypoint" +
 * number words). Deduped once by `key`; the parts bypass announce()'s
 * per-wav dedupe (number words legitimately repeat within one utterance).
 */
function announceSequence(wavs: string[], key: string): void {
  if (muted() || !linkUp() || wavs.length === 0) return;
  const now = Date.now();
  if (now - (lastSpokenAt.get(key) ?? 0) < DEDUPE_MS) return;
  lastSpokenAt.set(key, now);
  if (queue.length >= 5) return; // don't stack stale utterances
  for (const wav of wavs) queue.push({ wav, key: `${key}:part` });
  void playNext();
}

/** Baselines so we never announce the state we happened to connect into. */
let seeded = false;
let prevArmed = false;
let prevMode = '';
let prevFlying = false;
let prevFixOk = false;
let hadFix = false;
let prevStale = false;
/** lowest battery threshold already announced this flight */
let battAnnounced = 101;
let lastMsgTimestamp = 0;
/** last waypoint spoken, so a re-broadcast of the same current WP is silent */
let prevWaypoint = -1;

function reseed(): void {
  seeded = false;
  battAnnounced = 101;
  hadFix = false;
  prevWaypoint = -1;
  queue.length = 0;
  lastMsgTimestamp = Date.now();
}

const unsubs: Array<() => void> = [];

function teardown(): void {
  started = false;
  for (const u of unsubs.splice(0)) u();
  queue.length = 0;
  void ctx?.close().catch(() => {});
  ctx = null;
}

export function initAnnouncer(): void {
  if (started || typeof window === 'undefined') return;
  // HMR replaces this module without tearing down the previous copy's
  // store subscriptions; two live copies play every phrase twice (heard
  // as an echo). The previous copy registers its teardown globally so
  // the fresh one can retire it.
  const g = globalThis as { __adAnnouncerTeardown?: () => void };
  g.__adAnnouncerTeardown?.();
  g.__adAnnouncerTeardown = teardown;
  started = true;
  lastMsgTimestamp = Date.now();

  // Chromium may gate audio until a user gesture; unlock on the first one.
  const unlock = () => {
    if (!ctx) ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  unsubs.push(() => window.removeEventListener('pointerdown', unlock));

  // Boot greeting, once per renderer. Waits for saved settings: before they load, mute reads as off.
  const greet = () => {
    const gg = globalThis as { __adGreeted?: boolean };
    if (gg.__adGreeted) return;
    gg.__adGreeted = true;
    if (muted()) return;
    queue.push({ wav: 'welcome', key: 'welcome' });
    void playNext();
  };
  if (useSettingsStore.getState()._isInitialized) greet();
  else {
    const off = useSettingsStore.subscribe((s) => {
      if (!s._isInitialized) return;
      off();
      greet();
    });
    unsubs.push(off);
  }

  unsubs.push(useTelemetryStore.subscribe((s) => {
    if (!linkUp()) return;
    const { armed, mode, isFlying } = s.flight;
    const fixOk = s.gps.fixType >= 3;
    const remaining = s.battery.remaining;

    if (!seeded) {
      seeded = true;
      prevArmed = armed; prevMode = mode; prevFlying = isFlying;
      prevFixOk = fixOk; hadFix = fixOk;
      return;
    }

    if (armed !== prevArmed) {
      prevArmed = armed;
      announce({ wav: armed ? 'armed' : 'disarmed', key: 'arm' });
      if (!armed) battAnnounced = 101;
    }
    if (mode !== prevMode && mode !== 'Unknown') {
      prevMode = mode;
      announce(modeItem(mode));
    }
    if (isFlying !== prevFlying) {
      prevFlying = isFlying;
      if (armed || !isFlying) {
        announce({ wav: isFlying ? 'airborne' : 'landed', key: 'flying' });
      }
    }
    if (fixOk !== prevFixOk) {
      prevFixOk = fixOk;
      if (fixOk) {
        announce({ wav: hadFix ? 'glitch_cleared' : 'gps_ok', key: 'gps' });
        hadFix = true;
      } else if (hadFix && (armed || isFlying)) {
        announce({ wav: 'gps_lost', key: 'gps', critical: true });
      }
    }
    // FC-reported remaining %: announce 50/30/15 crossings while armed
    if (armed && remaining >= 1 && remaining <= 100) {
      for (const [threshold, wav, critical] of [
        [15, 'batt_crit', true], [30, 'batt_low', false], [50, 'batt_50', false],
      ] as Array<[number, string, boolean]>) {
        if (remaining <= threshold && battAnnounced > threshold) {
          battAnnounced = threshold;
          announce({ wav, key: `batt:${threshold}`, critical });
          break;
        }
      }
    }
  }));

  unsubs.push(useMessagesStore.subscribe((s) => {
    const msg = s.messages[0];
    if (!msg || msg.timestamp <= lastMsgTimestamp) return;
    lastMsgTimestamp = msg.timestamp;
    const lower = msg.text.toLowerCase();
    for (const [needle, wav] of MSG_SOUNDS) {
      if (lower.includes(needle)) {
        announce({ wav, key: `snd:${wav}`, critical: msg.severity <= 2 });
        return;
      }
    }
    // no dedicated phrase: announce the SEVERITY in the brand voice (the
    // detail is on the messages ticker); tone-only until wavs are generated
    if (msg.severity <= 2) {
      announce({ wav: 'critical', tone: 'crit', key: `msg:${msg.text}`, critical: true });
    } else if (msg.severity === 3) {
      announce({ wav: 'error', tone: 'error', key: `msg:${msg.text}` });
    } else if (msg.severity === 4) {
      announce({ wav: 'warning', tone: 'warn', key: `msg:${msg.text}` });
    }
  }));

  unsubs.push(useConnectionStore.subscribe((s) => {
    const { isConnected, isStale } = s.connectionState;
    if (!isConnected) {
      if (seeded) reseed();
      prevStale = false;
      return;
    }
    if (!!isStale !== prevStale) {
      prevStale = !!isStale;
      announce(isStale
        ? { wav: 'telemetry_lost', key: 'telem', critical: true }
        : { wav: 'telemetry_ok', key: 'telem' });
    }
  }));

  // Waypoint progress: speak "Waypoint N" as the FC advances through an AUTO
  // mission. Gated on armed + AUTO so RTL/guided WP churn stays quiet, and on
  // a real change so a re-broadcast of the same current WP doesn't repeat.
  unsubs.push(useMissionStore.subscribe((s) => {
    if (!linkUp()) return;
    const seq = s.currentSeq;
    const { armed, mode } = useTelemetryStore.getState().flight;
    // seq is the 0-based store index (home stripped); seq 0 is the first
    // real waypoint = display "WP 1", so allow >= 0.
    if (seq == null || seq < 0 || !armed || mode.toUpperCase() !== 'AUTO') {
      prevWaypoint = seq ?? -1;
      return;
    }
    if (seq === prevWaypoint) return;
    prevWaypoint = seq;
    // Speak the SAME 1-based number the mission instrument shows (it renders
    // currentSeq + 1); the raw store seq is 0-based, so voice would trail the
    // display by one. This is the current target ("now flying to WP N"),
    // not a "reached" event.
    announceSequence(['wp_to', ...numberToWavs(seq + 1)], `wp:${seq}`);
  }));

  // switching the active fleet vehicle changes every value at once; reseed
  // silently instead of narrating the diff
  unsubs.push(useActiveVehicleStore.subscribe((s, prev) => {
    if (s.activeVehicleKey !== prev.activeVehicleKey) reseed();
  }));
}
