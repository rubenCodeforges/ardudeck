import { useTelemetryStore } from '../../stores/telemetry-store';
import { GPS_FIX_TYPES } from '../../../shared/telemetry-types';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function GpsPanel() {
  const { gps } = useTelemetryStore();

  const fixColor = gps.fixType >= 3 ? 'bg-emerald-400' : gps.fixType >= 2 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <PanelContainer>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${fixColor}`} />
          <span className="text-sm text-gray-200">{GPS_FIX_TYPES[gps.fixType] || 'No GPS'}</span>
        </div>

        <div className="space-y-1">
          <StatRow label="Satellites" value={gps.satellites} />
          <StatRow label="HDOP" value={formatNumber(gps.hdop, 1)} />
          <StatRow label="Altitude" value={formatNumber(gps.alt, 1)} unit="m" />
        </div>
      </div>
    </PanelContainer>
  );
}
