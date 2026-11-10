import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useUserModelsStore, registerMapCenter } from '../../stores/user-models-store';
import { useModelFileDrop, ModelDropOverlay } from './ModelDropOverlay';
import { bearingFromOffsetPx, handleOffsetPx } from './user-models-helpers';

const HANDLE_RADIUS_PX = 56;

/** Inside a react-leaflet MapContainer: accepts dropped 3D model files and draws the adjust handles. */
export function UserModelsLeafletLayer(): JSX.Element | null {
  const map = useMap();

  useEffect(() => {
    const reg = registerMapCenter(() => {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    });
    const touch = () => reg.touch();
    map.on('mousedown movestart', touch);
    return () => { map.off('mousedown movestart', touch); reg.dispose(); };
  }, [map]);

  const dragging = useModelFileDrop(map.getContainer(), (e) => {
    const ll = map.mouseEventToLatLng(e);
    return { lat: ll.lat, lng: ll.lng };
  });

  return (
    <>
      <AdjustHandles map={map} />
      <ModelDropOverlay container={map.getContainer()} active={dragging} />
    </>
  );
}

function AdjustHandles({ map }: { map: L.Map }): null {
  const adjustId = useUserModelsStore((s) => s.adjustId);
  const model = useUserModelsStore((s) => s.models.find((m) => m.id === s.adjustId) ?? null);
  const modelRef = useRef(model);
  modelRef.current = model;
  const live = useRef<{ lat: number; lng: number; yaw: number } | null>(null);
  const syncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!adjustId || !modelRef.current) return;
    const p = modelRef.current.placement;
    live.current = { lat: p.lat, lng: p.lng, yaw: p.yawDeg };

    const originIcon = L.divIcon({
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      html: '<div style="width:22px;height:22px;border-radius:50%;background:rgba(20,184,166,0.9);border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.5);cursor:move"></div>',
    });
    const handleIcon = L.divIcon({
      className: '',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid rgb(20,184,166);box-shadow:0 0 4px rgba(0,0,0,0.5);cursor:grab"></div>',
    });

    const handleLatLng = () => {
      const s = live.current!;
      const o = map.latLngToContainerPoint([s.lat, s.lng]);
      const d = handleOffsetPx(s.yaw, HANDLE_RADIUS_PX);
      return map.containerPointToLatLng([o.x + d.x, o.y + d.y]);
    };

    const origin = L.marker([p.lat, p.lng], { icon: originIcon, draggable: true, zIndexOffset: 2000, keyboard: false }).addTo(map);
    const handle = L.marker(handleLatLng(), { icon: handleIcon, draggable: true, zIndexOffset: 2001, keyboard: false }).addTo(map);
    const line = L.polyline([[p.lat, p.lng], handleLatLng()], { color: 'rgb(20,184,166)', weight: 2, dashArray: '4 4', interactive: false }).addTo(map);

    const redraw = () => {
      const s = live.current!;
      const h = handleLatLng();
      handle.setLatLng(h);
      line.setLatLngs([[s.lat, s.lng], h]);
    };

    const persist = () => {
      const m = modelRef.current;
      const s = live.current;
      if (!m || !s) return;
      void useUserModelsStore.getState().updatePlacement(m.id, { ...m.placement, lat: s.lat, lng: s.lng, yawDeg: s.yaw });
    };

    origin.on('drag', () => {
      const ll = origin.getLatLng();
      live.current = { ...live.current!, lat: ll.lat, lng: ll.lng };
      redraw();
    });
    origin.on('dragend', persist);
    handle.on('drag', () => {
      const s = live.current!;
      const o = map.latLngToContainerPoint([s.lat, s.lng]);
      const h = map.latLngToContainerPoint(handle.getLatLng());
      live.current = { ...s, yaw: bearingFromOffsetPx(h.x - o.x, h.y - o.y) };
      line.setLatLngs([[s.lat, s.lng], handle.getLatLng()]);
    });
    handle.on('dragend', () => { redraw(); persist(); });
    map.on('zoomend viewreset', redraw);
    syncRef.current = () => {
      const s = live.current!;
      origin.setLatLng([s.lat, s.lng]);
      redraw();
    };

    return () => {
      syncRef.current = null;
      map.off('zoomend viewreset', redraw);
      origin.remove();
      handle.remove();
      line.remove();
    };
  }, [adjustId, map]);

  useEffect(() => {
    if (!model || !live.current) return;
    const p = model.placement;
    const s = live.current;
    if (p.lat !== s.lat || p.lng !== s.lng || p.yawDeg !== s.yaw) {
      live.current = { lat: p.lat, lng: p.lng, yaw: p.yawDeg };
      syncRef.current?.();
    }
  }, [model, map]);

  return null;
}
