import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function AltitudePanel() {
  const { vfrHud, position } = useTelemetryStore();

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="MSL" value={formatNumber(vfrHud.alt, 1)} unit="m" highlight />
        <StatRow label="AGL" value={formatNumber(position.relativeAlt, 1)} unit="m" />
        <StatRow label="Climb" value={`${vfrHud.climb >= 0 ? '+' : ''}${formatNumber(vfrHud.climb, 1)}`} unit="m/s" />
      </div>
    </PanelContainer>
  );
}
