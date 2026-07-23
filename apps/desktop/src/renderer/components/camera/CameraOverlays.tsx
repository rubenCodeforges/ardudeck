/**
 * The overlay stack drawn on top of a view, shared by the live camera feed
 * (CameraView) and the synthetic-vision world (SyntheticVisionView) so both get
 * identical, theme-consistent symbology.
 *
 * For the active ("primary") vehicle the full flight HUD (LiveFighterHud) is
 * available and supersedes the simpler horizon/crosshair/telemetry layers to
 * avoid double-drawing; grid tiles get the lightweight CameraOsd only.
 */

import { useEffect } from 'react';
import type { OsdLayers } from '../../../shared/camera-types';
import type { FleetVehicle } from '../../hooks/useFleet';
import { CameraOsd } from './CameraOsd';
import { LiveFighterHud } from './hud/LiveFighterHud';
import { LiveHudWorldOverlay, type WorldOverlayPose } from './hud3d/LiveHudWorldOverlay';
import { MountPoint } from '../../modules/MountPoint';
import { useHudOverlayStore } from '../../stores/hud-overlay-store';

interface CameraOverlaysProps {
  vehicle: FleetVehicle | null;
  isPrimary: boolean;
  osd: OsdLayers;
  /** Roll/pitch in degrees for the conformal horizon (active vehicle only). */
  attitude?: { roll: number; pitch: number } | null;
  /** Frame-center ground coordinate, when projectable (live gimbal views only). */
  frameCenter?: { lat: number; lon: number } | null;
  /**
   * Background camera pose + FOV for the world-locked 3D waypoint overlay. When
   * supplied (Synthetic Vision passes its SVT camera's exact pose + fov), the
   * overlay renders world-locked mission symbology that aligns with the terrain.
   * Omitted for backgrounds without a known pose (e.g. an uncalibrated live feed).
   */
  worldOverlay?: WorldOverlayPose | null;
}

export function CameraOverlays({ vehicle, isPrimary, osd, attitude = null, frameCenter = null, worldOverlay = null }: CameraOverlaysProps) {
  const hudActive = isPrimary && osd.hud;
  const setHudOverlayActive = useHudOverlayStore((s) => s.setActive);

  // Tell the module host API when a HUD-aligned reticle should draw. Only the
  // primary vehicle's HUD defines the projection, so gate on hudActive.
  useEffect(() => {
    if (!isPrimary) return;
    setHudOverlayActive(hudActive);
    return () => setHudOverlayActive(false);
  }, [isPrimary, hudActive, setHudOverlayActive]);

  return (
    <>
      {/* World-locked 3D waypoint overlay — painted BETWEEN the background and
          the 2D SVG HUD, so the mission symbology sits in the world while the
          instruments stay screen-fixed. Primary vehicle only + needs a background
          pose (Synthetic Vision); the on/off toggle is the HUD `waypoints` widget
          (checked inside LiveHudWorldOverlay), which lives in the HUD editor. */}
      {isPrimary && worldOverlay && <LiveHudWorldOverlay pose={worldOverlay} />}
      {hudActive && <LiveFighterHud />}
      {/* Module-contributed camera/HUD overlays. Drawn on
          the same viewport as the fighter HUD; modules self-gate via host.hud. */}
      {isPrimary && <MountPoint name="cameraOverlay" />}
      <CameraOsd
        layers={
          hudActive
            ? { ...osd, cornerTelemetry: false, crosshair: false, artificialHorizon: false, northIndicator: false }
            : osd
        }
        vehicle={vehicle}
        attitude={isPrimary ? attitude : null}
        frameCenter={frameCenter}
      />
    </>
  );
}
