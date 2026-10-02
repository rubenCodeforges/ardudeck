/**
 * Tactical vehicle icon factory for Leaflet DivIcon.
 * Composes: dark background disc + SVG icon body + speed vector + selection ring + info label + heading arrow.
 *
 * IMPORTANT: Heading, speed, and altitude are updated via DOM manipulation (updateTacticalIconDOM)
 * to avoid recreating the entire DivIcon on every telemetry tick (which causes flicker).
 * The icon is only recreated when state/mode/selection/vehicleClass changes.
 */

import { t } from '../../../shared/i18n/index.js';
import L from 'leaflet';
import {
  TACTICAL_ICON_POOL,
  STATE_COLORS,
  getModeCategoryColor,
  type TacticalVehicleClass,
  type VehicleState,
} from './tactical-icon-pool';

/** Options that cause a full icon rebuild when they change */
export interface TacticalIconOptions {
  vehicleClass: TacticalVehicleClass;
  state: VehicleState;
  selected: boolean;
  mode: string;
  designation?: string;
  /** Formation leader - gets a gold ring + LEAD chip so it's unmistakable on the map. */
  isLeader?: boolean;
  /** Compact label: show only the SYS id until hovered (used for non-active fleet markers
   *  so a tight cluster doesn't become a pile of overlapping readouts). */
  compact?: boolean;
  /** Density level-of-detail (default 'full'). 'medium' is a ~half-size disc + body +
   *  heading arrow with the SYS id chip only (no speed vector); 'dot' is a small filled
   *  circle in the body colour with a heading tick, label hidden until hover. */
  tier?: 'full' | 'medium' | 'dot';
  /** Force this marker above all others (the active/primary vehicle). */
  topmost?: boolean;
  /** Vehicle identity colour for the body/arrow/speed vector (so the fleet is colour-coded,
   *  matching the strip cards + waypoints). The disc ring still encodes state. */
  bodyColor?: string;
}

/** Values updated via DOM manipulation (no icon rebuild) */
export interface TacticalIconDynamics {
  heading: number;
  groundspeed: number;
  speedText: string;
  altitudeAgl: number;
  altitudeText: string;
  windDirection?: number;  // degrees - where wind comes FROM
  windSpeed?: number;      // m/s
}

const ICON_SIZE = 52;
const MEDIUM_SIZE = 26;
const DOT_SIZE = 12;
const SVG_CENTER = 30;
const SHAPE_OFFSET = 16;
const SPEED_VECTOR_MAX_PX = 50;
const SPEED_VECTOR_MAX_MS = 40;

/**
 * Create a Leaflet DivIcon. Heading/speed/alt default to 0 - call updateTacticalIconDOM() to set live values.
 */
export function createTacticalVehicleIcon(opts: TacticalIconOptions): L.DivIcon {
  const iconDef = TACTICAL_ICON_POOL[opts.vehicleClass];
  const colors = STATE_COLORS[opts.state];
  const modeColor = getModeCategoryColor(opts.mode);
  const glowClass = colors.glow ? ` ${colors.glow}` : '';
  // The drone glyph + heading arrow + speed vector take the vehicle's identity colour when
  // given; the disc ring keeps the state colour so armed/critical is still readable.
  const bodyFill = opts.bodyColor ?? colors.fill;
  const tier = opts.tier ?? 'full';
  const size = tier === 'medium' ? MEDIUM_SIZE : ICON_SIZE;
  // Medium always collapses to the SYS id chip; the readouts would swamp a dense area.
  const compact = opts.compact || tier === 'medium';

  const leaderChip = opts.isLeader
    ? `<span style="background:#fbbf24;color:#1f2937;font-weight:700;border-radius:2px;padding:0 3px;margin-right:4px;font-size:8px;letter-spacing:0.3px;">${t('map:tacticalIcon.leadChip')}</span>`
    : '';

  const designationHtml = opts.designation
    ? `<span style="color:#f1f5f9;font-weight:600;">${opts.designation}</span>`
    : '';
  // SYS id sits on its own top line; mode + telemetry go below it.
  const labelLine1 = opts.designation || opts.isLeader ? `<div>${leaderChip}${designationHtml}</div>` : '';

  const labelBorder = opts.isLeader ? '#fbbf24' : opts.selected ? '#22d3ee' : colors.border;

  const labelHtml = `
      <div class="tactical-info-label" style="
        position:absolute;
        top:-4px;
        left:${size + 4}px;
        background:rgba(17,24,39,0.9);
        backdrop-filter:blur(4px);
        border:1px solid ${labelBorder};
        border-radius:3px;
        padding:2px 6px;
        white-space:nowrap;
        pointer-events:none;
        font-family:ui-monospace,monospace;
        font-size:10px;
        line-height:1.4;
      ">
        ${labelLine1}
        <div class="tvi-detail-block"><span style="color:${modeColor};" class="tvi-mode">${opts.mode}</span></div>
        <div class="tvi-detail-block" style="color:#d1d5db;"><span class="tvi-alt">0 m</span> <span class="tvi-spd">0.0 m/s</span></div>
      </div>`;

  // Dot tier: a filled identity-colour circle with a heading tick, drawn tiny at the true
  // position so a dense formation reads as its shape. The full label rides along hidden
  // (.tvi-dot in globals.css) and reveals on hover, like grouped compact labels.
  if (tier === 'dot') {
    const c = DOT_SIZE / 2;
    const html = `
    <div class="tactical-vehicle-icon${glowClass}" style="position:relative;width:${DOT_SIZE}px;height:${DOT_SIZE}px;overflow:visible;">
      <svg class="tvi-svg" viewBox="0 0 ${DOT_SIZE} ${DOT_SIZE}" width="${DOT_SIZE}" height="${DOT_SIZE}"
           style="transform:rotate(0deg);overflow:visible;">
        <line x1="${c}" y1="${c}" x2="${c}" y2="${-c + 2}" stroke="${bodyFill}" stroke-width="2" stroke-linecap="round" />
        <circle cx="${c}" cy="${c}" r="${c - 1}" fill="${bodyFill}" stroke="rgba(0,0,0,0.6)" stroke-width="1" />
      </svg>
      ${labelHtml}
    </div>
  `;
    return L.divIcon({
      className: `tactical-vehicle-marker tvi-dot${opts.topmost ? ' tvi-topmost' : ''}`,
      html,
      iconSize: [DOT_SIZE, DOT_SIZE],
      iconAnchor: [DOT_SIZE / 2, DOT_SIZE / 2],
    });
  }

  const selectionRing = opts.selected
    ? `<circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="28" fill="none" stroke="#22d3ee" stroke-width="2"
         stroke-dasharray="5 4" class="tactical-selection-ring" />`
    : '';

  // Leader: a solid gold ring (distinct from the cyan dashed selection ring).
  const leaderRing = opts.isLeader
    ? `<circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="25" fill="none" stroke="#fbbf24" stroke-width="2.5"
         class="tactical-leader-ring" />`
    : '';

  // Disc ring uses the bright state colour so the fleet stays state-readable even when each
  // body is its own identity colour.
  const bgDisc = `<circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="22"
    fill="rgba(0,0,0,0.55)" stroke="${colors.fill}" stroke-width="2" />`;

  const iconBody = iconDef.strokeOnly
    ? `<path d="${iconDef.svgPath}" fill="none" stroke="${bodyFill}" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" />`
    : `<path d="${iconDef.svgPath}" fill="${bodyFill}" stroke="${colors.border}" stroke-width="1.5"
            stroke-linejoin="round" stroke-linecap="round" />`;

  // Heading arrow as an HTML div - CSS triangle positioned above the disc, rotated with heading.
  // The arrow scales with the tier size so it doesn't dwarf a medium disc.
  const showArrow = opts.vehicleClass !== 'antenna';
  const arrowScale = size / ICON_SIZE;
  const arrowHtml = showArrow ? `
      <div class="tvi-arrow-wrapper" style="
        position:absolute;
        top:0;left:0;
        width:${size}px;height:${size}px;
        pointer-events:none;
        transform:rotate(0deg);
      ">
        <div style="
          position:absolute;
          top:${Math.round(-12 * arrowScale)}px;
          left:50%;
          transform:translateX(-50%);
          width:0;height:0;
          border-left:${Math.round(8 * arrowScale)}px solid transparent;
          border-right:${Math.round(8 * arrowScale)}px solid transparent;
          border-bottom:${Math.round(14 * arrowScale)}px solid ${bodyFill};
          filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000);
        "></div>
      </div>` : '';

  // Speed vector reads badly at medium size (it would dwarf the disc) - full tier only.
  const speedVector = tier === 'full'
    ? `<line class="tvi-speed" x1="${SVG_CENTER}" y1="${SVG_CENTER}" x2="${SVG_CENTER}" y2="${SVG_CENTER}"
              stroke="${bodyFill}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" />`
    : '';

  const windHtml = tier === 'full' ? `
      <div class="tvi-wind" style="
        position:absolute;
        top:0;left:0;
        width:${ICON_SIZE}px;height:${ICON_SIZE}px;
        pointer-events:none;
        transform:rotate(0deg);
        display:none;
      ">
        <div style="
          position:absolute;
          bottom:-16px;
          left:50%;
          transform:translateX(-50%);
          display:flex;flex-direction:column;align-items:center;
        ">
          <div style="
            width:0;height:0;
            border-left:5px solid transparent;
            border-right:5px solid transparent;
            border-top:8px solid #93c5fd;
          "></div>
          <div style="width:1.5px;height:10px;background:#93c5fd;"></div>
        </div>
        <div class="tvi-wind-label" style="
          position:absolute;
          bottom:-34px;
          left:50%;
          transform:translateX(-50%);
          font-family:ui-monospace,monospace;
          font-size:9px;
          color:#93c5fd;
          white-space:nowrap;
          pointer-events:none;
        ">0m/s</div>
      </div>` : '';

  // The viewBox stays 0 0 60 60, so a smaller width/height scales the whole composition.
  const html = `
    <div class="tactical-vehicle-icon${glowClass}" style="position:relative;width:${size}px;height:${size}px;overflow:visible;">
      <svg class="tvi-svg" viewBox="0 0 60 60" width="${size}" height="${size}"
           style="transform:rotate(0deg);overflow:visible;">
        ${bgDisc}
        ${selectionRing}
        ${leaderRing}
        ${speedVector}
        <g transform="translate(${SHAPE_OFFSET},${SHAPE_OFFSET})">
          ${iconBody}
        </g>
      </svg>
      ${arrowHtml}
      ${windHtml}
      ${labelHtml}
    </div>
  `;

  return L.divIcon({
    className: `tactical-vehicle-marker${compact ? ' tvi-compact' : ''}${opts.topmost ? ' tvi-topmost' : ''}`,
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Update heading/speed/alt on an existing tactical icon DOM element without replacing it.
 * Call this on every telemetry tick - it's a cheap DOM mutation, no flicker.
 */
export function updateTacticalIconDOM(
  markerElement: HTMLElement,
  dynamics: TacticalIconDynamics,
  isAntenna = false,
): void {
  const rotation = isAntenna ? 0 : dynamics.heading;

  // Rotate the SVG (icon body + speed vector)
  const svg = markerElement.querySelector<SVGElement>('.tvi-svg');
  if (svg) svg.style.transform = `rotate(${rotation}deg)`;

  // Rotate the heading arrow wrapper the same way
  const arrowWrapper = markerElement.querySelector<HTMLElement>('.tvi-arrow-wrapper');
  if (arrowWrapper) arrowWrapper.style.transform = `rotate(${rotation}deg)`;

  // Speed vector line
  const speedLine = markerElement.querySelector<SVGLineElement>('.tvi-speed');
  if (speedLine) {
    const len = Math.min(
      (dynamics.groundspeed / SPEED_VECTOR_MAX_MS) * SPEED_VECTOR_MAX_PX,
      SPEED_VECTOR_MAX_PX,
    );
    if (len > 2) {
      speedLine.setAttribute('y2', String(SVG_CENTER - len));
      speedLine.setAttribute('stroke-opacity', '0.7');
    } else {
      speedLine.setAttribute('y2', String(SVG_CENTER));
      speedLine.setAttribute('stroke-opacity', '0');
    }
  }

  // Info label text
  const altEl = markerElement.querySelector<HTMLElement>('.tvi-alt');
  if (altEl) altEl.textContent = dynamics.altitudeText;

  const spdEl = markerElement.querySelector<HTMLElement>('.tvi-spd');
  if (spdEl) spdEl.textContent = dynamics.speedText;

  // Wind indicator - points in the direction wind is GOING (opposite of "from" direction)
  // Rotates independently of heading (wind is absolute, not relative to vehicle)
  const windEl = markerElement.querySelector<HTMLElement>('.tvi-wind');
  if (windEl) {
    const windSpd = dynamics.windSpeed ?? 0;
    if (windSpd >= 0.5) {
      // Wind direction is where it comes FROM. Arrow shows where it goes TO (+180).
      const windGoingTo = ((dynamics.windDirection ?? 0) + 180) % 360;
      windEl.style.transform = `rotate(${windGoingTo}deg)`;
      windEl.style.display = '';
      const windLabel = windEl.querySelector<HTMLElement>('.tvi-wind-label');
      if (windLabel) windLabel.textContent = `${windSpd.toFixed(1)}m/s`;
    } else {
      windEl.style.display = 'none';
    }
  }
}
