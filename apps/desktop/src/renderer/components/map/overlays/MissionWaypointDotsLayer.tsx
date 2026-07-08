/**
 * Optional telemetry-map layer: every located mission waypoint as a quiet
 * batched canvas dot, reusing the mission editor's tier-1 renderer.
 *
 * The flight map's default presentation stays semantic (route polyline +
 * decision pins) - this layer exists for zoomed-in coverage checks mid-flight
 * on large generated missions. Deliberately read-only: no hit-testing, no
 * markers, nothing clickable near the vehicle.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { commandHasLocation, hasValidCoordinates } from '../../../../shared/mission-types';
import { useMissionStore } from '../../../stores/mission-store';
import {
  buildGridIndex,
  meanConsecutiveSpacing,
  pickCellSize,
  type XY,
} from '../../mission/waypoint-tiers';
import {
  createWaypointCanvasLayer,
  WAYPOINT_REF_ZOOM,
  type WaypointCanvasLayer,
  type WaypointDotInfo,
} from '../../mission/waypoint-canvas-layer';
import { getCommandColor } from '../../mission/waypoint-markers';

const EMPTY_SUPPRESSED: ReadonlySet<number> = new Set();

export function MissionWaypointDotsLayer() {
  const map = useMap();
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);

  const waypoints = useMemo(
    () =>
      missionItems.filter(
        (it) => commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude),
      ),
    [missionItems],
  );

  const points = useMemo<XY[]>(
    () =>
      waypoints.map((wp) => {
        const p = map.project([wp.latitude, wp.longitude], WAYPOINT_REF_ZOOM);
        return { x: p.x, y: p.y };
      }),
    [waypoints, map],
  );

  const index = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const cellSize = points.length > 0 ? pickCellSize(maxX - minX, maxY - minY, points.length) : 1;
    return buildGridIndex(points, cellSize);
  }, [points]);

  const meanSpacing = useMemo(() => meanConsecutiveSpacing(points), [points]);

  const { infos, maxLabel } = useMemo(() => {
    let max = 1;
    const list: WaypointDotInfo[] = waypoints.map((wp) => {
      const num = wp.seq + 1;
      if (num > max) max = num;
      return { seq: wp.seq, color: getCommandColor(wp.command), label: String(num) };
    });
    return { infos: list, maxLabel: max };
  }, [waypoints]);

  const layerRef = useRef<WaypointCanvasLayer | null>(null);
  useEffect(() => {
    const layer = createWaypointCanvasLayer(map);
    layerRef.current = layer;
    return () => {
      layerRef.current = null;
      layer.dispose();
    };
  }, [map]);

  useEffect(() => {
    layerRef.current?.setData({
      index,
      infos,
      meanSpacing,
      maxLabel,
      selectedSeq: null,
      currentSeq,
      suppressed: EMPTY_SUPPRESSED,
    });
  }, [index, infos, meanSpacing, maxLabel, currentSeq]);

  return null;
}
