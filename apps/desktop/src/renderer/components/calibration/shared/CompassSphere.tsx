/**
 * The calibration sphere, drawn as the thing it actually is.
 *
 * A compass calibration fits a sphere to the magnetometer samples: turning the
 * aircraft sweeps the field vector over that sphere, and the solver can only
 * place the offsets where it has data. ArduPilot tracks that coverage on a
 * geodesic grid of 80 triangles and sends it in every progress frame, which is
 * what `completion_mask` is.
 *
 * So this draws those 80 triangles, and then goes further: it turns itself so
 * the biggest unsampled patch faces the pilot, marks that patch, and draws an
 * arrow from where the aircraft is pointing to where it needs to go. A free
 * spin showed the covered side half the time, which is the half that needs no
 * attention.
 *
 * Ported from the mobile app's compass_sphere.dart, sharing the same grid and
 * the same aiming maths, so the two apps behave identically.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GEODESIC_SECTIONS,
  gapDirection,
  normalise,
  sectionCentre,
  sectionCovered,
  type Vec3,
} from '../../../../shared/geodesic-grid';

interface CompassSphereProps {
  /** The 10-byte completion mask, or null before the first frame arrives. */
  mask: number[] | null;
  /** Direction of the most recent sample, body frame, for the "you are here" marker. */
  direction?: [number, number, number] | null;
  size?: number;
  /** Aiming stops when the run does. Animation on a finished screen is heat. */
  spinning?: boolean;
}

const ACCENT = '56, 189, 248'; // sky-400
const GRID = '148, 163, 184'; // slate-400

/** Shortest signed distance between two angles. */
function wrapAngle(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function CompassSphere({ mask, direction, size = 260, spinning = true }: CompassSphereProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Where the camera is now, and where it is heading.
  const camera = useRef({ yaw: 0, tilt: 0.42, targetYaw: 0, targetTilt: 0.42 });
  /**
   * Manual override. Someone who wants to look at a different part of the ball
   * should be able to, so dragging suspends the aiming until they let go.
   */
  const manual = useRef(false);
  const data = useRef({ mask, direction, spinning });
  data.current = { mask, direction, spinning };

  /**
   * Turn the ball so the biggest unsampled patch faces the pilot.
   *
   * Solving for the angles is exact: with the view transform below, the yaw
   * that maximises the depth of a direction (x, y, z) is pi/2 - atan2(y, x),
   * and the tilt is atan2(hypot(x, y), z).
   */
  const aimAtGap = (snap: boolean) => {
    const current = data.current.mask;
    if (!current) return;
    const gap = gapDirection(current);
    if (!gap) return;
    if (manual.current && !snap) return;

    const r = Math.hypot(gap[0], gap[1]);
    camera.current.targetYaw = Math.PI / 2 - Math.atan2(gap[1], gap[0]);
    camera.current.targetTilt = Math.atan2(r, gap[2]);
    if (snap) {
      camera.current.yaw = camera.current.targetYaw;
      camera.current.tilt = camera.current.targetTilt;
    }
  };

  // Re-aim whenever coverage changes: once a patch fills, the next one is the
  // target, so the guidance walks the pilot around the sphere on its own.
  const maskKey = mask ? mask.join(',') : '';
  const snappedRef = useRef(false);
  useEffect(() => {
    if (!mask) return;
    aimAtGap(!snappedRef.current);
    snappedRef.current = true;
    // aimAtGap reads the latest mask through the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;

    const view = (v: Vec3, yaw: number, tilt: number): Vec3 => {
      const cy = Math.cos(yaw); const sy = Math.sin(yaw);
      const rx = v[0] * cy - v[1] * sy;
      const ry = v[0] * sy + v[1] * cy;
      const ct = Math.cos(tilt); const st = Math.sin(tilt);
      return [rx, ry * ct - v[2] * st, ry * st + v[2] * ct];
    };

    const render = () => {
      frame = requestAnimationFrame(render);
      const state = data.current;
      const cam = camera.current;

      // Ease toward the target, shortest way round, so it never takes the long
      // way to something a few degrees away.
      if (state.spinning) {
        const dy = wrapAngle(cam.targetYaw - cam.yaw);
        const dt = cam.targetTilt - cam.tilt;
        if (Math.abs(dy) > 0.002 || Math.abs(dt) > 0.002) {
          cam.yaw += dy * 0.06;
          cam.tilt += dt * 0.06;
        }
      }

      const { yaw, tilt } = cam;
      const centre = size / 2;
      const radius = size / 2 - 1;
      const project = (v: Vec3): [number, number] => [centre + v[0] * radius, centre + v[1] * radius];

      ctx.clearRect(0, 0, size, size);

      // Depth sort so near faces cover far ones. Cheap and exact enough for a
      // convex solid.
      const order = GEODESIC_SECTIONS.map((tri, i) => ({
        i,
        depth: view(sectionCentre(tri), yaw, tilt)[2],
      })).sort((a, b) => a.depth - b.depth);

      for (const { i, depth } of order) {
        const tri = GEODESIC_SECTIONS[i]!;
        const front = depth > 0;
        const pts = tri.map((v) => project(view(v, yaw, tilt)));

        ctx.beginPath();
        ctx.moveTo(pts[0]![0], pts[0]![1]);
        ctx.lineTo(pts[1]![0], pts[1]![1]);
        ctx.lineTo(pts[2]![0], pts[2]![1]);
        ctx.closePath();

        if (state.mask && sectionCovered(state.mask, i)) {
          // Facing the light a little: the front of the solid is brighter, so
          // the shape reads as a ball rather than a flat mosaic.
          const shade = front ? Math.min(1, 0.55 + 0.45 * depth) : 0.14;
          ctx.fillStyle = `rgba(${ACCENT}, ${shade})`;
        } else {
          // Uncovered sections stay dark, and the back ones darker still, so
          // the eye lands on the holes.
          ctx.fillStyle = `rgba(${GRID}, ${front ? 0.16 : 0.05})`;
        }
        ctx.fill();

        ctx.strokeStyle = `rgba(${GRID}, ${front ? 0.45 : 0.12})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // The target: the middle of the patch still to be covered. Marked so the
      // pilot has something to aim at rather than a field of dark triangles to
      // interpret.
      const gap = state.mask ? gapDirection(state.mask) : null;
      let gapPoint: [number, number] | null = null;
      if (gap) {
        const gv = view(gap, yaw, tilt);
        if (gv[2] >= -0.2) {
          gapPoint = project(gv);
          ctx.beginPath();
          ctx.arc(gapPoint[0], gapPoint[1], 7, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${ACCENT}, 1)`;
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(gapPoint[0], gapPoint[1], 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${ACCENT}, 1)`;
          ctx.fill();
        }
      }

      // Where the vehicle is pointing right now.
      const d = state.direction;
      if (d && (d[0] !== 0 || d[1] !== 0 || d[2] !== 0)) {
        const v = view(normalise(d as Vec3), yaw, tilt);
        if (v[2] >= 0) {
          const from = project(v);
          ctx.beginPath();
          ctx.arc(from[0], from[1], 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // The instruction, as one arrow: move the white marker onto the
          // target. Which way to turn the aircraft is then something the pilot
          // reads off the picture rather than a sentence naming an axis.
          if (gapPoint) {
            const dx = gapPoint[0] - from[0];
            const dy = gapPoint[1] - from[1];
            const dist = Math.hypot(dx, dy);
            if (dist > 14) {
              const ux = dx / dist; const uy = dy / dist;
              // Stop short of both markers so the arrow connects them rather
              // than striking through.
              const ax = from[0] + ux * 8; const ay = from[1] + uy * 8;
              const bx = gapPoint[0] - ux * 10; const by = gapPoint[1] - uy * 10;
              ctx.strokeStyle = `rgba(${ACCENT}, 0.85)`;
              ctx.lineWidth = 1.8;
              ctx.lineCap = 'round';
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
              // Head.
              const lx = -uy; const ly = ux;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx - ux * 6 + lx * 4, by - uy * 6 + ly * 4);
              ctx.moveTo(bx, by);
              ctx.lineTo(bx - ux * 6 - lx * 4, by - uy * 6 - ly * 4);
              ctx.stroke();
            }
          }
        }
      }
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [size]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    manual.current = true;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1) return;
    const cam = camera.current;
    cam.yaw += e.movementX * 0.012;
    cam.tilt = Math.max(-1.4, Math.min(1.4, cam.tilt - e.movementY * 0.012));
    cam.targetYaw = cam.yaw;
    cam.targetTilt = cam.tilt;
  };
  // Handing control back after a moment means the guidance resumes without the
  // pilot having to know there was a mode.
  const endDrag = () => { manual.current = false; };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, touchAction: 'none', cursor: 'grab' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={t('calibration:compassSphere.ariaLabel')}
    />
  );
}
