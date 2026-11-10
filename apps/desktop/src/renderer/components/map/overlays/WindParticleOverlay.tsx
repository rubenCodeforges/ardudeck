/**
 * WindParticleOverlay — animated wind particles on the Leaflet planning map.
 *
 * Hosts a transparent canvas in a dedicated pane (above tiles, below markers),
 * runs the Canvas2D particle animator, and fetches the wind field for the
 * current view (debounced) on activation and after map moves. The canvas is
 * hidden during pan/zoom and snapped back into place on settle, which keeps it
 * aligned without fighting Leaflet's pane transforms.
 */

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import { useWindStore } from '../../../stores/wind-store';
import { WindAnimator, type WindProjector, type FrameRef } from '../wind/wind-animator';
import type { WindBBox } from '../../../../shared/wind-types';
import { isPicking } from '../../../hooks/map-picking';

const PANE = 'windParticles';
const FETCH_DEBOUNCE_MS = 700;

export function WindParticleOverlay(): null {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane(PANE)) {
      const p = map.createPane(PANE);
      p.style.zIndex = '250';
      p.style.pointerEvents = 'none';
    }
    const pane = map.getPane(PANE)!;
    const canvas = L.DomUtil.create('canvas', 'leaflet-wind-canvas', pane) as HTMLCanvasElement;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';

    const viewBounds = (): WindBBox => {
      const b = map.getBounds();
      return { south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast() };
    };

    const projector: WindProjector = {
      project: (lat, lng) => {
        const pt = map.latLngToContainerPoint([lat, lng]);
        return { x: pt.x, y: pt.y };
      },
      getZoom: () => map.getZoom(),
      getViewBounds: viewBounds,
    };

    const getFrame = (): FrameRef | null => {
      const { field, frameIndex } = useWindStore.getState();
      if (!field) return null;
      const frame = field.frames[frameIndex];
      return frame ? { field, frame } : null;
    };

    const animator = new WindAnimator(
      canvas,
      projector,
      getFrame,
      () => useWindStore.getState().speedScale,
    );

    const place = (): void => {
      const size = map.getSize();
      animator.resize(size.x, size.y);
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    };

    let fetchTimer: number | null = null;
    const scheduleFetch = (): void => {
      if (fetchTimer !== null) window.clearTimeout(fetchTimer);
      fetchTimer = window.setTimeout(() => {
        void useWindStore.getState().fetchForBounds(viewBounds());
      }, FETCH_DEBOUNCE_MS);
    };

    const onInteractStart = (): void => {
      canvas.style.visibility = 'hidden';
      animator.stop();
      animator.clear();
    };
    const onInteractEnd = (): void => {
      place();
      canvas.style.visibility = '';
      animator.start();
      scheduleFetch();
    };

    // Plain click probes the wind rose at that point. Shift+click adds waypoints, and while a
    // tool is placing something (waypoint, home, fence, survey) the click is that tool's.
    const onClick = (e: L.LeafletMouseEvent): void => {
      if (e.originalEvent.shiftKey || isPicking(map.getContainer())) return;
      useWindStore.getState().setProbe({ lat: e.latlng.lat, lng: e.latlng.lng });
    };

    map.on('movestart', onInteractStart);
    map.on('zoomstart', onInteractStart);
    map.on('moveend', onInteractEnd);
    map.on('zoomend', onInteractEnd);
    map.on('resize', place);
    map.on('click', onClick);

    // Initial: size, animate, and fetch immediately for the current view.
    console.info('[wind] overlay mounted, starting animator + fetch'); // temporary diagnostic
    place();
    animator.start();
    void useWindStore.getState().fetchForBounds(viewBounds());

    return () => {
      if (fetchTimer !== null) window.clearTimeout(fetchTimer);
      map.off('movestart', onInteractStart);
      map.off('zoomstart', onInteractStart);
      map.off('moveend', onInteractEnd);
      map.off('zoomend', onInteractEnd);
      map.off('resize', place);
      map.off('click', onClick);
      animator.stop();
      canvas.remove();
      useWindStore.getState().setProbe(null);
    };
  }, [map]);

  return null;
}
