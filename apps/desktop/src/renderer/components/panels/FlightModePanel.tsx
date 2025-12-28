import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function FlightModePanel() {
  const { flight, vfrHud, battery } = useTelemetryStore();

  const batteryColor = battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-yellow-400' : 'text-red-400';

  return (
    <PanelContainer>
      <div className="space-y-3">
        {/* Armed/Mode status */}
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
            flight.armed ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400'
          }`}>
            {flight.armed ? 'Armed' : 'Disarmed'}
          </span>
          <span className="text-lg font-medium text-white">{flight.mode}</span>
        </div>

        {/* Key stats */}
        <div className="space-y-1">
          <StatRow label="Heading" value={formatNumber(vfrHud.heading, 0)} unit="°" />
          <StatRow label="Altitude" value={formatNumber(vfrHud.alt, 1)} unit="m" />
          <StatRow label="Speed" value={formatNumber(vfrHud.groundspeed, 1)} unit="m/s" />
          <StatRow label="Throttle" value={vfrHud.throttle} unit="%" />
          <div className="flex justify-between items-baseline py-0.5">
            <span className="text-gray-500 text-xs">Battery</span>
            <span className={`font-mono text-sm ${batteryColor}`}>
              {formatNumber(battery.voltage, 1)}
              <span className="text-gray-600 text-[10px] ml-0.5">V</span>
            </span>
          </div>
        </div>
      </div>
    </PanelContainer>
  );
}
