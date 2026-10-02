/**
 * Heartbeat liveness indicator: a small dot that pulses green while a vehicle's
 * telemetry/heartbeat is fresh and fades to grey when it goes silent.
 *
 * Freshness is derived from the last telemetry batch applied to the vehicle
 * (which includes heartbeat-derived fields), so it reflects an actually-live
 * link rather than just "was discovered once". A shared 1 Hz tick re-renders all
 * dots so a vehicle that stops talking flips to stale on its own, even though no
 * new telemetry arrives to trigger a render.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

/** Telemetry within this window counts as a live heartbeat. */
const LIVE_WINDOW_MS = 3000;

// A single shared 1 Hz clock for every dot on screen - cheaper than one
// interval per row and keeps the pulses in phase.
let tickSubscribers = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;
const tickListeners = new Set<() => void>();

function useSharedTick(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force((n) => n + 1);
    tickListeners.add(listener);
    tickSubscribers += 1;
    if (!tickTimer) {
      tickTimer = setInterval(() => tickListeners.forEach((l) => l()), 1000);
    }
    return () => {
      tickListeners.delete(listener);
      tickSubscribers -= 1;
      if (tickSubscribers === 0 && tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
      }
    };
  }, []);
}

interface HeartbeatDotProps {
  /** Wall-clock ms of the last telemetry/heartbeat, or null if never seen. */
  lastUpdate: number | null;
  className?: string;
}

export function HeartbeatDot({ lastUpdate, className = '' }: HeartbeatDotProps) {
  const { t } = useTranslation();
  useSharedTick();
  const age = lastUpdate === null ? Infinity : Date.now() - lastUpdate;
  const live = age < LIVE_WINDOW_MS;
  const tip = live
    ? t('fleet:heartbeatDot.receiving')
    : lastUpdate === null
      ? t('fleet:heartbeatDot.none')
      : t('fleet:heartbeatDot.stale', { seconds: Math.round(age / 1000) });

  return (
    <span className={`relative inline-flex w-2.5 h-2.5 shrink-0 ${className}`} data-tip={tip}>
      {live && (
        <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
      )}
      <span
        className={`relative inline-flex w-2.5 h-2.5 rounded-full ${
          live ? 'bg-emerald-400' : 'bg-content-tertiary/40'
        }`}
      />
    </span>
  );
}
