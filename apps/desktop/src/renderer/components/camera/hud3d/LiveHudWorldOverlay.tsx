/**
 * Live data source for the HUD world overlay. Mirrors LiveFighterHud: the
 * overlay itself (HudWorldOverlay) is pure, this maps the mission store into it.
 * The vehicle POSE + FOV are passed in by the background view (SyntheticVisionView
 * hands down its SVT camera's exact pose + fov) so the world-locked waypoints
 * align with the terrain with no calibration.
 */

import { memo, useMemo } from 'react';
import { useMissionStore } from '../../../stores/mission-store';
import { useHudStore } from '../../../stores/hud-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { bearingDeg, haversineMeters } from '../../../utils/osd/live-telemetry';
import { wrap180 } from '../hud/hud-geometry';
import { resolveHudProfile } from '../hud/hud-config';
import { HudWorldOverlay, type OverlayWaypoint } from './HudWorldOverlay';

/** Cap on waypoints fed to the overlay so a large survey does not flood it. The
    converging route line still reads as a highway toward the horizon. */
const MAX_OVERLAY_WAYPOINTS = 28;

export interface WorldOverlayPose {
  /** Vehicle geodetic position. */
  lat: number;
  lon: number;
  /** Vehicle MSL altitude, metres. */
  altMsl: number;
  /** Orientation, degrees. */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Background camera vertical FOV, degrees (match it exactly). */
  fov: number;
}

export const LiveHudWorldOverlay = memo(function LiveHudWorldOverlay({ pose }: { pose: WorldOverlayPose }) {
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const home = useMissionStore((s) => s.homePosition);

  // The waypoints overlay lives in the HUD instruments editor (HudPanel), so it
  // is gated by the HUD config widget flag for the active arrangement — the same
  // air/ground map the rendered instruments use — NOT the OSD layers menu.
  const config = useHudStore((s) => s.config);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const profile = resolveHudProfile(config.profile, mavType);
  const enabled = (profile === 'ground' ? config.widgetsGround : config.widgets).waypoints;

  // Show the nearest waypoints that are AHEAD of the vehicle (within the forward
  // hemisphere of its heading). A forward-facing HUD can only render what is in
  // front; when the drone sits inside a survey grid, waypoints beside and behind
  // it fill the map but project off-screen or behind the camera, so an
  // all-directions "nearest" set left the HUD looking empty. Restricting to the
  // forward cone keeps exactly the waypoints actually in frame, and their seq+1
  // numbers still match the map for those same waypoints. (0,0) placeholders are
  // dropped; the kept set is ordered by seq for a coherent route line. If the
  // vehicle happens to face away from every waypoint we fall back to the nearest
  // overall so it never blanks entirely.
  const { list: waypoints, activeSeq } = useMemo<{ list: OverlayWaypoint[]; activeSeq: number | null }>(() => {
    const coords = missionItems.filter(
      (it) => Number.isFinite(it.latitude) && Number.isFinite(it.longitude) && (it.latitude !== 0 || it.longitude !== 0),
    );
    if (coords.length === 0) return { list: [], activeSeq: null };
    const withDist = coords.map((it) => {
      const d = haversineMeters(pose.lat, pose.lon, it.latitude, it.longitude);
      const rel = Math.abs(wrap180(bearingDeg(pose.lat, pose.lon, it.latitude, it.longitude) - pose.yawDeg));
      return { it, d, ahead: rel <= 80 };
    });
    const ahead = withDist.filter((x) => x.ahead);
    const pool = ahead.length > 0 ? ahead : withDist;
    pool.sort((a, b) => a.d - b.d);
    const near = pool
      .slice(0, MAX_OVERLAY_WAYPOINTS)
      .map((x) => x.it)
      .sort((a, b) => a.seq - b.seq);
    const list = near.map((it) => ({
      seq: it.seq,
      lat: it.latitude,
      lon: it.longitude,
      alt: it.altitude,
      frame: it.frame,
    }));
    // Emphasise the FC's active waypoint (matches the map's amber highlight) when
    // it is one of the shown ones; nothing is "active" when the mission is idle.
    const active = currentSeq != null && near.some((it) => it.seq === currentSeq) ? currentSeq : null;
    return { list, activeSeq: active };
  }, [missionItems, currentSeq, pose.lat, pose.lon, pose.yawDeg]);

  if (!enabled || waypoints.length === 0) return null;

  const origin = home ? { lat: home.lat, lon: home.lon, altMsl: home.alt } : null;

  return (
    <HudWorldOverlay
      lat={pose.lat}
      lon={pose.lon}
      altMsl={pose.altMsl}
      origin={origin}
      yawDeg={pose.yawDeg}
      pitchDeg={pose.pitchDeg}
      rollDeg={pose.rollDeg}
      fov={pose.fov}
      waypoints={waypoints}
      activeSeq={activeSeq}
    />
  );
});
