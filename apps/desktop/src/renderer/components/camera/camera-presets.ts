/**
 * Built-in camera source presets.
 *
 * Defaults sourced from current (2025-2026) vendor docs. Port 8554 is the
 * de-facto RTSP standard across the serious payloads (SIYI / Herelink /
 * RunCam WiFiLink). URLs are editable after the preset is applied — these are
 * just the known-good starting points so the operator picks a payload instead
 * of typing a URL from memory.
 */

import type { CameraPreset } from '../../../shared/camera-types';

export interface LocalizedCameraPreset extends Omit<CameraPreset, 'note'> {
  labelKey?: string;
  noteKey?: string;
}

export const CAMERA_PRESETS: LocalizedCameraPreset[] = [
  {
    id: 'mavlink',
    label: 'Advertised by vehicle (MAVLink)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.mavlink.label',
    kind: 'mavlink',
    noteKey: 'camera:presets.mavlink.note',
  },
  {
    id: 'siyi-a8',
    label: 'SIYI A8 mini / ZR10 / ZR30', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.siyiA8.label',
    kind: 'rtsp',
    url: 'rtsp://192.168.144.25:8554/main.264',
    hfovDeg: 81,
    noteKey: 'camera:presets.siyiA8.note',
  },
  {
    id: 'siyi-zt6',
    label: 'SIYI ZT6 / ZT30 (RGB)', // i18n-exempt: fallback when no labelKey; brand names
    kind: 'rtsp',
    url: 'rtsp://192.168.144.25:8554/video2',
    hfovDeg: 81,
    noteKey: 'camera:presets.siyiZt6.note',
  },
  {
    id: 'herelink',
    label: 'Herelink (ground unit)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.herelink.label',
    kind: 'rtsp',
    url: 'rtsp://192.168.43.1:8554/fpv_stream',
    noteKey: 'camera:presets.herelink.note',
  },
  {
    id: 'runcam-wifilink',
    label: 'RunCam WiFiLink / OpenIPC (wfb-ng)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.runcamWifilink.label',
    kind: 'wfbng',
    url: 'udp://0.0.0.0:5600',
  },
  {
    id: 'rubyfpv',
    label: 'RubyFPV (relayed video)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.rubyfpv.label',
    kind: 'rubyfpv',
    url: 'udp://127.0.0.1:5600',
    noteKey: 'camera:presets.rubyfpv.note',
  },
  {
    id: 'rtsp',
    label: 'Custom RTSP URL', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.rtsp.label',
    kind: 'rtsp',
    url: 'rtsp://',
    noteKey: 'camera:presets.rtsp.note',
  },
  {
    id: 'ardudeck-sim',
    label: 'ArduDeck Simulator (FPV feed)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.ardudeckSim.label',
    kind: 'rtsp',
    url: 'rtsp://127.0.0.1:8654/fpv',
    noteKey: 'camera:presets.ardudeckSim.note',
  },
  {
    id: 'rtp-udp',
    label: 'Custom RTP / UDP (H.264)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.rtpUdp.label',
    kind: 'rtp-udp',
    url: 'udp://0.0.0.0:5600',
    noteKey: 'camera:presets.rtpUdp.note',
  },
  {
    id: 'srt',
    label: 'Custom SRT', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.srt.label',
    kind: 'srt',
    url: 'srt://0.0.0.0:8890?mode=listener',
    noteKey: 'camera:presets.srt.note',
  },
  {
    id: 'webrtc',
    label: 'Custom WebRTC (WHEP)', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.webrtc.label',
    kind: 'webrtc',
    url: 'https://',
    noteKey: 'camera:presets.webrtc.note',
  },
  {
    id: 'uvc',
    label: 'USB / HDMI capture device', // i18n-exempt: fallback when no labelKey; brand names
    labelKey: 'camera:presets.uvc.label',
    kind: 'uvc',
    noteKey: 'camera:presets.uvc.note',
  },
];

export function presetById(id: string): LocalizedCameraPreset | undefined {
  return CAMERA_PRESETS.find((p) => p.id === id);
}
