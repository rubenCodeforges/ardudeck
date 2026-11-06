/**
 * Motor layout lookup and geometry helpers.
 *
 * Layout data is bundled from MissionPlanner-ref/APMotorLayout.json into
 * src/shared/ap-motor-layouts.json. The JSON contains entries keyed by
 * (FRAME_CLASS, FRAME_TYPE) with Roll/Pitch positions that we normalize
 * into SVG coordinates for the frame diagram.
 */

import layoutsJson from '../../../../shared/ap-motor-layouts.json';
import type { FrameLayout, FrameLayoutMotor, FrameLayoutsFile } from '../../../../shared/motor-test-types';

const layoutsFile = layoutsJson as FrameLayoutsFile;

/**
 * Find the frame layout matching the given FRAME_CLASS and FRAME_TYPE.
 * Returns null if no exact match is found.
 */
export function findFrameLayout(frameClass: number, frameType: number): FrameLayout | null {
  for (const layout of layoutsFile.layouts) {
    if (layout.Class === frameClass && layout.Type === frameType) {
      return layout;
    }
  }
  return null;
}

/**
 * Fallback: build a generic circular layout with N motors evenly spaced.
 * Used when FRAME_CLASS/TYPE can't be resolved.
 */
export function buildGenericLayout(motorCount: number): FrameLayout {
  const motors: FrameLayoutMotor[] = [];
  for (let i = 0; i < motorCount; i++) {
    const angle = (i / motorCount) * Math.PI * 2 - Math.PI / 2;
    motors.push({
      Number: i + 1,
      TestOrder: i + 1,
      Rotation: i % 2 === 0 ? 'CW' : 'CCW',
      // Roll is X, Pitch is Y. Unit circle.
      Roll: Math.cos(angle) * 0.5,
      Pitch: Math.sin(angle) * 0.5,
    });
  }
  return {
    Class: 0,
    ClassName: 'Generic',
    Type: 0,
    TypeName: `${motorCount}-motor generic`,
    motors,
  };
}

/**
 * Build a frame layout from PX4 control-allocation geometry.
 * CA_ROTOR_COUNT gives the motor count; CA_ROTOR{i}_PX/_PY give positions in
 * the body frame (X forward, Y right); CA_ROTOR{i}_KM sign gives spin
 * direction (positive = CCW, negative = CW, per control_allocator module.yaml).
 * Returns null when CA_ROTOR_COUNT is missing/zero (not a multirotor airframe).
 */
export function buildPx4Layout(get: (key: string) => number | undefined): FrameLayout | null {
  const count = get('CA_ROTOR_COUNT');
  if (!count || count < 1) return null;
  const n = Math.min(Math.round(count), 12);

  const motors: FrameLayoutMotor[] = [];
  let anyGeometry = false;
  for (let i = 0; i < n; i++) {
    const px = get(`CA_ROTOR${i}_PX`) ?? 0;
    const py = get(`CA_ROTOR${i}_PY`) ?? 0;
    const km = get(`CA_ROTOR${i}_KM`);
    if (px !== 0 || py !== 0) anyGeometry = true;
    motors.push({
      Number: i + 1,
      TestOrder: i + 1,
      Rotation: km === undefined || km === 0 ? '?' : km > 0 ? 'CCW' : 'CW',
      // Layout space: Pitch = forward (+PX); right side of vehicle renders at
      // -Roll (see layoutToSvgPositions), so Roll = -PY.
      Roll: -py,
      Pitch: px,
    });
  }

  if (!anyGeometry) {
    // Geometry params unset: fall back to an evenly spaced circle but keep the
    // KM-derived (or unknown) spin directions rather than guessing.
    const generic = buildGenericLayout(n);
    return {
      ...generic,
      ClassName: 'PX4',
      TypeName: `PX4 ${n}-rotor`,
      motors: generic.motors.map((m, i) => ({ ...m, Rotation: motors[i]?.Rotation ?? '?' })),
    };
  }

  return { Class: -1, ClassName: 'PX4', Type: -1, TypeName: `PX4 ${n}-rotor`, motors };
}

export interface MotorPosition {
  number: number;
  testOrder: number;
  rotation: 'CW' | 'CCW' | '?';
  /** SVG X coordinate in the [0, size] range */
  cx: number;
  /** SVG Y coordinate in the [0, size] range */
  cy: number;
  /** Circle radius; smaller for a coaxial pair so both motors fit at one arm. */
  r: number;
  /** The tricopter's yaw servo: sits at the centre of the layout and is no motor. */
  servo: boolean;
}

export const MOTOR_RADIUS = 26;

/**
 * Convert a layout's Roll/Pitch positions to SVG coordinates centered in a
 * square canvas of the given size.
 *
 * Roll axis: +X (right). Pitch axis: +Y (forward) — but SVG Y is inverted.
 * We pad so motors are drawn well inside the canvas edges.
 * Coaxial frames (X8, Y6, DodecaHexa) list two motors at one arm position;
 * they are drawn side by side across the arm instead of on top of each other.
 */
export function layoutToSvgPositions(layout: FrameLayout, size: number, pad = 40): MotorPosition[] {
  if (layout.motors.length === 0) return [];

  // Find the max absolute Roll/Pitch to normalize to [-1, 1]
  let maxExtent = 0;
  for (const m of layout.motors) {
    maxExtent = Math.max(maxExtent, Math.abs(m.Roll), Math.abs(m.Pitch));
  }
  if (maxExtent === 0) maxExtent = 1;

  const radius = (size - pad * 2) / 2;
  const center = size / 2;
  const scale = size / 340;

  const groups = new Map<string, number[]>();
  for (const m of layout.motors) {
    const key = `${m.Roll.toFixed(3)},${m.Pitch.toFixed(3)}`;
    groups.set(key, [...(groups.get(key) ?? []), m.Number]);
  }
  const baseR = MOTOR_RADIUS * scale * (layout.motors.length > 6 ? 0.8 : 1);

  return layout.motors.map((m) => {
    // Roll → X. Roll is a torque factor: -Roll = right side of vehicle = +X in SVG.
    let cx = center - (m.Roll / maxExtent) * radius;
    // Pitch → Y. +Pitch = forward = top of SVG = -Y, so we subtract.
    let cy = center - (m.Pitch / maxExtent) * radius;
    let r = baseR;
    const servo = layout.ClassName === 'TRI' && m.Roll === 0 && m.Pitch === 0;
    const pair = groups.get(`${m.Roll.toFixed(3)},${m.Pitch.toFixed(3)}`) ?? [];
    if (!servo && pair.length > 1) {
      // across the arm: perpendicular to the line from the centre
      const ang = Math.atan2(cy - center, cx - center) + Math.PI / 2;
      const off = baseR * 0.78 * (pair.indexOf(m.Number) === 0 ? -1 : 1);
      cx += Math.cos(ang) * off;
      cy += Math.sin(ang) * off;
      r = baseR * 0.74;
    }
    return { number: m.Number, testOrder: m.TestOrder, rotation: m.Rotation, cx, cy, r, servo };
  });
}

/**
 * Convert TestOrder number (1-based) to a letter label like "A", "B", etc.
 */
export function testOrderToLabel(testOrder: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + testOrder - 1);
}

// The layout data uses ArduPilot's short enum names (X_REV, CW_X, BF_X), but the
// FC's FRAME_TYPE parameter dropdown shows friendlier names (BetaFlightXReversed,
// ClockwiseX, BetaFlightX). Showing the short name made users think the diagram
// disagreed with their FC. Map to the FC-facing name; unknown names pass through.
const FRAME_TYPE_DISPLAY_NAMES: Record<string, string> = {
  BF_X: 'BetaFlightX',
  BF_X_REV: 'BetaFlightXReversed',
  X_REV: 'BetaFlightXReversed',
  DJI_X: 'DJIX',
  CW_X: 'ClockwiseX',
};
export function frameTypeDisplayName(typeName: string): string {
  return FRAME_TYPE_DISPLAY_NAMES[typeName] ?? typeName;
}

/**
 * Read FRAME_CLASS / FRAME_TYPE from a parameter map, checking both the
 * plain ArduPilot names and the Q_ prefixed QuadPlane versions.
 * Returns null if either value is missing.
 */
export function getFrameClassType(
  params: Map<string, number> | Record<string, number> | ((key: string) => number | undefined)
): { frameClass: number; frameType: number } | null {
  const get = (key: string): number | undefined => {
    if (typeof params === 'function') return params(key);
    if (params instanceof Map) return params.get(key);
    return params[key];
  };

  let frameClass = get('FRAME_CLASS');
  let frameType = get('FRAME_TYPE');

  if (frameClass === undefined || frameType === undefined) {
    frameClass = get('Q_FRAME_CLASS');
    frameType = get('Q_FRAME_TYPE');
  }

  if (frameClass === undefined || frameType === undefined) return null;
  return { frameClass, frameType };
}

/** What the board holds for a parameter: a staged edit is not on the vehicle until it is written. */
export function boardValue(p: { value: number; originalValue?: number; isModified?: boolean } | undefined): number | undefined {
  if (!p) return undefined;
  return p.isModified ? (p.originalValue ?? p.value) : p.value;
}

export type FrameState = 'ok' | 'unwritten' | 'reboot' | 'undefined';

/**
 * Whether the motor test can trust the frame. A FRAME_CLASS / FRAME_TYPE edit that is only
 * staged is not on the vehicle, and class 0 (Undefined) means the board has no motor layout, so
 * ArduPilot refuses the test either way.
 */
export function frameState(
  get: (key: string) => { value: number; originalValue?: number; isModified?: boolean } | undefined,
  rebootPending: readonly string[] = [],
): FrameState {
  const prefix = get('FRAME_CLASS') ? '' : get('Q_FRAME_CLASS') ? 'Q_' : null;
  if (prefix === null) return 'ok';
  if (get(`${prefix}FRAME_CLASS`)?.isModified || get(`${prefix}FRAME_TYPE`)?.isModified) return 'unwritten';
  // Written, but ArduPilot builds the motor layout at boot: it still runs the old frame.
  if (rebootPending.includes(`${prefix}FRAME_CLASS`) || rebootPending.includes(`${prefix}FRAME_TYPE`)) return 'reboot';
  return boardValue(get(`${prefix}FRAME_CLASS`)) === 0 ? 'undefined' : 'ok';
}

/** FRAME_CLASS values the ArduCopter heli build can run: Heli, Heli_Dual, HeliQuad. */
const HELI_FRAME_CLASSES = new Set([6, 11, 13]);

/**
 * True when the board runs the ArduCopter heli build (only it has H_RSC_MODE) but FRAME_CLASS asks
 * for a multirotor. That build never takes a multirotor frame, so the value is refused on every boot.
 */
export function heliBuildWithMultirotorFrame(get: (key: string) => { value: number } | undefined): boolean {
  const frameClass = get('FRAME_CLASS')?.value;
  return get('H_RSC_MODE') !== undefined && frameClass !== undefined && frameClass !== 0 && !HELI_FRAME_CLASSES.has(frameClass);
}
