/**
 * Camera / video feature — shared contract between the main-process media
 * engine and the renderer camera panel.
 *
 * Design notes:
 *  - Sources are pluggable. Network sources (rtsp/rtp/srt/rubyfpv/webrtc) are
 *    normalized by the main-process media engine (MediaMTX + ffmpeg) and handed
 *    back to the renderer as a WebRTC/WHEP or MSE/WebSocket playback descriptor.
 *  - `uvc` (local capture device) never touches the engine — the renderer plays
 *    it directly with getUserMedia.
 *  - `mavlink` resolves to a concrete url at start time from a discovered
 *    VIDEO_STREAM_INFORMATION (falls back to manual entry if none advertised).
 *  - Everything is keyed by `vehicleKey` so single- and multi-vehicle behave
 *    identically: one vehicle = one owner, N vehicles = N owners.
 */

export type CameraSourceKind =
  | 'rtsp'
  | 'rtp-udp'
  | 'srt'
  | 'rubyfpv'
  | 'wfbng'
  | 'webrtc'
  | 'mavlink'
  | 'uvc';

/** Kinds the main-process media engine must normalize (everything but uvc). */
export const ENGINE_SOURCE_KINDS: CameraSourceKind[] = ['rtsp', 'rtp-udp', 'srt', 'rubyfpv', 'wfbng', 'webrtc', 'mavlink'];

export interface CameraSourceConfig {
  /** Stable uuid. */
  id: string;
  /** Owning vehicle (active-vehicle-store key). */
  vehicleKey: string;
  kind: CameraSourceKind;
  /** User-facing name shown in the picker and tile label. */
  label: string;
  /** Network sources: rtsp:// udp:// srt:// or a WHEP https url for webrtc. */
  url?: string;
  /** UVC sources: MediaDeviceInfo.deviceId. */
  deviceId?: string;
  /** Optics — needed for click-to-point geolocation and the footprint overlay. */
  hfovDeg?: number;
  vfovDeg?: number;
  /** Trade buffering for latency (small jitter buffer, drop-late). */
  lowLatency?: boolean;
  /**
   * RTSP pull transport for network sources. 'automatic' (default) negotiates
   * UDP then falls back to TCP; force 'udp' for lowest latency on a clean LAN,
   * or 'tcp' for reliability through firewalls / lossy links.
   */
  rtspTransport?: 'automatic' | 'tcp' | 'udp';
  /**
   * wfbng sources: codec the ground station forwards (WiFiLink 2 defaults to
   * H.265) and whether to transcode to H.264 for WebRTC playback. Transcode
   * defaults to on for H.265 - Electron's WebRTC cannot decode H.265.
   */
  wfbCodec?: 'h265' | 'h264';
  wfbTranscode?: boolean;
  /**
   * 'dongle' (default): ArduDeck drives the plugged-in RTL8812AU receiver
   * dongle itself. 'network': a separate ground station forwards the video
   * to the udp url.
   */
  wfbMode?: 'dongle' | 'network';
  /** Provenance, when created from a preset (e.g. 'siyi-a8'). */
  preset?: string;
}

/** wfb-ng dongle receiver state, rendered as plain-language chips in the UI. */
export interface WfbngStatus {
  /** Detected RTL8812AU-family adapter name, or null when not plugged in. */
  dongleName: string | null;
  receiverInstalled: boolean;
  gsKeyImported: boolean;
  running: boolean;
  channel: number;
  bandwidth: 20 | 40;
  /** Live counters while running (parsed from the receiver's stats lines). */
  stats: { wifi: number; wfb: number; rtp: number } | null;
}

/** A built-in source preset (SIYI, Herelink, RunCam, RubyFPV, …). */
export interface CameraPreset {
  id: string;
  label: string;
  kind: CameraSourceKind;
  /** Default url (editable after the preset is applied). */
  url?: string;
  hfovDeg?: number;
  /** Short operator-facing hint (default IP, gotchas). */
  note?: string;
}

/** How the renderer should consume the normalized stream. */
export type CameraPlayback =
  | { kind: 'webrtc'; whepUrl: string }
  | { kind: 'mse'; wsUrl: string }
  | { kind: 'uvc'; deviceId: string };

export type CameraStreamStatus = 'starting' | 'live' | 'error' | 'stopped';

export interface CameraStreamSession {
  sourceId: string;
  vehicleKey: string;
  playback: CameraPlayback;
  status: CameraStreamStatus;
  error?: string;
  /** Engine-assigned path name (MediaMTX) for teardown / recording. */
  path?: string;
}

export interface CameraStartResult {
  ok: boolean;
  session?: CameraStreamSession;
  error?: string;
}

/** Result of a snapshot / record toggle. */
export interface CameraMediaActionResult {
  ok: boolean;
  /** Absolute path of the written file, when applicable. */
  filePath?: string;
  error?: string;
}

/** Engine availability, surfaced so the UI can guide setup when binaries are absent. */
export interface MediaEngineStatus {
  /** MediaMTX sidecar reachable. */
  hubReady: boolean;
  /** ffmpeg resolvable (bundled or on PATH). */
  ffmpegReady: boolean;
  /** Resolved ffmpeg path or null. */
  ffmpegPath: string | null;
  /** Human-readable reason when not ready. */
  detail?: string;
}

// ---------------------------------------------------------------------------
// MAVLink discovery (RX) — populated by the main process when the vehicle
// advertises these. The renderer store holds them per vehicle; the camera
// source picker offers a one-click "use advertised stream".
// ---------------------------------------------------------------------------

export interface VideoStreamInfoIpc {
  vehicleKey: string;
  streamId: number;
  name: string;
  uri: string;
  /** MAV_VIDEO_STREAM_TYPE: 0=RTSP 1=RTPUDP 2=TCP_MPEG 3=MPEG_TS_H264. */
  type: number;
  framerate: number;
  resolutionH: number;
  resolutionV: number;
  hfovDeg?: number;
}

export interface GimbalAttitudeIpc {
  vehicleKey: string;
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface GimbalInfoIpc {
  vehicleKey: string;
  capFlags: number;
  rollMinDeg: number;
  rollMaxDeg: number;
  pitchMinDeg: number;
  pitchMaxDeg: number;
  yawMinDeg: number;
  yawMaxDeg: number;
}

// ---------------------------------------------------------------------------
// Commands (renderer -> main)
// ---------------------------------------------------------------------------

export type GimbalCommand =
  | { kind: 'pitchyaw'; pitchDeg: number; yawDeg: number; /** treat values as rates deg/s */ rate?: boolean; deviceId?: number; via?: GimbalControlPath }
  | { kind: 'point-roi'; lat: number; lon: number; alt: number; deviceId?: number }
  | { kind: 'roi-none' }
  | { kind: 'retract'; deviceId?: number }
  | { kind: 'center'; deviceId?: number };

/** Which MAVLink command family actuates the mount. */
export type GimbalControlPath = 'manager' | 'mount';

/**
 * Per-vehicle gimbal setup, set by the operator (discovery can't reliably tell
 * an RC-passthrough mount from none, so this is an explicit choice with an
 * 'auto' default that uses the MAVLink gimbal-manager path).
 */
export type GimbalControlMode =
  /** Use the MAVLink gimbal-manager path (ArduPilot 4.1+ MNT*_TYPE = MAVLink). */
  | 'auto'
  /** Force the gimbal-manager path (DO_GIMBAL_MANAGER_PITCHYAW). */
  | 'manager'
  /** Legacy/alt mounts: DO_MOUNT_CONTROL angle targeting. */
  | 'mount'
  /** Mount is driven from the RC transmitter — show attitude, no GCS commands. */
  | 'rc'
  /** No gimbal — hide the controls entirely. */
  | 'off';

export interface GimbalConfig {
  mode: GimbalControlMode;
  /** Gimbal device id / mount instance: 0 = all, 1 = MNT1, 2 = MNT2. */
  deviceId: number;
}

export const DEFAULT_GIMBAL_CONFIG: GimbalConfig = { mode: 'auto', deviceId: 0 };

export type CameraCommand =
  /** continuous: value -1|0|1 ; range: value 0..100 (% of zoom range). */
  | { kind: 'zoom'; mode: 'continuous' | 'range'; value: number }
  | { kind: 'focus'; mode: 'continuous' | 'range'; value: number };

// ---------------------------------------------------------------------------
// OSD overlay layers — each independently toggleable.
// ---------------------------------------------------------------------------

export interface OsdLayers {
  cornerTelemetry: boolean;
  crosshair: boolean;
  northIndicator: boolean;
  frameCenterCoords: boolean;
  /** Conformal horizon — only meaningful on forward-looking cameras. */
  artificialHorizon: boolean;
  /**
   * Full synthetic flight HUD (pitch ladder, bank arc, airspeed/altitude tapes,
   * heading bar, vertical speed, battery/GPS/home). Active vehicle only. When on,
   * it supersedes the simpler horizon/crosshair/telemetry layers.
   */
  hud: boolean;
  /**
   * World-locked 3D mission-waypoint symbology (gate reticles + captions + a
   * "highway in the sky" route line) rendered by a real perspective camera in a
   * transparent overlay over the background, so it sits in the world instead of
   * being a screen projection. Active vehicle only; over Synthetic Vision the
   * overlay camera matches the SVT camera exactly. Independent of the `hud` layer.
   */
  waypoints: boolean;
}

export const DEFAULT_OSD_LAYERS: OsdLayers = {
  cornerTelemetry: true,
  crosshair: true,
  northIndicator: true,
  frameCenterCoords: false,
  artificialHorizon: false,
  hud: false,
  waypoints: true,
};

export type CameraViewMode = 'follow' | 'grid';

/**
 * What a view renders:
 *  - 'live'      : the configured camera feed (video / WHEP / UVC).
 *  - 'synthetic' : a Garmin-style synthetic-vision world (3D terrain driven by
 *                  the vehicle's GPS + attitude). Needs no configured feed, so
 *                  it works for any vehicle with a position fix.
 */
export type CameraRenderMode = 'live' | 'synthetic';
