import React from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters, speedValueFromMetersPerSecond, UNIT_LABELS } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export const FlightModePanel = React.memo(function FlightModePanel() {
  // Use selective subscriptions to prevent re-renders on unrelated telemetry updates
  const flight = useTelemetryStore((s) => s.flight);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);

  const batteryColor = battery.remaining < 0 ? 'text-content-secondary' : battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-yellow-400' : 'text-red-400';

  return (
    <PanelContainer>
      <div className="space-y-3">
        {/* Armed/Mode status */}
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
            flight.armed ? 'bg-red-500 text-white' : 'bg-surface-raised text-content-secondary'
          }`}>
            {flight.armed ? 'Armed' : 'Disarmed'}
          </span>
          <span className="text-lg font-medium text-content">{flight.mode}</span>
        </div>

        {/* Key stats */}
        <div className="space-y-1">
          <StatRow label="Heading" value={formatNumber(vfrHud.heading, 0)} unit="°" />
          <StatRow label="Altitude" value={formatAltitudeFromMeters(vfrHud.alt, altitudeUnit)} />
          <StatRow label="Speed" value={formatNumber(speedValueFromMetersPerSecond(vfrHud.groundspeed, speedUnit), 1)} unit={UNIT_LABELS.speed[speedUnit]} />
          <StatRow label="Throttle" value={vfrHud.throttle} unit="%" />
          <div className="flex justify-between items-baseline py-0.5">
            <span className="text-content-secondary text-xs">Battery</span>
            <span className={`font-mono text-sm ${batteryColor}`}>
              {formatNumber(battery.voltage, 1)}
              <span className="text-content-tertiary text-[10px] ml-0.5">V</span>
            </span>
          </div>
        </div>
      </div>
    </PanelContainer>
  );
});
