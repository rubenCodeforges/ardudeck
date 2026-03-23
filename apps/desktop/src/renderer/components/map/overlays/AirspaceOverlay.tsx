import { Polygon } from 'react-leaflet';
import { useOverlayStore } from '../../../stores/overlay-store';
import type { AirspaceType } from '../../../../shared/overlay-types';

const AIRSPACE_COLORS: Record<AirspaceType, { fill: string; border: string }> = {
  restricted: { fill: 'rgba(255, 0, 0, 0.15)', border: 'rgba(255, 0, 0, 0.50)' },
  prohibited: { fill: 'rgba(255, 0, 0, 0.15)', border: 'rgba(255, 0, 0, 0.50)' },
  danger: { fill: 'rgba(255, 150, 0, 0.15)', border: 'rgba(255, 150, 0, 0.50)' },
  ctr: { fill: 'rgba(0, 100, 255, 0.12)', border: 'rgba(0, 100, 255, 0.55)' },
  tma: { fill: 'rgba(160, 32, 240, 0.12)', border: 'rgba(160, 32, 240, 0.40)' },
  other: { fill: 'rgba(128, 128, 128, 0.10)', border: 'rgba(128, 128, 128, 0.40)' },
};

export function AirspaceOverlay() {
  const airspaceData = useOverlayStore((s) => s.airspaceData);

  return (
    <>
      {airspaceData.map((as, i) => {
        const colors = AIRSPACE_COLORS[as.type];
        return (
          <Polygon
            key={`${as.name}-${i}`}
            positions={as.points}
            pathOptions={{
              fillColor: colors.fill,
              fillOpacity: 1,
              color: colors.border,
              weight: 1.5,
              opacity: 1,
              interactive: false,
            }}
          />
        );
      })}
    </>
  );
}
