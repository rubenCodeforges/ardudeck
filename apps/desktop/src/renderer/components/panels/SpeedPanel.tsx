import { useTelemetryStore } from '../../stores/telemetry-store';
import { useEffectiveHudThrottle } from '../../hooks/useEffectiveHudThrottle';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function SpeedPanel() {
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const hudThrottle = useEffectiveHudThrottle();

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="Ground" value={formatNumber(vfrHud.groundspeed, 1)} unit="m/s" highlight />
        <StatRow label="Air" value={formatNumber(vfrHud.airspeed, 1)} unit="m/s" />
        <StatRow label="Heading" value={formatNumber(vfrHud.heading, 0)} unit="°" />
        <StatRow label="Throttle" value={hudThrottle.value} unit="%" />
      </div>
    </PanelContainer>
  );
}
