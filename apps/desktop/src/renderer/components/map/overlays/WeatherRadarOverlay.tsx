import { TileLayer } from 'react-leaflet';
import { useOverlayStore } from '../../../stores/overlay-store';

// Dark base layers get the blue scheme, light layers get NEXRAD green/yellow/red
const DARK_LAYERS = new Set(['dark', 'satellite', 'googleSat', 'googleHybrid']);

/** Color scheme ID for RainViewer tiles: 2 = Universal Blue, 6 = NEXRAD Level III */
function getRadarColorScheme(baseLayer: string): number {
  return DARK_LAYERS.has(baseLayer) ? 2 : 6;
}

export function WeatherRadarOverlay({ baseLayer }: { baseLayer: string }) {
  const radarMeta = useOverlayStore((s) => s.radarMeta);

  if (!radarMeta) return null;

  const colorScheme = getRadarColorScheme(baseLayer);
  // Encode timestamp + color scheme so different schemes cache separately
  const layerName = `radar-${radarMeta.time}-c${colorScheme}`;

  return (
    <TileLayer
      key={layerName}
      url={`tile-cache://${layerName}/{z}/{x}/{y}.png`}
      opacity={0.75}
      maxNativeZoom={6}
      maxZoom={22}
      zIndex={5}
    />
  );
}
