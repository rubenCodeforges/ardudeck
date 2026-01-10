import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

export function PositionPanel() {
  const { position } = useTelemetryStore();

  return (
    <PanelContainer>
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-gray-500 text-xs">Latitude</span>
          <span className="text-gray-200 font-mono text-sm">{formatNumber(position.lat, 6)}°</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-gray-500 text-xs">Longitude</span>
          <span className="text-gray-200 font-mono text-sm">{formatNumber(position.lon, 6)}°</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-gray-500 text-xs">Altitude</span>
          <span className="text-gray-200 font-mono text-sm">{formatNumber(position.alt, 1)} m</span>
        </div>
      </div>
    </PanelContainer>
  );
}
