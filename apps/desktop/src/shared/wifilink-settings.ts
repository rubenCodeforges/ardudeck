// RunCam WiFiLink 2 settings, values exactly as RunCam's V3.1 user.ini template allows them.
import type { CameraSettingEffect, CameraSettingValue } from './camera-settings-types';

export const WIFILINK_DEFAULT_HOST = '192.168.1.10';
export const WIFILINK_DEFAULT_USER = 'root';
export const WIFILINK_DEFAULT_PASSWORD = '12345';

export type WifilinkFieldId =
  | 'video.mode'
  | 'video.codec'
  | 'video.bitrate'
  | 'image.luminance'
  | 'image.contrast'
  | 'image.saturation'
  | 'image.hue'
  | 'image.mirror'
  | 'image.flip'
  | 'image.rotate'
  | 'radio.channel'
  | 'radio.txpower'
  | 'radio.mcs'
  | 'radio.stbc'
  | 'radio.ldpc'
  | 'telemetry.protocol'
  | 'records.enabled';

type ConfigFile = 'majestic' | 'wfb';

interface Binding {
  /** user.ini section and key. */
  ini: { section: string; key: string };
  /** Key in the live config file; absent when only RunCam's own tool may apply it. */
  yaml?: { file: ConfigFile; key: string };
}

export interface WifilinkField {
  id: WifilinkFieldId;
  effect: CameraSettingEffect;
  /** Every value the firmware accepts, in display order. */
  values: readonly CameraSettingValue[];
  defaultValue: CameraSettingValue;
  bindings: Binding[];
}

export const VIDEO_MODES = [
  { value: '1280x720@60', size: '1280x720', fps: 60 },
  { value: '1280x720@90', size: '1280x720', fps: 90 },
  { value: '1280x720@120', size: '1280x720', fps: 120 },
  { value: '1920x1080@60', size: '1920x1080', fps: 60 },
  { value: '1920x1080@90', size: '1920x1080', fps: 90 },
] as const;

export const BITRATES_KBPS = [
  4096, 5120, 6144, 7168, 8192, 9216, 10240, 11264, 12288, 13312,
  14336, 15360, 16384, 17408, 18432, 19456, 19968,
] as const;

export const CHANNEL_BANDS = [
  { label: 'UNII-1', channels: [36, 40, 44, 48] }, // i18n-exempt
  { label: 'UNII-2A', channels: [52, 56, 60, 64] }, // i18n-exempt
  { label: 'UNII-2C', channels: [100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144] }, // i18n-exempt
  { label: 'UNII-3', channels: [149, 153, 157, 161, 165] }, // i18n-exempt
] as const;

export const channelMhz = (channel: number): number => 5000 + channel * 5;

// RunCam's power scale and its published dBm equivalents.
export const TX_POWER_LEVELS = [
  { value: 20, dbm: 16 },
  { value: 25, dbm: 20 },
  { value: 30, dbm: 22 },
  { value: 35, dbm: 24 },
  { value: 40, dbm: 26 },
  { value: 45, dbm: 27 },
  { value: 50, dbm: 28 },
  { value: 55, dbm: 28.5 },
  { value: 58, dbm: 29 },
] as const;

export const dbmToMw = (dbm: number): number => Math.round(10 ** (dbm / 10));

const percent = Array.from({ length: 101 }, (_, i) => i);
const majestic = (key: string) => ({ file: 'majestic' as const, key });
const wfb = (key: string) => ({ file: 'wfb' as const, key });
const ini = (section: string, key: string) => ({ section, key });

export const WIFILINK_FIELDS: readonly WifilinkField[] = [
  {
    id: 'video.mode',
    effect: 'video-reload',
    values: VIDEO_MODES.map((m) => m.value),
    defaultValue: '1280x720@120',
    // Split into size and fps when written; see splitVideoMode.
    bindings: [
      { ini: ini('video', 'Size'), yaml: majestic('.video0.size') },
      { ini: ini('video', 'fps'), yaml: majestic('.video0.fps') },
    ],
  },
  { id: 'video.codec', effect: 'video-reload', values: ['h265', 'h264'], defaultValue: 'h265', bindings: [{ ini: ini('video', 'codec'), yaml: majestic('.video0.codec') }] },
  { id: 'video.bitrate', effect: 'live', values: BITRATES_KBPS, defaultValue: 4096, bindings: [{ ini: ini('video', 'bitrate'), yaml: majestic('.video0.bitrate') }] },
  { id: 'image.luminance', effect: 'video-reload', values: percent, defaultValue: 50, bindings: [{ ini: ini('image', 'luminance'), yaml: majestic('.image.luminance') }] },
  { id: 'image.contrast', effect: 'video-reload', values: percent, defaultValue: 50, bindings: [{ ini: ini('image', 'contrast'), yaml: majestic('.image.contrast') }] },
  { id: 'image.saturation', effect: 'video-reload', values: percent, defaultValue: 50, bindings: [{ ini: ini('image', 'saturation'), yaml: majestic('.image.saturation') }] },
  { id: 'image.hue', effect: 'video-reload', values: percent, defaultValue: 50, bindings: [{ ini: ini('image', 'hue'), yaml: majestic('.image.hue') }] },
  { id: 'image.mirror', effect: 'video-reload', values: [false, true], defaultValue: false, bindings: [{ ini: ini('image', 'mirror'), yaml: majestic('.image.mirror') }] },
  { id: 'image.flip', effect: 'video-reload', values: [false, true], defaultValue: false, bindings: [{ ini: ini('image', 'flip'), yaml: majestic('.image.flip') }] },
  { id: 'image.rotate', effect: 'video-reload', values: [0, 90, 180, 270], defaultValue: 0, bindings: [{ ini: ini('image', 'rotate'), yaml: majestic('.image.rotate') }] },
  { id: 'records.enabled', effect: 'video-reload', values: [false, true], defaultValue: false, bindings: [{ ini: ini('records', 'enabled'), yaml: majestic('.records.enabled') }] },
  {
    id: 'radio.channel',
    effect: 'link-restart',
    values: CHANNEL_BANDS.flatMap((b) => b.channels),
    defaultValue: 161,
    bindings: [{ ini: ini('wireless', 'channel'), yaml: wfb('.wireless.channel') }],
  },
  // wfb.yaml holds power on a different scale that only RunCam's wifilink translates.
  { id: 'radio.txpower', effect: 'link-restart', values: TX_POWER_LEVELS.map((l) => l.value), defaultValue: 20, bindings: [{ ini: ini('wireless', 'txpower') }] },
  { id: 'radio.mcs', effect: 'link-restart', values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], defaultValue: 1, bindings: [{ ini: ini('broadcast', 'mcs_index'), yaml: wfb('.broadcast.mcs_index') }] },
  { id: 'radio.stbc', effect: 'link-restart', values: [0, 1], defaultValue: 0, bindings: [{ ini: ini('broadcast', 'stbc'), yaml: wfb('.broadcast.stbc') }] },
  { id: 'radio.ldpc', effect: 'link-restart', values: [0, 1], defaultValue: 0, bindings: [{ ini: ini('broadcast', 'ldpc'), yaml: wfb('.broadcast.ldpc') }] },
  { id: 'telemetry.protocol', effect: 'link-restart', values: ['msposd', 'mavlink'], defaultValue: 'msposd', bindings: [{ ini: ini('telemetry', 'protocol'), yaml: wfb('.telemetry.router') }] },
];

export function wifilinkField(id: string): WifilinkField | undefined {
  return WIFILINK_FIELDS.find((f) => f.id === id);
}

export function splitVideoMode(mode: string): { size: string; fps: number } | null {
  const m = VIDEO_MODES.find((v) => v.value === mode);
  return m ? { size: m.size, fps: m.fps } : null;
}

export function isAllowedValue(field: WifilinkField, value: CameraSettingValue): boolean {
  return field.values.some((v) => v === value);
}

/** The single slowest effect among a set of changes. */
export function strongestEffect(ids: readonly string[]): CameraSettingEffect | null {
  const rank: Record<CameraSettingEffect, number> = { live: 0, 'video-reload': 1, 'link-restart': 2 };
  let best: CameraSettingEffect | null = null;
  for (const id of ids) {
    const f = wifilinkField(id);
    if (f && (best === null || rank[f.effect] > rank[best])) best = f.effect;
  }
  return best;
}
