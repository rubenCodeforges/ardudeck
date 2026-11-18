import { TileLayer } from 'react-leaflet';
import type { ModuleBasemapInfo } from '../../../shared/basemap-types';

/** A cargo base map on a Leaflet map: the base tiles, then its label overlay blended on top. */
export function ModuleBasemapTiles({ basemap }: { basemap: ModuleBasemapInfo }): JSX.Element {
  return (
    <>
      <TileLayer
        key={basemap.key}
        url={`tile-cache://${basemap.key}/{z}/{x}/{y}.png`}
        attribution={basemap.attribution}
        maxZoom={basemap.maxZoom}
        maxNativeZoom={basemap.maxNativeZoom}
      />
      {basemap.labelsKey && (
        <TileLayer
          key={basemap.labelsKey}
          url={`tile-cache://${basemap.labelsKey}/{z}/{x}/{y}.png`}
          maxZoom={basemap.maxZoom}
          maxNativeZoom={basemap.maxNativeZoom}
          zIndex={2}
        />
      )}
    </>
  );
}
