import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { GPS_FIX_TYPES, type GpsData } from '../../../shared/telemetry-types';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

function GpsReadout({ gps, label }: { gps: GpsData; label?: string }) {
  const fixColor = gps.fixType >= 3 ? 'bg-emerald-400' : gps.fixType >= 2 ? 'bg-yellow-400' : 'bg-red-400';
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${fixColor}`} />
        <span className="text-sm text-content">{GPS_FIX_TYPES[gps.fixType] || 'No GPS'}</span>
        {label && <span className="ml-auto text-[10px] uppercase tracking-wider text-content-tertiary">{label}</span>}
      </div>

      <div className="space-y-1">
        <StatRow label="Satellites" value={gps.satellites} />
        <StatRow label="HDOP" value={formatNumber(gps.hdop, 1)} />
        <StatRow label="VDOP" value={formatNumber(gps.vdop, 1)} />
        <StatRow label="Altitude" value={formatAltitudeFromMeters(gps.alt, altitudeUnit)} />
      </div>
    </div>
  );
}

export function GpsPanel() {
  const gps = useTelemetryStore((s) => s.gps);
  const gps2 = useTelemetryStore((s) => s.gps2);

  return (
    <PanelContainer>
      <div className="space-y-3">
        <GpsReadout gps={gps} label={gps2 ? 'GPS 1' : undefined} />
        {gps2 && (
          <>
            <div className="border-t border-white/5" />
            <GpsReadout gps={gps2} label="GPS 2" />
          </>
        )}
      </div>
    </PanelContainer>
  );
}
