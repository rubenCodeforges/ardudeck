import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { speedValueFromMetersPerSecond, UNIT_LABELS } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function SpeedPanel() {
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const speedLabel = UNIT_LABELS.speed[speedUnit];

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="Ground" value={formatNumber(speedValueFromMetersPerSecond(vfrHud.groundspeed, speedUnit), 1)} unit={speedLabel} highlight />
        <StatRow label="Air" value={formatNumber(speedValueFromMetersPerSecond(vfrHud.airspeed, speedUnit), 1)} unit={speedLabel} />
        <StatRow label="Heading" value={formatNumber(vfrHud.heading, 0)} unit="°" />
        <StatRow label="Throttle" value={vfrHud.throttle} unit="%" />
      </div>
    </PanelContainer>
  );
}
