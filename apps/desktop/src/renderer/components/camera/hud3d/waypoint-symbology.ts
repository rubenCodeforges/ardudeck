/**
 * Shared 3D waypoint symbology — the conformal "highway in the sky" the pilot
 * likes from the Sim World, extracted so it can be reused by ANY three.js scene:
 * the in-app simulator world (sim-world-scene) AND the HUD's world-locked overlay
 * (HudWorldOverlay) that paints over synthetic vision (and, later, live video).
 *
 * Two looks share one implementation, selected by `options.compact`:
 *  - Perspective (default, the Sim World): billboard reticles + captions that
 *    grow with proximity (sizeAttenuation on), a core sphere + drop line per
 *    waypoint, a caption on every waypoint. Reads great from a chase camera.
 *  - Compact HUD (HudWorldOverlay): the same world-locked positions, but the
 *    reticles + labels are CONSTANT SCREEN SIZE (sizeAttenuation OFF) so a
 *    waypoint 20 m away does not fill the frame; captions show for only the
 *    active + next waypoint; no core spheres / drop lines; dimmer, thin route
 *    line. This is the augment-don't-cover look for a close-up first-person HUD.
 *
 * Coordinate frame — every position is NED metres [north, east, down] from the
 * scene origin (home in the sim world; the HUD's local origin in the overlay).
 * We map to three.js Y-up exactly as the sim world and the SVT scene do:
 *   three.x =  East  =  position[1]
 *   three.y =  Up    = -position[2]
 *   three.z = -North = -position[0]
 * so a caller that also positions its camera with this mapping gets waypoints
 * that land on the terrain with no per-scene calibration.
 */

import * as THREE from 'three';

/** A mission waypoint in local NED metres from the scene origin. */
export interface Wp {
  seq: number;
  /** NED metres [north, east, down] from the scene origin. */
  position: [number, number, number];
  /** The active / next waypoint — drawn with a brighter, larger reticle. When
      omitted, `activeSeq` passed to update() decides emphasis instead. */
  active?: boolean;
}

export interface WaypointSymbologyOptions {
  /**
   * Compact HUD mode: constant screen-size reticles (never balloon up close),
   * at most two captions (active + next), no core spheres / drop lines, dimmer
   * and a thin route line. Omit / false for the perspective Sim-World look.
   */
  compact?: boolean;
}

export interface WaypointSymbology {
  /** Add this to your scene. Holds every waypoint's persistent sprites/lines. */
  group: THREE.Group;
  /**
   * Rebuild the symbology when the mission (or active waypoint) changes, then
   * refresh each caption's live slant-range from `flownPos` (the flown vehicle's
   * three-space position, or the camera position as a fallback). `activeSeq`
   * flags the next waypoint for emphasis (or null / -1 for none).
   */
  update(waypoints: Wp[], flownPos: THREE.Vector3, activeSeq: number | null): void;
  /** Show / hide the whole group. */
  setVisible(on: boolean): void;
  dispose(): void;
}

/** Visual scale (metres) shared with the sim world so both look identical. */
const SYMBOL_SCALE = 2.2;
/** Cyan used across the (inactive) waypoint markers. */
const WP_CYAN = '#22d3ee';
/** Amber used to emphasise the active / next waypoint. */
const WP_ACTIVE = '#fbbf24';
/** Active reticle is drawn larger than the rest (a clear "fly here" cue). */
const ACTIVE_BOOST = 1.35;

// ─── Compact HUD-mode sizing ─────────────────────────────────────────────────
// With sizeAttenuation OFF a sprite's scale is a fraction of the viewport HEIGHT
// (scale 1 ≈ full height), so these read as a roughly constant pixel size across
// panel sizes. On a ~700 px tall panel: reticle ≈ 35 px, active ≈ 46 px.
const COMPACT_RETICLE = 0.062;
const COMPACT_LABEL_H = 0.075;
const COMPACT_LABEL_W = 0.15;
/** Small number-only tag shown ABOVE every non-active compact waypoint so the
    pilot can read them all (like the map) without a full caption on each. */
const COMPACT_NUM_H = 0.05;
const COMPACT_NUM_W = 0.1;
/** Far reticles shrink toward this (never grow past the near size) for depth.
    Kept close to 1 so distant waypoints stay legible rather than vanishing. */
const COMPACT_MIN_SHRINK = 0.82;

/** three.x = East, three.y = Up, three.z = -North (NED [n,e,d] -> three). */
function nedToThree(pos: [number, number, number], out: THREE.Vector3): THREE.Vector3 {
  return out.set(pos[1], -pos[2], -pos[0]);
}

/** Draw a HUD-style target reticle (corner brackets + centre dot) in `color`.
    A dark halo is laid under the bright strokes so the reticle stays readable
    on any background: green synthetic terrain, bright sky, or a live feed. */
function drawReticle(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, color: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  ctx.lineCap = 'round';
  const m = 20; // margin from the edge
  const arm = 36; // bracket arm length
  const corners: Array<[number, number, number, number]> = [
    [m, m, 1, 1],
    [s - m, m, -1, 1],
    [m, s - m, 1, -1],
    [s - m, s - m, -1, -1],
  ];
  const strokeBrackets = (style: string, width: number): void => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * arm, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * arm);
      ctx.stroke();
    }
  };
  strokeBrackets('rgba(0,0,0,0.6)', 13); // contrast halo
  strokeBrackets(color, 6);
  // Centre dot, also haloed.
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, 9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  texture.needsUpdate = true;
}

/** Draw a small number-only tag ("12") with a dark halo, for the compact HUD's
    non-active waypoints so every one is legible without a full caption. */
function drawWpNumber(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, text: string, accent: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 48px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = accent;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

/** Draw a two-line waypoint caption ("WP 4" / "120m · 45m") in `accent`. */
function drawWpLabel(
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
  line1: string,
  line2: string,
  accent: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 40px ui-monospace, SFMono-Regular, Menlo, monospace';
  const w1 = ctx.measureText(line1).width;
  ctx.font = '32px ui-monospace, SFMono-Regular, Menlo, monospace';
  const w2 = ctx.measureText(line2).width;
  const padX = 24;
  const w = Math.min(canvas.width, Math.max(w1, w2) + padX * 2);
  const h = 88;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h) / 2;
  ctx.fillStyle = 'rgba(8,14,20,0.74)';
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.font = 'bold 40px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(line1, canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = 'rgba(190,240,255,0.92)';
  ctx.font = '32px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(line2, canvas.width / 2, canvas.height / 2 + 22);
  texture.needsUpdate = true;
}

interface WpMarker {
  seq: number;
  pos: THREE.Vector3;
  alt: number;
  active: boolean;
  /** Reticle sprite (so compact mode can shrink far ones with distance). */
  reticle: THREE.Sprite;
  /** Near / base reticle scale before any distance shrink. */
  reticleBase: number;
  /** Caption / number sprite — null when this waypoint gets no label. */
  label: THREE.Sprite | null;
  labelCanvas: HTMLCanvasElement | null;
  labelTexture: THREE.CanvasTexture | null;
  lastText: string;
  /** True for full two-line captions that refresh with live slant range; false
      for the static number-only tags (which never need a redraw). */
  dynamic: boolean;
  disposables: Array<{ dispose: () => void }>;
}

export function createWaypointSymbology(options: WaypointSymbologyOptions = {}): WaypointSymbology {
  const compact = options.compact === true;
  const group = new THREE.Group();

  // Shared assets (built once). Sprites use constant screen size in compact HUD
  // mode (sizeAttenuation off) and perspective size in the Sim World.
  const wpMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.5, roughness: 0.4 });
  const wpLineMat = new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: compact ? 0.42 : 0.8 });
  const wpGeom = new THREE.SphereGeometry(SYMBOL_SCALE * 0.45, 12, 10);

  const reticleCanvas = document.createElement('canvas');
  reticleCanvas.width = 128;
  reticleCanvas.height = 128;
  const reticleTexture = new THREE.CanvasTexture(reticleCanvas);
  reticleTexture.colorSpace = THREE.SRGBColorSpace;
  drawReticle(reticleCanvas, reticleTexture, WP_CYAN);
  const reticleMat = new THREE.SpriteMaterial({ map: reticleTexture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: !compact, opacity: 1 });

  const reticleActiveCanvas = document.createElement('canvas');
  reticleActiveCanvas.width = 128;
  reticleActiveCanvas.height = 128;
  const reticleActiveTexture = new THREE.CanvasTexture(reticleActiveCanvas);
  reticleActiveTexture.colorSpace = THREE.SRGBColorSpace;
  drawReticle(reticleActiveCanvas, reticleActiveTexture, WP_ACTIVE);
  const reticleActiveMat = new THREE.SpriteMaterial({ map: reticleActiveTexture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: !compact });

  const sharedDisposables: Array<{ dispose: () => void }> = [
    wpMat, wpLineMat, wpGeom, reticleTexture, reticleMat, reticleActiveTexture, reticleActiveMat,
  ];

  let markers: WpMarker[] = [];
  let signature = '';
  let visible = true;

  function disposeMarkers(): void {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const c = group.children[i]!;
      group.remove(c);
      if (c instanceof THREE.Line) c.geometry.dispose();
    }
    for (const m of markers) for (const d of m.disposables) d.dispose();
    markers = [];
  }

  function isActive(wp: Wp, activeSeq: number | null): boolean {
    return wp.active === true || (activeSeq != null && wp.seq === activeSeq);
  }

  function sig(waypoints: Wp[], activeSeq: number | null): string {
    if (waypoints.length === 0) return '';
    return waypoints
      .map((w) => `${w.seq}:${w.position[0].toFixed(1)},${w.position[1].toFixed(1)},${w.position[2].toFixed(1)}:${isActive(w, activeSeq) ? 1 : 0}`)
      .join('|');
  }

  /** Indices that get a caption. Perspective mode: all. Compact HUD: only the
      active + the next one (or the first two when no active is reported). */
  function labelledSet(waypoints: Wp[], activeSeq: number | null): Set<number> {
    if (!compact) return new Set(waypoints.map((_, i) => i));
    let activeIdx = waypoints.findIndex((w) => isActive(w, activeSeq));
    if (activeIdx < 0) activeIdx = 0;
    return new Set([activeIdx, activeIdx + 1]);
  }

  function rebuild(waypoints: Wp[], activeSeq: number | null): void {
    disposeMarkers();
    if (waypoints.length === 0) return;
    const labelled = labelledSet(waypoints, activeSeq);
    const linePts: THREE.Vector3[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i]!;
      const active = isActive(wp, activeSeq);
      const pos = nedToThree(wp.position, new THREE.Vector3()).clone();
      const alt = -wp.position[2];
      linePts.push(pos.clone());

      // Perspective mode keeps the solid core sphere + drop line; compact HUD
      // drops both (the sphere balloons up close and the drop lines clutter).
      if (!compact) {
        const core = new THREE.Mesh(wpGeom, wpMat);
        core.position.copy(pos);
        group.add(core);
        group.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([pos.clone(), new THREE.Vector3(pos.x, 0, pos.z)]),
          wpLineMat,
        ));
      }

      // Billboard target reticle at the true position (active = amber + larger).
      const reticle = new THREE.Sprite(active ? reticleActiveMat : reticleMat);
      const reticleBase = compact
        ? COMPACT_RETICLE * (active ? ACTIVE_BOOST : 1)
        : SYMBOL_SCALE * 2.4 * (active ? ACTIVE_BOOST : 1);
      reticle.scale.set(reticleBase, reticleBase, 1);
      reticle.position.copy(pos);
      reticle.renderOrder = 997;
      group.add(reticle);

      // Labels. Perspective mode: a full two-line caption on every WP. Compact
      // HUD: a full caption on the active + next WP, and a small NUMBER tag on
      // every OTHER WP so all of them stay readable (like the map) without a
      // full caption's clutter on each. seq is our 0-based internal index (HOME
      // stripped, renumbered from 0); the number the map + FC show is seq + 1.
      let label: THREE.Sprite | null = null;
      let labelCanvas: HTMLCanvasElement | null = null;
      let labelTexture: THREE.CanvasTexture | null = null;
      let dynamic = false;
      const disposables: Array<{ dispose: () => void }> = [];
      let lastText = '';
      const accent = active ? WP_ACTIVE : WP_CYAN;
      if (labelled.has(i)) {
        labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256;
        labelCanvas.height = 128;
        labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace = THREE.SRGBColorSpace;
        const line1 = `WP ${wp.seq + 1}`;
        const line2 = `${Math.round(alt)}m`;
        drawWpLabel(labelCanvas, labelTexture, line1, line2, accent);
        const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: !compact, opacity: compact ? 0.96 : 1 });
        label = new THREE.Sprite(labelMat);
        if (compact) {
          // Constant screen size: nudge the caption a fixed amount ABOVE the
          // reticle via the sprite anchor (a world offset is imperceptible when
          // sizeAttenuation is off), so it never overlaps the target box.
          label.scale.set(COMPACT_LABEL_W, COMPACT_LABEL_H, 1);
          label.center.set(0.5, -0.4);
          label.position.copy(pos);
        } else {
          label.scale.set(SYMBOL_SCALE * 4, SYMBOL_SCALE * 2, 1);
          label.position.set(pos.x, pos.y + SYMBOL_SCALE * 2.1, pos.z);
        }
        dynamic = true;
        lastText = `${line1}|${line2}`;
        disposables.push(labelMat, labelTexture);
      } else if (compact) {
        labelCanvas = document.createElement('canvas');
        labelCanvas.width = 128;
        labelCanvas.height = 64;
        labelTexture = new THREE.CanvasTexture(labelCanvas);
        labelTexture.colorSpace = THREE.SRGBColorSpace;
        drawWpNumber(labelCanvas, labelTexture, `${wp.seq + 1}`, accent);
        const labelMat = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, opacity: 0.95 });
        label = new THREE.Sprite(labelMat);
        label.scale.set(COMPACT_NUM_W, COMPACT_NUM_H, 1);
        label.center.set(0.5, -0.7); // sit just above the reticle box
        label.position.copy(pos);
        dynamic = false; // static number tag — updateDynamic must not touch it
        disposables.push(labelMat, labelTexture);
      }
      if (label) {
        label.renderOrder = 999;
        group.add(label);
      }

      markers.push({ seq: wp.seq, pos, alt, active, reticle, reticleBase, label, labelCanvas, labelTexture, lastText, dynamic, disposables });
    }
    if (linePts.length > 1) {
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), wpLineMat));
    }
  }

  /** Refresh captions with live slant-range from `from` (only when text changes),
      and in compact mode shrink far reticles slightly for depth (never grow). */
  function updateDynamic(from: THREE.Vector3): void {
    for (const m of markers) {
      const dist = from.distanceTo(m.pos);
      if (compact) {
        const t = Math.min(1, Math.max(0, (dist - 40) / 600));
        const shrink = 1 - (1 - COMPACT_MIN_SHRINK) * t;
        const s = m.reticleBase * shrink;
        m.reticle.scale.set(s, s, 1);
      }
      if (!m.dynamic || !m.label || !m.labelCanvas || !m.labelTexture) continue;
      const text = `WP ${m.seq + 1}|${Math.round(dist)}m · ${Math.round(m.alt)}m`;
      if (text === m.lastText) continue;
      m.lastText = text;
      drawWpLabel(m.labelCanvas, m.labelTexture, `WP ${m.seq + 1}`, `${Math.round(dist)}m · ${Math.round(m.alt)}m`, m.active ? WP_ACTIVE : WP_CYAN);
    }
  }

  return {
    group,

    update(waypoints, flownPos, activeSeq) {
      const s = sig(waypoints, activeSeq);
      if (s !== signature) {
        rebuild(waypoints, activeSeq);
        signature = s;
      }
      group.visible = visible;
      updateDynamic(flownPos);
    },

    setVisible(on) {
      visible = on;
      group.visible = on;
    },

    dispose() {
      disposeMarkers();
      for (const d of sharedDisposables) d.dispose();
    },
  };
}
