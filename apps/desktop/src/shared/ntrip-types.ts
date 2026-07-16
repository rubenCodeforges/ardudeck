/**
 * NTRIP client types (issue #60): RTK correction data from an NTRIP caster,
 * forwarded to the vehicle as MAVLink GPS_RTCM_DATA. Shared between the main
 * process (client + injection) and the renderer (RTK / NTRIP panel).
 *
 * The caster password is NOT part of this config: it lives in the encrypted
 * API-key store under the service name 'ntrip' (same mechanism as overlay
 * provider keys), so it never sits in plaintext in the config JSON.
 */

/**
 * NTRIP protocol revision. v1 = classic "ICY 200 OK" over an HTTP/1.0-shaped
 * request; v2 = proper HTTP/1.1 with an Ntrip-Version header and possibly
 * chunked transfer encoding. 'auto' tries v2 and falls back to v1 once when
 * the caster refuses the request form, then remembers what worked.
 */
export type NtripProtocol = 'auto' | 'v1' | 'v2';

export interface NtripConfig {
  /** Caster hostname or IP, without scheme. */
  host: string;
  /** Caster port. NTRIP convention is 2101 (80/443 for HTTP-fronted casters). */
  port: number;
  /** Protocol revision to speak (see NtripProtocol). */
  protocol: NtripProtocol;
  /** Mountpoint to stream from (case-sensitive on most casters). */
  mountpoint: string;
  /** Basic-auth username. Empty = anonymous caster. */
  username: string;
  /** Wrap the connection in TLS (casters fronted by HTTPS, usually port 443). */
  useTls: boolean;
  /**
   * Periodically upload the vehicle's position as an NMEA GGA sentence.
   * Required by VRS / network mountpoints, harmless for fixed-base ones.
   */
  sendPosition: boolean;
  /** GGA upload interval in seconds. */
  ggaIntervalSec: number;
}

export const DEFAULT_NTRIP_CONFIG: NtripConfig = {
  host: '',
  port: 2101,
  protocol: 'auto',
  mountpoint: '',
  username: '',
  useTls: false,
  sendPosition: true,
  ggaIntervalSec: 1,
};

export type NtripState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type NtripGgaState = 'off' | 'waiting-for-fix' | 'sending';

/**
 * Who owns the caster connection and the RTCM injection. Exactly one owner at
 * a time: GPS_RTCM_DATA reassembly on the autopilot keys on the 5-bit sequence
 * plus 2-bit fragment ids, so two injectors interleaving sequences would
 * corrupt reassembly. 'local' = this desktop's client injecting into the
 * direct vehicle link; 'orchestrator' = the multi-vehicle engine's client
 * injecting fleet-wide.
 */
export type NtripOwner = 'local' | 'orchestrator';

export interface NtripStatus {
  state: NtripState;
  /** Human-readable failure reason, set when state is 'error' or 'reconnecting'. */
  error?: string;
  /** Mountpoint of the active/last stream. */
  mountpoint?: string;
  bytesReceived: number;
  /** Correction stream rate over the last second, bytes/s. */
  dataRateBps: number;
  /** Complete RTCM messages forwarded to the vehicle. */
  rtcmForwarded: number;
  /** RTCM messages dropped (no vehicle link, oversize, send failure). */
  rtcmDropped: number;
  /** RTCM message type -> count, for the stats readout (1005, 1074, ...). */
  rtcmTypeCounts: Record<number, number>;
  ggaState: NtripGgaState;
  ggaSentCount: number;
  connectedAtMs?: number;
  /** Which client this status describes (see NtripOwner). */
  owner?: NtripOwner;
  /** Orchestrator only: RTCM messages forwarded per vehicle, by virtual sysid. */
  perVehicleForwarded?: Record<number, number>;
}

export const INITIAL_NTRIP_STATUS: NtripStatus = {
  state: 'disconnected',
  bytesReceived: 0,
  dataRateBps: 0,
  rtcmForwarded: 0,
  rtcmDropped: 0,
  rtcmTypeCounts: {},
  ggaState: 'off',
  ggaSentCount: 0,
};

/** One STR row of a caster sourcetable. */
export interface NtripMountpoint {
  name: string;
  identifier: string;
  format: string;
  navSystem: string;
  country: string;
  lat: number;
  lon: number;
  /** Caster expects periodic GGA uploads for this mountpoint (VRS). */
  needsGga: boolean;
  needsAuth: boolean;
}

export interface NtripSourcetableResult {
  success: boolean;
  mountpoints?: NtripMountpoint[];
  error?: string;
}
