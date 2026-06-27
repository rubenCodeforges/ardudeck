/**
 * Tactical vehicle icon factory for Leaflet DivIcon.
 * Composes: dark background disc + SVG icon body + speed vector + selection ring + info label + heading arrow.
 *
 * IMPORTANT: Heading, speed, and altitude are updated via DOM manipulation (updateTacticalIconDOM)
 * to avoid recreating the entire DivIcon on every telemetry tick (which causes flicker).
 * The icon is only recreated when state/mode/selection/vehicleClass changes.
 */

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

  const selectionRing = opts.selected
    ? `<circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="28" fill="none" stroke="#22d3ee" stroke-width="2"
         stroke-dasharray="5 4" class="tactical-selection-ring" />`
    : '';

  const bgDisc = `<circle cx="${SVG_CENTER}" cy="${SVG_CENTER}" r="22"
    fill="rgba(0,0,0,0.55)" stroke="${colors.border}" stroke-width="1.5" />`;

  const iconBody = iconDef.strokeOnly
    ? `<path d="${iconDef.svgPath}" fill="none" stroke="${colors.fill}" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" />`
    : `<path d="${iconDef.svgPath}" fill="${colors.fill}" stroke="${colors.border}" stroke-width="1.5"
            stroke-linejoin="round" stroke-linecap="round" />`;

  const designationHtml = opts.designation
    ? `<span style="color:#d1d5db;margin-right:4px;">${opts.designation}</span>`
    : '';

  const labelBorder = opts.selected ? '#22d3ee' : colors.border;

  // Heading arrow as an HTML div - CSS triangle positioned above the disc, rotated with heading
  const showArrow = opts.vehicleClass !== 'antenna';
  const arrowHtml = showArrow ? `
      <div class="tvi-arrow-wrapper" style="
        position:absolute;
        top:0;left:0;
        width:${ICON_SIZE}px;height:${ICON_SIZE}px;
        pointer-events:none;
        transform:rotate(0deg);
      ">
        <div style="
          position:absolute;
          top:-12px;
          left:50%;
          transform:translateX(-50%);
          width:0;height:0;
          border-left:8px solid transparent;
          border-right:8px solid transparent;
          border-bottom:14px solid ${colors.fill};
          filter:drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000);
        "></div>
      </div>` : '';

  const html = `
    <div class="tactical-vehicle-icon${glowClass}" style="position:relative;width:${ICON_SIZE}px;height:${ICON_SIZE}px;overflow:visible;">
      <svg class="tvi-svg" viewBox="0 0 60 60" width="${ICON_SIZE}" height="${ICON_SIZE}"
           style="transform:rotate(0deg);overflow:visible;">
        ${bgDisc}
        ${selectionRing}
        <line class="tvi-speed" x1="${SVG_CENTER}" y1="${SVG_CENTER}" x2="${SVG_CENTER}" y2="${SVG_CENTER}"
              stroke="${colors.fill}" stroke-width="2" stroke-opacity="0.7" stroke-linecap="round" />
        <g transform="translate(${SHAPE_OFFSET},${SHAPE_OFFSET})">
          ${iconBody}
        </g>
      </svg>
      ${arrowHtml}
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
      </div>
      <div class="tactical-info-label" style="
        position:absolute;
        top:-4px;
        left:${ICON_SIZE + 4}px;
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
        <div>${designationHtml}<span style="color:${modeColor};" class="tvi-mode">${opts.mode}</span></div>
        <div style="color:#d1d5db;"><span class="tvi-alt">0</span> <span class="tvi-spd">0.0 m/s</span></div>
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'tactical-vehicle-marker',
    html,
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: [ICON_SIZE / 2, ICON_SIZE / 2],
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
