import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters, verticalSpeedValueFromMetersPerSecond, UNIT_LABELS } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function AltitudePanel() {
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const position = useTelemetryStore((s) => s.position);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);
  const displayClimb = verticalSpeedValueFromMetersPerSecond(vfrHud.climb, verticalSpeedUnit);

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="MSL" value={formatAltitudeFromMeters(vfrHud.alt, altitudeUnit)} highlight />
        <StatRow label="AGL" value={formatAltitudeFromMeters(position.relativeAlt, altitudeUnit)} />
        <StatRow label="Climb" value={`${displayClimb >= 0 ? '+' : ''}${formatNumber(displayClimb, verticalSpeedUnit === 'fpm' ? 0 : 1)}`} unit={UNIT_LABELS.verticalSpeed[verticalSpeedUnit]} />
      </div>
    </PanelContainer>
  );
}
