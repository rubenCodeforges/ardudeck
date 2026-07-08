/**
 * Tier-1 canvas layer for mission waypoints: one canvas over the map pane,
 * redrawn in a single pass on move/zoom, always drawing EVERY waypoint as a
 * dot. No react-leaflet children and no per-waypoint DOM - at 20k+ waypoints
 * that is the difference between one clear pass and a frozen renderer.
 *
 * Same house pattern as vehicle-threejs-layer: the React side holds a ref and
 * feeds this layer imperatively; the layer owns its DOM and map listeners.
 */
import L from 'leaflet';
import {
  estimateLabelWidthPx,
  labelStride,
  type GridIndex,
} from './waypoint-tiers';

/**
 * Zoom whose pixel space the grid index lives in. Any value works (queries
 * scale into it); a mid zoom keeps coordinates in a comfortable float range.
 */
export const WAYPOINT_REF_ZOOM = 15;

const PANE_NAME = 'waypoint-canvas';
// Between the overlay pane (400, path polylines) and the marker pane (600):
// dots draw over the path but under real markers.
const PANE_Z_INDEX = '450';
const DOT_RADIUS = 3.5;
const EMPHASIS_RADIUS = 5;
const HOVER_RING_RADIUS = 8;
const OFFSCREEN_PAD_PX = 24;
const CURRENT_COLOR = '#f59e0b';
const SELECTED_COLOR = '#22d3ee';
const LABEL_FONT = 'bold 10px system-ui, sans-serif';

export interface WaypointDotInfo {
  seq: number;
  /** Resolved fill (command/segment/group color) - same logic as the markers. */
  color: string;
  /** Display number (per-group numbering), pre-stringified for the canvas. */
  label: string;
}

export interface WaypointCanvasData {
  /** Spatial index in WAYPOINT_REF_ZOOM pixel space; arrays parallel `infos`. */
  index: GridIndex;
  infos: WaypointDotInfo[];
  /** Mean consecutive spacing in ref-zoom px - drives label density. */
  meanSpacing: number;
  /** Largest display number, for label width estimation. */
  maxLabel: number;
  selectedSeq: number | null;
  currentSeq: number | null;
  /** Seqs represented by real materialized markers - their dots would only bleed out from under the marker during a drag. */
  suppressed: ReadonlySet<number>;
}

export interface WaypointCanvasLayer {
  setData(data: WaypointCanvasData): void;
  setHover(seq: number | null): void;
  redraw(): void;
  dispose(): void;
}

export function createWaypointCanvasLayer(map: L.Map): WaypointCanvasLayer {
  let pane = map.getPane(PANE_NAME);
  if (!pane) {
    pane = map.createPane(PANE_NAME);
    pane.style.zIndex = PANE_Z_INDEX;
    pane.style.pointerEvents = 'none';
  }

  const canvas = document.createElement('canvas');
  canvas.style.position = 'absolute';
  // Leaflet animates zoom by CSS-transitioning the transform of elements
  // carrying this class (scoped under the map's .leaflet-zoom-anim state);
  // without it the zoomanim transform applies untransitioned and the dots
  // only line up again at zoomend.
  if ((map as unknown as { _zoomAnimated?: boolean })._zoomAnimated) {
    canvas.classList.add('leaflet-zoom-animated');
  }
  pane.appendChild(canvas);

  let data: WaypointCanvasData | null = null;
  let hoverSeq: number | null = null;
  let rafId: number | null = null;
  // Screen-position scratch buffers, reused across frames - reallocating
  // ~0.5 MB per pan frame at 20k+ waypoints is pure GC churn.
  let px = new Float64Array(0);
  let py = new Float64Array(0);
  let visible = new Uint8Array(0);
  // View state at last draw, needed to transform the canvas during the zoom
  // animation so dots track the tiles instead of snapping at zoomend.
  let drawnTopLeft: L.LatLng | null = null;
  let drawnZoom = 0;

  const crs = map.options.crs ?? L.CRS.EPSG3857;
  const refScaleDenom = crs.scale(WAYPOINT_REF_ZOOM);

  function draw() {
    rafId = null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    }

    // Pin the canvas to the current viewport (the pane pans with the map).
    // setTransform also clears any scale left over from a zoom animation.
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setTransform(canvas, topLeft, 1);
    drawnTopLeft = map.containerPointToLatLng([0, 0]);
    drawnZoom = map.getZoom();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    if (!data || data.index.count === 0) return;

    const { index, infos, suppressed, selectedSeq, currentSeq } = data;
    const scale = crs.scale(drawnZoom) / refScaleDenom;
    const origin = map.getPixelBounds().min!;
    const maxX = size.x + OFFSCREEN_PAD_PX;
    const maxY = size.y + OFFSCREEN_PAD_PX;

    // Screen positions of visible dots, batched by color so the whole tier
    // draws in a handful of fill calls instead of 20k state switches.
    const byColor = new Map<string, number[]>();
    if (px.length < index.count) {
      px = new Float64Array(index.count);
      py = new Float64Array(index.count);
      visible = new Uint8Array(index.count);
    } else {
      visible.fill(0);
    }
    for (let i = 0; i < index.count; i++) {
      const x = index.xs[i]! * scale - origin.x;
      const y = index.ys[i]! * scale - origin.y;
      px[i] = x;
      py[i] = y;
      if (x < -OFFSCREEN_PAD_PX || x > maxX || y < -OFFSCREEN_PAD_PX || y > maxY) continue;
      const info = infos[i];
      if (!info || suppressed.has(info.seq)) continue;
      visible[i] = 1;
      const bucket = byColor.get(info.color);
      if (bucket) bucket.push(i);
      else byColor.set(info.color, [i]);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    for (const [color, idxs] of byColor) {
      ctx.beginPath();
      for (const i of idxs) {
        ctx.moveTo(px[i]! + DOT_RADIUS, py[i]!);
        ctx.arc(px[i]!, py[i]!, DOT_RADIUS, 0, Math.PI * 2);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }

    // Selected/current emphasis (usually covered by a materialized marker,
    // but the canvas keeps them findable when markers are unavailable).
    for (let i = 0; i < index.count; i++) {
      if (!visible[i]) continue;
      const seq = infos[i]!.seq;
      if (seq !== selectedSeq && seq !== currentSeq) continue;
      ctx.beginPath();
      ctx.arc(px[i]!, py[i]!, EMPHASIS_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = seq === currentSeq ? CURRENT_COLOR : SELECTED_COLOR;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    }

    // Tier-4 labels: density derived from on-screen dot spacing so numbers
    // never overlap - none far out, every Nth mid, all when close.
    const stride = labelStride(estimateLabelWidthPx(data.maxLabel), data.meanSpacing * scale);
    if (stride > 0) {
      ctx.font = LABEL_FONT;
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < index.count; i += stride) {
        if (!visible[i]) continue;
        const label = infos[i]!.label;
        ctx.strokeText(label, px[i]! + 5, py[i]! - 4);
        ctx.fillText(label, px[i]! + 5, py[i]! - 4);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    }

    // Tier-2 hover highlight.
    if (hoverSeq !== null) {
      for (let i = 0; i < index.count; i++) {
        if (!visible[i] || infos[i]!.seq !== hoverSeq) continue;
        ctx.beginPath();
        ctx.arc(px[i]!, py[i]!, HOVER_RING_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = SELECTED_COLOR;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px[i]!, py[i]!, HOVER_RING_RADIUS + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      }
    }
  }

  function schedule() {
    if (rafId === null) rafId = requestAnimationFrame(draw);
  }

  function onZoomAnim(e: L.LeafletEvent) {
    if (!drawnTopLeft) return;
    const anim = e as unknown as { zoom: number; center: L.LatLng };
    const scale = map.getZoomScale(anim.zoom, drawnZoom);
    // Private but stable Leaflet internal - ImageOverlay uses the same call;
    // there is no public way to get a layer point at the animation's target zoom.
    const offset = (
      map as unknown as {
        _latLngToNewLayerPoint: (latlng: L.LatLng, zoom: number, center: L.LatLng) => L.Point;
      }
    )._latLngToNewLayerPoint(drawnTopLeft, anim.zoom, anim.center);
    L.DomUtil.setTransform(canvas, offset, scale);
  }

  map.on('move', schedule);
  map.on('zoomend viewreset', schedule);
  map.on('resize', schedule);
  map.on('zoomanim', onZoomAnim);

  return {
    setData(next) {
      data = next;
      schedule();
    },
    setHover(seq) {
      if (seq === hoverSeq) return;
      hoverSeq = seq;
      schedule();
    },
    redraw: schedule,
    dispose() {
      map.off('move', schedule);
      map.off('zoomend viewreset', schedule);
      map.off('resize', schedule);
      map.off('zoomanim', onZoomAnim);
      if (rafId !== null) cancelAnimationFrame(rafId);
      canvas.remove();
    },
  };
}
