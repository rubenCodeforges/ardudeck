/**
 * Per-field freshness for instruments.
 *
 * useLinkUp() only answers "is the link up". That was enough on ArduPilot,
 * which streams ATTITUDE and GLOBAL_POSITION_INT from boot, so a live link
 * always meant live attitude. PX4 does not: it publishes neither until the EKF
 * has a valid estimate, measured as roughly the first 35 seconds of a fresh
 * link, and it stops again whenever the estimator goes unhealthy in flight.
 *
 * With only a link-level gate the store's zero defaults get painted as real
 * readings: a perfectly level horizon and an altitude of 0 m, which is worse
 * than showing nothing. These hooks answer the narrower question the gauges
 * actually need - has THIS field arrived, and recently.
 *
 * A field that has never arrived (timestamp 0) is never fresh, so this also
 * covers the gap before the first packet, not just a stalled stream.
 */

import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useLinkUp } from './useLinkUp';

/** Telemetry groups the store timestamps on every update. */
export type TelemetryField =
  | 'attitude'
  | 'position'
  | 'gps'
  | 'battery'
  | 'vfrHud'
  | 'rcChannels'
  | 'wind'
  | 'ekf';

const STAMP_SELECTOR = {
  attitude: (s: { lastAttitude: number }) => s.lastAttitude,
  position: (s: { lastPosition: number }) => s.lastPosition,
  gps: (s: { lastGps: number }) => s.lastGps,
  battery: (s: { lastBattery: number }) => s.lastBattery,
  vfrHud: (s: { lastVfrHud: number }) => s.lastVfrHud,
  rcChannels: (s: { lastRcChannels: number }) => s.lastRcChannels,
  wind: (s: { lastWind: number }) => s.lastWind,
  ekf: (s: { lastEkf: number }) => s.lastEkf,
} as const;

/**
 * How long a field may go unrefreshed before the gauge dashes out. Generous
 * enough for PX4's slowest instrument-feeding streams (BATTERY_STATUS lands at
 * ~0.4 Hz, so a 2 s window would flap constantly).
 */
export const TELEMETRY_STALE_MS = 5000;

/**
 * Re-render on a slow tick so a stream that STOPS still ages out. Without this
 * the last value stays painted forever: no store update means no re-render, so
 * nothing would ever notice the silence.
 */
function useSecondsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return tick;
}

/**
 * The freshness decision, split out so it is testable without a DOM. A stamp of
 * 0 means the field has never arrived on this link, which is NOT the same as
 * old data and must never read as fresh.
 */
export function isTelemetryFresh(linkUp: boolean, stamp: number, now: number): boolean {
  if (!linkUp || stamp === 0) return false;
  return now - stamp < TELEMETRY_STALE_MS;
}

/** True when the link is up AND this field has arrived recently. */
export function useTelemetryFresh(field: TelemetryField): boolean {
  const linkUp = useLinkUp();
  const sel = STAMP_SELECTOR[field] as (s: unknown) => number;
  useSecondsTick();

  // Select the BOOLEAN, not the raw stamp: the stamp advances on every
  // telemetry batch and would wake the instrument at full telemetry rate even
  // when its displayed values are static. The 1s tick above re-evaluates the
  // window so a stopped stream still ages out.
  return useTelemetryStore((s) => isTelemetryFresh(linkUp, sel(s), Date.now()));
}
