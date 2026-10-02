/**
 * wind-animator — Canvas2D particle advection for the wind overlay.
 *
 * Particles live in geographic space (lat/lng), are advected by the bilinearly
 * sampled u/v field, and are drawn as fading trails projected to screen via the
 * supplied projector. Screen displacement is normalised by metres-per-pixel so
 * visual speed tracks real wind speed independent of zoom.
 *
 * Decoupled from Leaflet through WindProjector so the map wiring stays in the
 * React component. The numeric core (sampling/colour) lives in wind-field.ts.
 */

import type { WindField, WindFrame, WindBBox } from '../../../../shared/wind-types';
import { sampleWind, windColor } from './wind-field';

export interface WindProjector {
  /** Geographic point -> CSS-pixel container point. */
  project(lat: number, lng: number): { x: number; y: number };
  getZoom(): number;
  /** Current map view bounds (lat/lng). */
  getViewBounds(): WindBBox;
}

export interface FrameRef {
  field: WindField;
  frame: WindFrame;
}

interface Particle {
  lat: number;
  lng: number;
  age: number;
}

const FADE = 0.9; // trail persistence per 1/60 s (applied fps-independently)
const BASE_PX_PER_SEC = 9; // screen px per (m/s) per SECOND, before speedScale
const MIN_DRIFT_PER_SEC = 4; // light wind still drifts perceptibly (px/s)
const STROKE_ALPHA = 0.85; // keep streaks from looking neon on dark imagery
const MAX_AGE_SEC = 1.6; // particle lifetime before respawn
const MIN_AGE_SEC = 0.5;
const EARTH_CIRCUM = 40075016.686;

export class WindAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly projector: WindProjector;
  private readonly getFrame: () => FrameRef | null;
  private readonly getSpeedScale: () => number;
  private particles: Particle[] = [];
  private raf: number | null = null;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    projector: WindProjector,
    getFrame: () => FrameRef | null,
    getSpeedScale: () => number,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('wind-animator: 2d context unavailable'); // i18n-exempt: internal
    this.ctx = ctx;
    this.projector = projector;
    this.getFrame = getFrame;
    this.getSpeedScale = getSpeedScale;
  }

  /** Size the backing store to the container, accounting for device pixels. */
  resize(cssW: number, cssH: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Particle budget scales with viewport area (kept modest for a clean field).
    const target = Math.max(300, Math.min(1200, Math.round((cssW * cssH) / 1600)));
    this.resetParticles(target);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.cssW, this.cssH);
  }

  start(): void {
    if (this.raf !== null) return;
    let last = 0;
    const tick = (now: number): void => {
      // Real elapsed time keeps motion identical across 60/120 Hz displays.
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      this.step(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private resetParticles(count: number): void {
    this.particles = new Array(count);
    for (let i = 0; i < count; i++) {
      this.particles[i] = { lat: 0, lng: 0, age: 0 };
    }
  }

  /** Intersection of the field bbox and the current view, or null if disjoint. */
  private spawnBox(field: WindField): WindBBox | null {
    const v = this.projector.getViewBounds();
    const b = field.bbox;
    const south = Math.max(v.south, b.south);
    const north = Math.min(v.north, b.north);
    const west = Math.max(v.west, b.west);
    const east = Math.min(v.east, b.east);
    if (south >= north || west >= east) return null;
    return { south, north, west, east };
  }

  private respawn(p: Particle, box: WindBBox): void {
    p.lng = box.west + Math.random() * (box.east - box.west);
    p.lat = box.south + Math.random() * (box.north - box.south);
    p.age = MIN_AGE_SEC + Math.random() * (MAX_AGE_SEC - MIN_AGE_SEC);
  }

  private step(dt: number): void {
    const ref = this.getFrame();
    const ctx = this.ctx;

    // Fade existing trails (multiply alpha) while keeping the canvas transparent.
    // Raise FADE to the dt power so trail length is the same at any frame rate.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = `rgba(0,0,0,${Math.pow(FADE, dt * 60)})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    ctx.globalCompositeOperation = 'source-over';

    if (!ref) return;
    const box = this.spawnBox(ref.field);
    if (!box) return;

    const zoom = this.projector.getZoom();
    const speedScale = this.getSpeedScale();
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = STROKE_ALPHA;

    for (const p of this.particles) {
      if (p.age <= 0) {
        this.respawn(p, box);
        continue;
      }
      const uv = sampleWind(ref.field, ref.frame, p.lat, p.lng);
      if (!uv) {
        p.age = 0;
        continue;
      }
      const latRad = (p.lat * Math.PI) / 180;
      const cosLat = Math.max(0.01, Math.cos(latRad));
      const mpp = (EARTH_CIRCUM * cosLat) / Math.pow(2, zoom + 8);
      const speed = Math.hypot(uv.u, uv.v);
      // Screen displacement this step (px) = speed * stepPx; time-scaled so it's
      // px-per-second, not px-per-frame. Nudge up so light wind still drifts.
      let stepPx = BASE_PX_PER_SEC * speedScale * dt;
      const minDisp = MIN_DRIFT_PER_SEC * dt;
      const pxDisp = speed * stepPx;
      if (pxDisp > 1e-4 && pxDisp < minDisp) stepPx *= minDisp / pxDisp;
      const metersX = uv.u * stepPx * mpp;
      const metersY = uv.v * stepPx * mpp;
      const nlng = p.lng + metersX / (111320 * cosLat);
      const nlat = p.lat + metersY / 110540;

      const a = this.projector.project(p.lat, p.lng);
      const b = this.projector.project(nlat, nlng);
      ctx.strokeStyle = windColor(speed);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      p.lat = nlat;
      p.lng = nlng;
      p.age -= dt;
    }
  }
}
