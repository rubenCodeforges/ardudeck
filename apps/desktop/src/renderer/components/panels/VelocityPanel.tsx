import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

export function VelocityPanel() {
  const { position } = useTelemetryStore();

  return (
    <PanelContainer>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-gray-500 text-xs mb-1">North</div>
          <div className="text-gray-200 font-mono text-lg">{formatNumber(position.vx, 1)}</div>
          <div className="text-gray-600 text-[10px]">m/s</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">East</div>
          <div className="text-gray-200 font-mono text-lg">{formatNumber(position.vy, 1)}</div>
          <div className="text-gray-600 text-[10px]">m/s</div>
        </div>
        <div>
          <div className="text-gray-500 text-xs mb-1">Down</div>
          <div className="text-gray-200 font-mono text-lg">{formatNumber(position.vz, 1)}</div>
          <div className="text-gray-600 text-[10px]">m/s</div>
        </div>
      </div>
    </PanelContainer>
  );
}
