import { TileLayer } from 'react-leaflet';

export function OpenAipOverlay() {
  return (
    <TileLayer
      url="tile-cache://openaip/{z}/{x}/{y}.png"
      opacity={0.8}
      maxNativeZoom={14}
      maxZoom={22}
      zIndex={4}
    />
  );
}
