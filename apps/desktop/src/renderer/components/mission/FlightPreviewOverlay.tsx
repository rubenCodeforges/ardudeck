/**
 * Flight preview: a kinematic gizmo that flies the planned mission on the map
 * so pilots can SEE what the aircraft and the camera will do before uploading.
 * Not a simulation - straight legs at the mission's speeds, yaw from the
 * mission's CONDITION_YAW commands (else along-track).
 *
 * `FlightPreviewGizmo` mounts inside the MapContainer; the transport controls
 * and timeline live in the docked FlightPreviewPanel.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Marker, Polygon, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMissionStore } from '../../stores/mission-store';
import { useFlightPreviewStore } from '../../stores/flight-preview-store';
import { buildFlightTimeline, sampleTimeline, type FlightTimeline } from './flight-preview';
import { shouldRecenter, FollowState } from './preview-follow';

const CAM_FOV_DEG = 62;
const CAM_RANGE_M = 28;

function offsetLatLng(lat: number, lng: number, headingDeg: number, distM: number): [number, number] {
  const rad = (headingDeg * Math.PI) / 180;
  const dLat = (Math.cos(rad) * distM) / 111320;
  const dLng = (Math.sin(rad) * distM) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}

function droneIcon(headingDeg: number): L.DivIcon {
  return L.divIcon({
    className: 'flight-preview-drone',
    html: `<div style="transform: rotate(${headingDeg}deg); width: 26px; height: 26px; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));">
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path d="M12 2 L16 14 L12 11.5 L8 14 Z" fill="#22d3ee" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Timeline of the previewed scope: one WP group, or the entire mission. */
export function useFlightPreviewTimeline(): FlightTimeline {
  const missionItems = useMissionStore((s) => s.missionItems);
  const groupId = useFlightPreviewStore((s) => s.groupId);
  return useMemo(() => {
    // A remembered group id can go stale (re-inserting a survey mints a new
    // id). Falling back to the entire mission beats a bogus "no flyable
    // waypoints" on a mission that clearly has them.
    const scoped = groupId ? missionItems.filter((it) => it.groupId === groupId) : missionItems;
    const items = scoped.length > 0 ? scoped : missionItems;
    return buildFlightTimeline(items, 8);
  }, [missionItems, groupId]);
}

export function FlightPreviewGizmo() {
  const isActive = useFlightPreviewStore((s) => s.isActive);
  const timeMs = useFlightPreviewStore((s) => s.timeMs);
  const advance = useFlightPreviewStore((s) => s.advance);
  const playing = useFlightPreviewStore((s) => s.playing);
  const timeline = useFlightPreviewTimeline();

  // Animation loop - drives the store clock while playing.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isActive || !playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      advance(now - last, timeline.durationMs);
      last = now;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, playing, advance, timeline.durationMs]);

  const sample = isActive ? sampleTimeline(timeline, timeMs) : null;

  // Keep the aircraft on screen, or the preview plays out beyond the edge of
  // the map. Dragging the map hands control back to the pilot until they
  // press play again.
  const map = useMap();
  const follow = useRef(new FollowState());
  useEffect(() => {
    if (playing) follow.current.restart();
  }, [playing]);
  useEffect(() => {
    const onUserMove = (e: L.LeafletEvent & { hard?: boolean }) => {
      // Ignore the programmatic pans this effect makes itself.
      if ((e as { hard?: boolean }).hard !== true) follow.current.userMoved();
    };
    map.on('dragstart', onUserMove);
    map.on('zoomstart', onUserMove);
    return () => {
      map.off('dragstart', onUserMove);
      map.off('zoomstart', onUserMove);
    };
  }, [map]);
  useEffect(() => {
    if (!isActive || !playing || !sample || !follow.current.active) return;
    const size = map.getSize();
    const pt = map.latLngToContainerPoint([sample.lat, sample.lng]);
    if (shouldRecenter(pt, { width: size.x, height: size.y }).recenter) {
      map.panTo([sample.lat, sample.lng], { animate: true, duration: 0.4, noMoveStart: true });
    }
  }, [isActive, playing, sample, map]);

  const trail = useMemo(() => {
    if (!isActive || !sample) return null;
    const pts: [number, number][] = [];
    for (const seg of timeline.segments) {
      if (seg.t1 <= timeMs) {
        if (pts.length === 0) pts.push([seg.from.lat, seg.from.lng]);
        pts.push([seg.to.lat, seg.to.lng]);
      } else if (seg.t0 <= timeMs) {
        if (pts.length === 0) pts.push([seg.from.lat, seg.from.lng]);
        pts.push([sample.lat, sample.lng]);
        break;
      }
    }
    return pts.length >= 2 ? pts : null;
  }, [isActive, timeline, timeMs, sample]);

  if (!isActive || !sample) return null;

  // Camera cone: where the camera looks right now.
  const half = CAM_FOV_DEG / 2;
  const cone: [number, number][] = [
    [sample.lat, sample.lng],
    offsetLatLng(sample.lat, sample.lng, sample.camHeading - half, CAM_RANGE_M),
    offsetLatLng(sample.lat, sample.lng, sample.camHeading, CAM_RANGE_M * 1.12),
    offsetLatLng(sample.lat, sample.lng, sample.camHeading + half, CAM_RANGE_M),
  ];

  return (
    <>
      {trail && (
        <Polyline positions={trail} interactive={false} pathOptions={{ color: '#22d3ee', weight: 3, opacity: 0.85 }} />
      )}
      <Polygon
        positions={cone}
        interactive={false}
        pathOptions={{ color: '#f59e0b', weight: 2, opacity: 0.9, fillColor: '#f59e0b', fillOpacity: 0.3 }}
      />
      <Marker
        position={[sample.lat, sample.lng]}
        icon={droneIcon(sample.trackHeading)}
        interactive={false}
      />
    </>
  );
}
