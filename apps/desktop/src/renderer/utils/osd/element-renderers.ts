/**
 * OSD Element Renderers
 *
 * All renderer functions that write OSD characters to the screen buffer.
 * Extracted from osd-store.ts for maintainability, with renderers for
 * all 48 elements.
 */

import { SYM } from './osd-symbols';
import { OsdScreenBuffer } from './font-renderer';
import type { OsdElementId } from './element-registry';
import type { CcrpResult } from '../../utils/ccrp-calculator';

// ---------------------------------------------------------------------------
// Demo telemetry interface (expanded)
// ---------------------------------------------------------------------------

export interface DemoTelemetry {
  altitude: number;
  speed: number;
  heading: number;
  pitch: number;
  roll: number;
  batteryVoltage: number;
  batteryCurrent: number;
  batteryPercent: number;
  gpsSats: number;
  rssi: number;
  throttle: number;
  flightTime: number;
  distance: number;
  latitude: number;
  longitude: number;
  targetLat: number;
  targetLon: number;
  // New fields
  airspeed: number;
  vario: number;
  cellVoltage: number;
  cellCount: number;
  mahDrawn: number;
  powerWatts: number;
  craftName: string;
  flightMode: string;
  isArmed: boolean;
  baroTemp: number;
  imuTemp: number;
  escTemp: number;
  gForce: number;
  escRpm: number;
  windSpeed: number;
  windDirection: number;
  windVertical: number;
  homeDirection: number;
  rssiDbm: number;
  maxSpeed: number;
  mslAltitude: number;
  onTime: number;
  gpsHdop: number;
}

export const DEFAULT_DEMO_VALUES: DemoTelemetry = {
  altitude: 120,
  speed: 15,
  heading: 270,
  pitch: 5,
  roll: -3,
  batteryVoltage: 11.8,
  batteryCurrent: 8.5,
  batteryPercent: 75,
  gpsSats: 12,
  rssi: 85,
  throttle: 45,
  flightTime: 185,
  distance: 350,
  latitude: 37.7749,
  longitude: -122.4194,
  targetLat: 37.7749,
  targetLon: -122.4254,
  // New defaults
  airspeed: 18,
  vario: 1.5,
  cellVoltage: 3.95,
  cellCount: 3,
  mahDrawn: 850,
  powerWatts: 100,
  craftName: 'ARDUDECK',
  flightMode: 'ANGLE',
  isArmed: true,
  baroTemp: 32,
  imuTemp: 45,
  escTemp: 55,
  gForce: 1.0,
  escRpm: 12500,
  windSpeed: 8,
  windDirection: 180,
  windVertical: 1.2,
  homeDirection: 45,
  rssiDbm: -62,
  maxSpeed: 22,
  mslAltitude: 450,
  onTime: 750,
  gpsHdop: 0.9,
};

// ---------------------------------------------------------------------------
// Render dispatch - renders a single element by ID
// ---------------------------------------------------------------------------

export function renderElement(
  buffer: OsdScreenBuffer,
  id: OsdElementId,
  x: number,
  y: number,
  values: DemoTelemetry,
  ccrpResult?: CcrpResult
): void {
  switch (id) {
    // General
    case 'flymode':
      renderFlymode(buffer, x, y, values.flightMode);
      break;
    case 'armed_status':
      renderArmedStatus(buffer, x, y, values.isArmed);
      break;
    case 'craft_name':
      renderCraftName(buffer, x, y, values.craftName);
      break;
    case 'warnings':
      renderWarnings(buffer, x, y, values);
      break;
    case 'messages':
      // Messages are FC-driven; in demo just show placeholder
      buffer.drawString(x, y, '            ');
      break;

    // Battery & Power
    case 'battery_voltage':
      renderBatteryVoltage(buffer, x, y, values.batteryVoltage);
      break;
    case 'battery_cell_voltage':
      renderCellVoltage(buffer, x, y, values.cellVoltage);
      break;
    case 'battery_percent':
      renderBatteryPercent(buffer, x, y, values.batteryPercent);
      break;
    case 'current_draw':
      renderCurrentDraw(buffer, x, y, values.batteryCurrent);
      break;
    case 'mah_drawn':
      renderMahDrawn(buffer, x, y, values.mahDrawn);
      break;
    case 'power_watts':
      renderPowerWatts(buffer, x, y, values.powerWatts);
      break;
    case 'efficiency':
      renderEfficiency(buffer, x, y, values.mahDrawn, values.distance);
      break;

    // Altitude & Vario
    case 'altitude':
      renderAltitude(buffer, x, y, values.altitude);
      break;
    case 'msl_altitude':
      renderMslAltitude(buffer, x, y, values.mslAltitude);
      break;
    case 'vario':
      renderVario(buffer, x, y, values.vario);
      break;

    // Speed & Distance
    case 'speed':
      renderSpeed(buffer, x, y, values.speed);
      break;
    case 'airspeed':
      renderAirspeed(buffer, x, y, values.airspeed);
      break;
    case 'max_speed':
      renderMaxSpeed(buffer, x, y, values.maxSpeed);
      break;
    case 'distance':
      renderDistance(buffer, x, y, values.distance);
      break;
    case 'home_direction':
      renderHomeDirection(buffer, x, y, values.homeDirection);
      break;

    // GPS
    case 'gps_sats':
      renderGpsSats(buffer, x, y, values.gpsSats);
      break;
    case 'gps_hdop':
      renderGpsHdop(buffer, x, y, values.gpsHdop);
      break;
    case 'latitude':
      renderLatitude(buffer, x, y, values.latitude);
      break;
    case 'longitude':
      renderLongitude(buffer, x, y, values.longitude);
      break;
    case 'coordinates':
      renderCoordinates(buffer, x, y, values.latitude, values.longitude);
      break;

    // Attitude
    case 'crosshairs':
      renderCrosshairs(buffer, x, y);
      break;
    case 'artificial_horizon':
      renderArtificialHorizon(buffer, x, y, values.pitch, values.roll);
      break;
    case 'horizon_sidebars':
      renderHorizonSidebars(buffer, x, y);
      break;
    case 'pitch':
      renderPitch(buffer, x, y, values.pitch);
      break;
    case 'roll':
      renderRoll(buffer, x, y, values.roll);
      break;
    case 'heading':
      renderHeading(buffer, x, y, values.heading);
      break;
    case 'heading_graph':
      renderHeadingGraph(buffer, x, y, values.heading);
      break;

    // Timers
    case 'flight_time':
      renderFlightTime(buffer, x, y, values.flightTime);
      break;
    case 'on_time':
      renderOnTime(buffer, x, y, values.onTime);
      break;
    case 'rtc_time':
      renderRtcTime(buffer, x, y);
      break;
    case 'remaining_flight_time':
      renderRemainingFlightTime(buffer, x, y, values);
      break;

    // Radio & Control
    case 'rssi':
      renderRssi(buffer, x, y, values.rssi);
      break;
    case 'rssi_dbm':
      renderRssiDbm(buffer, x, y, values.rssiDbm);
      break;
    case 'throttle':
      renderThrottle(buffer, x, y, values.throttle);
      break;
    case 'throttle_gauge':
      renderThrottleGauge(buffer, x, y, values.throttle);
      break;

    // Sensors
    case 'baro_temp':
      renderTemperature(buffer, x, y, SYM.BARO_TEMP, values.baroTemp);
      break;
    case 'imu_temp':
      renderTemperature(buffer, x, y, SYM.IMU_TEMP, values.imuTemp);
      break;
    case 'esc_temp':
      renderTemperature(buffer, x, y, SYM.ESC_TEMPERATURE, values.escTemp);
      break;
    case 'g_force':
      renderGForce(buffer, x, y, values.gForce);
      break;
    case 'esc_rpm':
      renderEscRpm(buffer, x, y, values.escRpm);
      break;

    // Mission
    case 'ccrp_indicator':
      if (ccrpResult) renderCcrpIndicator(buffer, x, y, ccrpResult);
      break;
    case 'vtx_channel':
      renderVtxChannel(buffer, x, y);
      break;
    case 'wind_horizontal':
      renderWindHorizontal(buffer, x, y, values.windSpeed, values.windDirection);
      break;
    case 'wind_vertical':
      renderWindVertical(buffer, x, y, values.windVertical);
      break;
  }
}

// =============================================================================
// Individual Renderers
// =============================================================================

// ── General ─────────────────────────────────────────────────────────────────

function renderFlymode(buffer: OsdScreenBuffer, x: number, y: number, mode: string): void {
  buffer.drawString(x, y, mode.substring(0, 8).padEnd(8, ' '));
}

function renderArmedStatus(buffer: OsdScreenBuffer, x: number, y: number, armed: boolean): void {
  buffer.drawString(x, y, armed ? ' ARMED  ' : 'DISARMED');
}

function renderCraftName(buffer: OsdScreenBuffer, x: number, y: number, name: string): void {
  buffer.drawString(x, y, name.substring(0, 10).padEnd(10, ' '));
}

function renderWarnings(buffer: OsdScreenBuffer, x: number, y: number, values: DemoTelemetry): void {
  // Show contextual warnings based on telemetry
  if (values.batteryPercent < 20) {
    buffer.drawString(x, y, '  LOW BATT  ');
  } else if (values.rssi < 30) {
    buffer.drawString(x, y, ' LOW SIGNAL ');
  } else if (values.gpsSats < 6) {
    buffer.drawString(x, y, '  NO GPS FIX');
  } else {
    // No active warnings
    buffer.drawString(x, y, '            ');
  }
}

// ── Battery & Power ─────────────────────────────────────────────────────────

function renderBatteryVoltage(buffer: OsdScreenBuffer, x: number, y: number, voltage: number): void {
  const voltStr = voltage.toFixed(1).padStart(4, ' ');
  buffer.setChar(x, y, SYM.BATT);
  buffer.drawString(x + 1, y, voltStr);
  buffer.setChar(x + 5, y, SYM.VOLT);
}

function renderCellVoltage(buffer: OsdScreenBuffer, x: number, y: number, cellV: number): void {
  const str = cellV.toFixed(2).padStart(4, ' ');
  buffer.setChar(x, y, SYM.BATT);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 5, y, SYM.VOLT);
}

function renderBatteryPercent(buffer: OsdScreenBuffer, x: number, y: number, percent: number): void {
  const pctStr = Math.round(percent).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.BATT);
  buffer.drawString(x + 1, y, pctStr);
  buffer.setChar(x + 4, y, 0x25); // %
}

function renderCurrentDraw(buffer: OsdScreenBuffer, x: number, y: number, current: number): void {
  const str = current.toFixed(1).padStart(4, ' ');
  buffer.setChar(x, y, SYM.AMP);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 5, y, 0x41); // A
}

function renderMahDrawn(buffer: OsdScreenBuffer, x: number, y: number, mah: number): void {
  const str = Math.round(mah).toString().padStart(4, ' ');
  buffer.setChar(x, y, SYM.MAH);
  buffer.drawString(x + 1, y, str);
}

function renderPowerWatts(buffer: OsdScreenBuffer, x: number, y: number, watts: number): void {
  const str = Math.round(watts).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.WATT);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 4, y, 0x57); // W
}

function renderEfficiency(buffer: OsdScreenBuffer, x: number, y: number, mah: number, dist: number): void {
  const effKm = dist > 0 ? Math.round((mah / dist) * 1000) : 0;
  const str = effKm.toString().padStart(4, ' ');
  buffer.setChar(x, y, SYM.MAH_KM_0);
  buffer.setChar(x + 1, y, SYM.MAH_KM_1);
  buffer.drawString(x + 2, y, str);
}

// ── Altitude & Vario ────────────────────────────────────────────────────────

function renderAltitude(buffer: OsdScreenBuffer, x: number, y: number, altitude: number): void {
  const altStr = Math.round(altitude).toString().padStart(4, ' ');
  buffer.setChar(x, y, SYM.ALT_M);
  buffer.drawString(x + 1, y, altStr);
  buffer.setChar(x + 5, y, SYM.M);
}

function renderMslAltitude(buffer: OsdScreenBuffer, x: number, y: number, alt: number): void {
  const str = Math.round(alt).toString().padStart(4, ' ');
  buffer.setChar(x, y, SYM.ALT_M);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 5, y, SYM.M);
}

function renderVario(buffer: OsdScreenBuffer, x: number, y: number, vario: number): void {
  const sign = vario >= 0 ? '+' : '';
  const str = `${sign}${vario.toFixed(1)}`;
  buffer.setChar(x, y, SYM.VARIO_UP_2A);
  buffer.drawString(x + 1, y, str.padStart(4, ' '));
}

// ── Speed & Distance ────────────────────────────────────────────────────────

function renderSpeed(buffer: OsdScreenBuffer, x: number, y: number, speed: number): void {
  const speedKmh = Math.round(speed * 3.6);
  const speedStr = speedKmh.toString().padStart(3, ' ');
  buffer.drawString(x, y, speedStr);
  buffer.setChar(x + 3, y, SYM.KMH);
}

function renderAirspeed(buffer: OsdScreenBuffer, x: number, y: number, airspeed: number): void {
  const str = Math.round(airspeed * 3.6).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.AIR);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 4, y, SYM.KMH);
}

function renderMaxSpeed(buffer: OsdScreenBuffer, x: number, y: number, maxSpd: number): void {
  const str = Math.round(maxSpd * 3.6).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.MAX);
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 4, y, SYM.KMH);
}

function renderDistance(buffer: OsdScreenBuffer, x: number, y: number, distance: number): void {
  buffer.setChar(x, y, SYM.HOME);
  const distStr = Math.round(distance).toString().padStart(4, ' ');
  buffer.drawString(x + 1, y, distStr);
  buffer.setChar(x + 5, y, SYM.M);
}

function renderHomeDirection(buffer: OsdScreenBuffer, x: number, y: number, dir: number): void {
  // Use arrow character based on direction (8 cardinal/intercardinal)
  const arrows = [0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f]; // Up, up-right, right, etc.
  const idx = Math.round(((dir % 360) + 360) % 360 / 45) % 8;
  buffer.setChar(x, y, SYM.HOME);
  buffer.setChar(x + 1, y, arrows[idx] || SYM.DIRECTION);
}

// ── GPS ─────────────────────────────────────────────────────────────────────

function renderGpsSats(buffer: OsdScreenBuffer, x: number, y: number, sats: number): void {
  buffer.setChar(x, y, SYM.GPS_SAT1);
  buffer.setChar(x + 1, y, SYM.GPS_SAT2);
  const satStr = sats.toString().padStart(2, ' ');
  buffer.drawString(x + 2, y, satStr);
}

function renderGpsHdop(buffer: OsdScreenBuffer, x: number, y: number, hdop: number): void {
  buffer.setChar(x, y, SYM.GPS_HDP1);
  buffer.setChar(x + 1, y, SYM.GPS_HDP2);
  buffer.drawString(x + 2, y, hdop.toFixed(1).padStart(3, ' '));
}

function renderLatitude(buffer: OsdScreenBuffer, x: number, y: number, lat: number): void {
  buffer.setChar(x, y, SYM.LAT);
  buffer.drawString(x + 1, y, lat.toFixed(5));
}

function renderLongitude(buffer: OsdScreenBuffer, x: number, y: number, lon: number): void {
  buffer.setChar(x, y, SYM.LON);
  buffer.drawString(x + 1, y, lon.toFixed(5));
}

function renderCoordinates(buffer: OsdScreenBuffer, x: number, y: number, lat: number, lon: number): void {
  buffer.setChar(x, y, SYM.LAT);
  buffer.drawString(x + 1, y, lat.toFixed(5));
  buffer.setChar(x, y + 1, SYM.LON);
  buffer.drawString(x + 1, y + 1, lon.toFixed(5));
}

// ── Attitude ────────────────────────────────────────────────────────────────

function renderCrosshairs(buffer: OsdScreenBuffer, x: number, y: number): void {
  buffer.setChar(x - 1, y, SYM.AH_CENTER_LINE);
  buffer.setChar(x, y, SYM.AH_AIRCRAFT2);
  buffer.setChar(x + 1, y, SYM.AH_CENTER_LINE_RIGHT);
}

function renderArtificialHorizon(
  buffer: OsdScreenBuffer,
  x: number,
  y: number,
  pitch: number,
  roll: number
): void {
  const HORIZON_WIDTH = 9;
  const CENTER_COL = 4;
  const CHAR_HEIGHT_PX = 18;
  const ROLL_SENSITIVITY = 3.0;
  const NUM_VARIANTS = 9;

  const clampedRoll = Math.max(-60, Math.min(60, roll));
  const rollRadians = clampedRoll * (Math.PI / 180);
  const pitchRowOffset = Math.round(pitch / 10);

  for (let i = 0; i < HORIZON_WIDTH; i++) {
    const columnOffset = i - CENTER_COL;
    const charX = x - CENTER_COL + i;

    const rollPixelOffset = (-columnOffset * Math.tan(rollRadians) * CHAR_HEIGHT_PX) / ROLL_SENSITIVITY;
    const rollRowOffset = Math.round(rollPixelOffset / CHAR_HEIGHT_PX);
    const normalizedOffset = (rollPixelOffset / CHAR_HEIGHT_PX) - rollRowOffset + 0.5;
    const finalRow = y - pitchRowOffset - rollRowOffset;

    const variantIndex = Math.max(0, Math.min(NUM_VARIANTS - 1,
      Math.round((1 - normalizedOffset) * (NUM_VARIANTS - 1))
    ));
    const horizonChar = SYM.AH_BAR9_0 + variantIndex;

    if (finalRow >= 0 && finalRow < buffer.height) {
      buffer.setChar(charX, finalRow, horizonChar);
    }
  }
}

function renderHorizonSidebars(buffer: OsdScreenBuffer, x: number, y: number): void {
  const SIDEBAR_WIDTH = 7;   // chars from center to sidebar
  const SIDEBAR_HEIGHT = 3;  // rows above/below center

  // Left vertical bar
  for (let i = -SIDEBAR_HEIGHT; i <= SIDEBAR_HEIGHT; i++) {
    buffer.setChar(x - SIDEBAR_WIDTH, y + i, SYM.AH_DECORATION);
  }
  // Right vertical bar
  for (let i = -SIDEBAR_HEIGHT; i <= SIDEBAR_HEIGHT; i++) {
    buffer.setChar(x + SIDEBAR_WIDTH, y + i, SYM.AH_DECORATION);
  }
  // Center level pointers
  buffer.setChar(x - SIDEBAR_WIDTH + 1, y, SYM.AH_LEFT);
  buffer.setChar(x + SIDEBAR_WIDTH - 1, y, SYM.AH_RIGHT);
}

function renderPitch(buffer: OsdScreenBuffer, x: number, y: number, pitch: number): void {
  const pitchStr = Math.round(pitch).toString().padStart(3, ' ');
  buffer.setChar(x, y, pitch >= 0 ? SYM.PITCH_UP : SYM.PITCH_DOWN);
  buffer.drawString(x + 1, y, pitchStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderRoll(buffer: OsdScreenBuffer, x: number, y: number, roll: number): void {
  const rollStr = Math.round(roll).toString().padStart(3, ' ');
  let symbol: number;
  if (roll < -10) symbol = SYM.ROLL_LEFT;
  else if (roll > 10) symbol = SYM.ROLL_RIGHT;
  else symbol = SYM.ROLL_LEVEL;

  buffer.setChar(x, y, symbol);
  buffer.drawString(x + 1, y, rollStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderHeading(buffer: OsdScreenBuffer, x: number, y: number, heading: number): void {
  const hdgStr = Math.round(heading).toString().padStart(3, '0');
  buffer.setChar(x, y, SYM.HEADING);
  buffer.drawString(x + 1, y, hdgStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderHeadingGraph(buffer: OsdScreenBuffer, x: number, y: number, heading: number): void {
  // Simple compass tape: N E S W with lines between
  const cardinals = ['N', 'E', 'S', 'W'];
  const normalizedHdg = ((heading % 360) + 360) % 360;
  // Each cardinal covers 90 degrees, we show 9 chars (~120 degrees FOV)
  const degreesPerChar = 360 / 36; // 10 degrees per character position
  const centerPos = normalizedHdg / degreesPerChar;

  for (let i = 0; i < 9; i++) {
    const pos = Math.round(centerPos - 4 + i) % 36;
    const normalPos = ((pos % 36) + 36) % 36;

    if (normalPos === 0) buffer.setChar(x + i, y, SYM.HEADING_N);
    else if (normalPos === 9) buffer.setChar(x + i, y, SYM.HEADING_E);
    else if (normalPos === 18) buffer.drawString(x + i, y, 'S');
    else if (normalPos === 27) buffer.setChar(x + i, y, SYM.HEADING_W);
    else if (normalPos % 9 === 0) buffer.setChar(x + i, y, SYM.HEADING_DIVIDED_LINE);
    else buffer.setChar(x + i, y, SYM.HEADING_LINE);
  }
}

// ── Timers ──────────────────────────────────────────────────────────────────

function renderFlightTime(buffer: OsdScreenBuffer, x: number, y: number, seconds: number): void {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  buffer.setChar(x, y, SYM.FLY_M);
  buffer.drawString(x + 1, y, timeStr);
}

function renderOnTime(buffer: OsdScreenBuffer, x: number, y: number, seconds: number): void {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  buffer.setChar(x, y, SYM.ON_M);
  buffer.drawString(x + 1, y, timeStr);
}

function renderRtcTime(buffer: OsdScreenBuffer, x: number, y: number): void {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  buffer.setChar(x, y, SYM.CLOCK);
  buffer.drawString(x + 1, y, `${h}:${m}`);
}

function renderRemainingFlightTime(buffer: OsdScreenBuffer, x: number, y: number, values: DemoTelemetry): void {
  // Estimate: (remaining %) / (current % usage rate per minute)
  const usedPct = 100 - values.batteryPercent;
  const elapsedMins = values.flightTime / 60;
  let remainMins = 0;
  if (usedPct > 0 && elapsedMins > 0) {
    const pctPerMin = usedPct / elapsedMins;
    remainMins = values.batteryPercent / pctPerMin;
  }
  const mins = Math.floor(remainMins);
  const secs = Math.floor((remainMins - mins) * 60);
  buffer.setChar(x, y, SYM.FLIGHT_MINS_REMAINING);
  buffer.drawString(x + 1, y, `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
}

// ── Radio & Control ─────────────────────────────────────────────────────────

function renderRssi(buffer: OsdScreenBuffer, x: number, y: number, rssi: number): void {
  buffer.setChar(x, y, SYM.RSSI);
  const rssiStr = Math.round(rssi).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, rssiStr);
}

function renderRssiDbm(buffer: OsdScreenBuffer, x: number, y: number, dbm: number): void {
  buffer.setChar(x, y, SYM.DBM);
  const str = Math.round(dbm).toString().padStart(4, ' ');
  buffer.drawString(x + 1, y, str);
}

function renderThrottle(buffer: OsdScreenBuffer, x: number, y: number, throttle: number): void {
  buffer.setChar(x, y, SYM.THR);
  const thrStr = Math.round(throttle).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, thrStr);
  buffer.setChar(x + 4, y, 0x25); // %
}

function renderThrottleGauge(buffer: OsdScreenBuffer, x: number, y: number, throttle: number): void {
  // 5 rows tall vertical gauge
  const filled = Math.round((throttle / 100) * 5);
  for (let i = 0; i < 5; i++) {
    const rowFromBottom = 4 - i; // 0=top, 4=bottom
    if (rowFromBottom < filled) {
      buffer.setChar(x, y + i, SYM.THROTTLE_GAUGE_FULL);
    } else {
      buffer.setChar(x, y + i, SYM.THROTTLE_GAUGE_EMPTY);
    }
  }
}

// ── Sensors ─────────────────────────────────────────────────────────────────

function renderTemperature(buffer: OsdScreenBuffer, x: number, y: number, symbol: number, temp: number): void {
  buffer.setChar(x, y, symbol);
  const str = Math.round(temp).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 4, y, SYM.TEMP_C);
}

function renderGForce(buffer: OsdScreenBuffer, x: number, y: number, g: number): void {
  buffer.setChar(x, y, SYM.GFORCE);
  buffer.drawString(x + 1, y, g.toFixed(1).padStart(3, ' '));
  buffer.setChar(x + 4, y, 0x47); // G
}

function renderEscRpm(buffer: OsdScreenBuffer, x: number, y: number, rpm: number): void {
  buffer.setChar(x, y, SYM.RPM);
  const str = rpm >= 10000
    ? `${(rpm / 1000).toFixed(1)}k`
    : Math.round(rpm).toString();
  buffer.drawString(x + 1, y, str.padStart(6, ' '));
}

// ── Mission ─────────────────────────────────────────────────────────────────

function renderCcrpIndicator(
  buffer: OsdScreenBuffer,
  x: number,
  y: number,
  ccrpResult: CcrpResult
): void {
  const GAUGE_HEIGHT = 5;

  if (!ccrpResult.valid) {
    buffer.drawString(x, y, '---');
    buffer.drawString(x, y + 1, 'CCRP');
    return;
  }

  if (ccrpResult.inRange) {
    buffer.drawString(x - 1, y, 'DROP!');
  } else if (ccrpResult.passed) {
    buffer.drawString(x - 1, y, 'PASS');
  } else if (!ccrpResult.isLinedUp) {
    const error = ccrpResult.headingError;
    if (error > 20) buffer.drawString(x - 1, y, '>>R');
    else if (error > 5) buffer.drawString(x - 1, y, ' >R');
    else if (error < -20) buffer.drawString(x - 1, y, 'L<<');
    else if (error < -5) buffer.drawString(x - 1, y, 'L< ');
  } else {
    buffer.drawString(x - 1, y, ' OK ');
  }

  const gaugeStartY = y + 1;
  const fillLevel = Math.min(GAUGE_HEIGHT, Math.round(ccrpResult.releaseProgress * GAUGE_HEIGHT));

  for (let i = 0; i < GAUGE_HEIGHT; i++) {
    const rowY = gaugeStartY + i;
    const isFilled = i < fillLevel;
    buffer.setChar(x, rowY, 0x7c); // |
    if (isFilled) {
      buffer.setChar(x + 1, rowY, ccrpResult.isLinedUp ? 0x23 : 0x3d);
    } else {
      buffer.setChar(x + 1, rowY, 0x2e);
    }
    buffer.setChar(x + 2, rowY, 0x7c); // |
  }

  const targetY = gaugeStartY + GAUGE_HEIGHT;
  buffer.setChar(x, targetY, 0x5b);
  buffer.setChar(x + 1, targetY, 0x58);
  buffer.setChar(x + 2, targetY, 0x5d);

  const distY = targetY + 1;
  if (ccrpResult.distanceToRelease >= 0) {
    const distStr = Math.round(ccrpResult.distanceToRelease).toString();
    buffer.drawString(x, distY, distStr.padStart(3, ' ') + 'm');
  } else {
    const distStr = Math.round(Math.abs(ccrpResult.distanceToRelease)).toString();
    buffer.drawString(x, distY, '-' + distStr.padStart(2, ' ') + 'm');
  }

  const hdgErrY = distY + 1;
  const hdgErr = Math.round(ccrpResult.headingError);
  if (hdgErr > 0) buffer.drawString(x, hdgErrY, `R${hdgErr}`.padStart(4, ' '));
  else if (hdgErr < 0) buffer.drawString(x, hdgErrY, `L${Math.abs(hdgErr)}`.padStart(4, ' '));
  else buffer.drawString(x, hdgErrY, '  0 ');
}

function renderVtxChannel(buffer: OsdScreenBuffer, x: number, y: number): void {
  buffer.setChar(x, y, SYM.VTX_POWER);
  buffer.drawString(x + 1, y, 'R:4:25');
}

function renderWindHorizontal(buffer: OsdScreenBuffer, x: number, y: number, speed: number, _dir: number): void {
  buffer.setChar(x, y, SYM.WIND_SPEED_HORIZONTAL);
  const str = Math.round(speed).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, str);
  buffer.setChar(x + 4, y, SYM.KMH);
}

function renderWindVertical(buffer: OsdScreenBuffer, x: number, y: number, vert: number): void {
  buffer.setChar(x, y, SYM.WIND_SPEED_VERTICAL);
  const sign = vert >= 0 ? '+' : '';
  buffer.drawString(x + 1, y, `${sign}${vert.toFixed(1)}`.padStart(4, ' '));
}
