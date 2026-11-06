import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';
import { registerMapCenter } from '../../stores/user-models-store';
import { useModelFileDrop, ModelDropOverlay } from './ModelDropOverlay';

/** File drop and map-centre source for a MapLibre map; pass null until the map exists. */
export function UserModelsMapLibreDrop({ map }: { map: maplibregl.Map | null }): JSX.Element | null {
  useEffect(() => {
    if (!map) return;
    const reg = registerMapCenter(() => {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    });
    const touch = () => reg.touch();
    map.on('mousedown', touch);
    map.on('movestart', touch);
    return () => { map.off('mousedown', touch); map.off('movestart', touch); reg.dispose(); };
  }, [map]);

  const container = map?.getContainer() ?? null;
  const active = useModelFileDrop(container, (e) => {
    if (!map) return null;
    const rect = map.getCanvasContainer().getBoundingClientRect();
    const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    return { lat: ll.lat, lng: ll.lng };
  });

  return <ModelDropOverlay container={container} active={active} />;
}
