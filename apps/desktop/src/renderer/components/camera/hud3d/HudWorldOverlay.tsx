/**
 * HUD world overlay — a transparent 3D layer that paints WORLD-LOCKED mission
 * symbology (the shared waypoint "highway in the sky") over whatever background
 * the HUD sits on. Today that background is Synthetic Vision; tomorrow it can be
 * a real camera feed. The overlay owns its own three.js renderer + perspective
 * camera; the background is just a video stream we paint over.
 *
 * Alignment: the overlay is driven with the SAME pose + FOV as the background
 * camera. For Synthetic Vision we own that camera, so we take its FOV directly
 * and place this camera at the vehicle with the same euler + fov — the waypoints
 * then land on the SVT terrain with no per-scene calibration. Horizontal bearing
 * is exact by construction (only the relative camera->waypoint geometry drives
 * the projection); vertical uses true MSL for both the eye and the waypoints, so
 * it is exact in flight (it can differ only when landed, where SVT floors the eye
 * a few metres off the surface).
 *
 * Performance: the HUD updates at telemetry rate (a few Hz in the field), so this
 * renders ON DEMAND — a single draw whenever the pose / mission / size changes,
 * never a free-running 60 fps loop. There is no billboard animation to gate for
 * prefers-reduced-motion (the sprites are static and only face the camera).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { latLngToLocal } from '../../survey/geo-math';
import { mavFrameToAltFrame } from '../../../../shared/mission-types';
import { createWaypointSymbology, type Wp, type WaypointSymbology } from './waypoint-symbology';

const DEG = Math.PI / 180;

/** A mission waypoint in geodetic space, for the world-locked overlay. */
export interface OverlayWaypoint {
  seq: number;
  lat: number;
  lon: number;
  /** Altitude metres, in this waypoint's own MAV_FRAME (see `frame`). */
  alt: number;
  /** MAV_FRAME of `alt` (relative-to-home vs MSL vs terrain). */
  frame: number;
}

interface HudWorldOverlayProps {
  /** Vehicle geodetic position (the overlay camera sits here). */
  lat: number;
  lon: number;
  /** Vehicle MSL altitude, metres. */
  altMsl: number;
  /** Local NED origin (home). Falls back to the vehicle position when null.
      `altMsl` is home's MSL altitude, used to lift relative-frame waypoints. */
  origin: { lat: number; lon: number; altMsl: number } | null;
  /** Orientation, degrees. */
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  /** Camera vertical FOV, degrees — match the background camera exactly. */
  fov: number;
  waypoints: OverlayWaypoint[];
  /** Sequence of the active / next waypoint (brighter, larger reticle), or null. */
  activeSeq: number | null;
}

/** three.x = East, three.y = Up, three.z = -North (NED [n,e,d] -> three). */
function nedToThree(pos: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  return out.set(pos[1], -pos[2], -pos[0]);
}

export function HudWorldOverlay({
  lat, lon, altMsl, origin, yawDeg, pitchDeg, rollDeg, fov, waypoints, activeSeq,
}: HudWorldOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const symRef = useRef<WaypointSymbology | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  // Local NED origin: home if we have it, else the vehicle itself (a vehicle-
  // centred frame is equally valid — only relative geometry drives the view).
  const org = origin ?? { lat, lon, altMsl };

  // Geodetic waypoints -> NED [north, east, down] from the origin, with down set
  // so three.y = (waypoint MSL - origin MSL). Relative/terrain frames are lifted
  // onto home's MSL; asl frames are already MSL. Memoised on the mission inputs.
  const wps = useMemo<Wp[]>(() => {
    return waypoints.map((wp) => {
      const l = latLngToLocal({ lat: org.lat, lng: org.lon }, { lat: wp.lat, lng: wp.lon });
      const wpMsl = mavFrameToAltFrame(wp.frame) === 'asl' ? wp.alt : org.altMsl + wp.alt;
      const down = org.altMsl - wpMsl;
      return { seq: wp.seq, position: [l.y, l.x, down] as [number, number, number], active: wp.seq === activeSeq };
    });
  }, [waypoints, org.lat, org.lon, org.altMsl, activeSeq]);

  // ─── Renderer lifecycle (mount once) ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Transparent context: clear colour alpha 0 so only the symbology paints.
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(fov, 1, 1, 200_000);
    camera.rotation.order = 'YXZ';

    // Compact HUD mode: constant screen-size reticles + ≤2 labels + thin route
    // line, so close-up waypoints augment rather than obscure the view.
    const sym = createWaypointSymbology({ compact: true });
    scene.add(sym.group);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    symRef.current = sym;

    const parent = canvas.parentElement;
    const measure = () => {
      const r = (parent ?? canvas).getBoundingClientRect();
      setSize({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (parent) ro.observe(parent);

    return () => {
      ro.disconnect();
      sym.dispose();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      symRef.current = null;
    };
    // fov is applied in the draw effect; only mount/unmount here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── On-demand draw: one render per pose / mission / size change ───────────
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const sym = symRef.current;
    if (!renderer || !scene || !camera || !sym) return;

    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / Math.max(1, size.h);
    camera.fov = fov;

    // Camera at the vehicle, oriented like the background camera (SVT/sim euler:
    // order YXZ, x = pitch, y = -yaw, z = -roll). Position in the same NED-from-
    // origin frame as the waypoints (three.y = vehicle MSL - origin MSL).
    const l = latLngToLocal({ lat: org.lat, lng: org.lon }, { lat, lng: lon });
    nedToThree([l.y, l.x, org.altMsl - altMsl], camera.position);
    camera.rotation.set(pitchDeg * DEG, -yawDeg * DEG, -rollDeg * DEG);
    camera.updateProjectionMatrix();

    // Slant-range captions are measured from the vehicle (the camera position).
    sym.update(wps, camera.position, activeSeq);

    renderer.render(scene, camera);
  }, [size.w, size.h, fov, lat, lon, altMsl, org.lat, org.lon, org.altMsl, yawDeg, pitchDeg, rollDeg, wps, activeSeq]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
