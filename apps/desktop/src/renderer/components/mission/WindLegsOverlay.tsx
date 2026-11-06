import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Marker, Polyline } from 'react-leaflet';
import * as L from 'leaflet';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { commandHasLocation, hasValidCoordinates } from '../../../shared/mission-types';
import { formatSpeedFromMetersPerSecond } from '../../../shared/user-units.js';
import { legWinds, type LegWind, type WindAt } from '../../utils/flight-briefing';

export type LegWindKind = 'tail' | 'cross' | 'head' | 'blocked';

/** Headwind component, m/s, beyond which a leg counts as head- or tailwind rather than crosswind. */
const COMPONENT_MS = 1.5;

export function legWindKind(leg: Pick<LegWind, 'groundSpeedMs' | 'headwindMs'>): LegWindKind {
  if (leg.groundSpeedMs === null) return 'blocked';
  if (leg.headwindMs >= COMPONENT_MS) return 'head';
  if (leg.headwindMs <= -COMPONENT_MS) return 'tail';
  return 'cross';
}

/** Blue for tailwind, amber for headwind, red dashed where the aircraft cannot hold the leg. */
export const LEG_WIND_COLORS: Record<LegWindKind, string> = {
  tail: '#38bdf8',
  cross: '#cbd5e1',
  head: '#f59e0b',
  blocked: '#ef4444',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Mission legs coloured by the wind layer's component along them, with a ground-speed pill at mid-leg. */
export function WindLegsOverlay({ windAt }: { windAt: WindAt }): JSX.Element | null {
  const { t } = useTranslation();
  const missionItems = useMissionStore((s) => s.missionItems);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const activeVehicleId = useSettingsStore((s) => s.activeVehicleId);
  const vehicles = useSettingsStore((s) => s.vehicles);
  const cruiseSpeedMs = useMemo(
    () => useSettingsStore.getState().getCruiseSpeed(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the cruise speed follows the active vehicle profile
    [activeVehicleId, vehicles],
  );

  const legs = useMemo(() => {
    const located = missionItems
      .filter((it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude))
      .map((it) => ({ lat: it.latitude, lng: it.longitude }));
    return legWinds(located, cruiseSpeedMs, windAt, null).filter((l): l is NonNullable<typeof l> => l !== null);
  }, [missionItems, cruiseSpeedMs, windAt]);

  if (legs.length === 0) return null;
  return (
    <>
      {legs.map((leg, i) => {
        const kind = legWindKind(leg);
        const color = LEG_WIND_COLORS[kind];
        const label = leg.groundSpeedMs === null
          ? t('mission:windLegs.cannotHold')
          : t('mission:windLegs.groundSpeed', { speed: formatSpeedFromMetersPerSecond(leg.groundSpeedMs, speedUnit) });
        // The arrow points where the wind blows to.
        const arrowDeg = (leg.windFromDeg + 180) % 360;
        const icon = L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;white-space:nowrap;padding:2px 7px 2px 5px;border-radius:999px;background:rgba(15,23,42,0.88);border:1.5px solid ${color};color:#f1f5f9;font:600 11px/16px Inter,system-ui,sans-serif;pointer-events:none">`
            + `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${arrowDeg.toFixed(0)}deg)"><path d="M12 3v18M12 3l-6 6M12 3l6 6" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`
            + `${escapeHtml(label)}</div>`,
        });
        return (
          <Fragment key={`${i}:${leg.from.lat}:${leg.from.lng}`}>
            <Polyline
              positions={[[leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]]}
              pathOptions={{ color, weight: 6, opacity: 0.85, dashArray: kind === 'blocked' ? '10 8' : undefined, lineCap: 'round' }}
              interactive={false}
            />
            <Marker position={[leg.mid.lat, leg.mid.lng]} icon={icon} interactive={false} keyboard={false} />
          </Fragment>
        );
      })}
    </>
  );
}
