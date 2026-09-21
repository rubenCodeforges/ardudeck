/**
 * Built-in instrument layouts offered in the Instruments menu next to the
 * user's saved ones. Positions are anchor payloads (see useDraggableOverlay
 * v3), so they are resolution independent: bottom-anchored rows keep their
 * distance from the bottom edge and center offsets keep the cluster shape on
 * any panel size. To bake in a user-made layout, copy it from localStorage
 * key `map-instrument-layouts` and paste the snapshot here.
 */
import type { InstrumentLayoutSnapshot } from '../../../stores/map-instruments-store';

export type PresetAccent = 'green' | 'blue' | 'amber' | 'violet';

export interface PresetInstrumentLayout {
  name: string;
  /** One line under the card name; keep it short so cards stay equal height. */
  description: string;
  accent: PresetAccent;
  layout: InstrumentLayoutSnapshot;
}

/** The default cockpit (baked from the field-made "true new pilot"): the gauge
 * bar along the bottom with the ball inline at its right end, the data /
 * annunciator / flight-control rail down the left, mission and link top right.
 * Battery runs the "used" gauge so charge and consumption share one dial. */
const PILOT_COCKPIT: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': true,
    battery: true,
    gps: true,
    altitude: true,
    speed: true,
    heading: false,
    vsi: true,
    home: true,
    'flight-mode': false,
    link: true,
    mission: true,
    annunciator: true,
    rtk: false,
    controls: true,
  },
  scale: { 'group:d1': 0.8, 'group:d2': 0.9, controls: 0.8 },
  opacity: 1,
  instrumentOpacity: {},
  displayMode: { battery: 'used' },
  groups: {
    d1: { members: ['home', 'altitude', 'gps', 'attitude', 'speed', 'vsi', 'battery'], orientation: 'row' },
    d2: { members: ['flight-data', 'annunciator', 'controls'], orientation: 'col' },
    d3: { members: ['mission', 'link'], orientation: 'row' },
  },
  positions: {
    // Solo anchors kept so an undocked member lands in a sensible spot.
    'instrument:attitude': { ax: 'right', ay: 'bottom', dx: 0, dy: 15, v: 4 },
    'instrument:home': { ax: 'center', ay: 'bottom', dx: -356, dy: 19, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'bottom', dx: -356, dy: 19, v: 4 },
    'instrument:altitude': { ax: 'center', ay: 'bottom', dx: -252, dy: 18, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'bottom', dx: -156, dy: 19, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'bottom', dx: 148, dy: 19, v: 4 },
    'instrument:vsi': { ax: 'center', ay: 'bottom', dx: 252, dy: 18, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'bottom', dx: 364, dy: 19, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'middle', dx: 48, dy: -150.5, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 0, dy: 10, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 216, dy: 8, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'middle', dx: 10, dy: -110, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'middle', dx: 8, dy: 45.5, v: 4 },
    'instrument:controls': { ax: 'left', ay: 'middle', dx: 8, dy: 22.5, v: 4 },
    'instrument:group:d1': { ax: 'left', ay: 'bottom', dx: 40, dy: -5, v: 4 },
    'instrument:group:d2': { ax: 'left', ay: 'middle', dx: 0, dy: -21, v: 4 },
    'instrument:group:d3': { ax: 'right', ay: 'top', dx: 116, dy: 0, v: 4 },
  },
};

/** Minimal: just the attitude ball, flight data card and the status strips. */
const MINIMAL: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': true,
    battery: false,
    gps: false,
    altitude: false,
    speed: false,
    heading: false,
    vsi: false,
    home: false,
    'flight-mode': true,
    link: false,
    mission: true,
    annunciator: false,
  },
  scale: {},
  opacity: 1,
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'bottom', dx: 0, dy: 4, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'top', dx: -120, dy: 10, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 110, dy: 10, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'bottom', dx: 8, dy: 8, v: 4 },
  },
};

/** Strips only: the scalar gauges as compact strips banked across the top, the
 * attitude ball and flight-control card at the bottom. Baked in from a
 * user-exported layout (Ruben's "Strips Only"). */
const STRIPS_ONLY: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': false,
    battery: true,
    gps: true,
    altitude: true,
    speed: true,
    heading: true,
    vsi: true,
    home: true,
    'flight-mode': true,
    link: true,
    mission: true,
    annunciator: false,
    controls: true,
  },
  scale: { battery: 1, gps: 1, speed: 1, heading: 1, altitude: 1, vsi: 1, annunciator: 1.5, home: 1 },
  opacity: 1,
  instrumentOpacity: { altitude: 1, controls: 1, annunciator: 0.84, 'flight-data': 0.5 },
  displayMode: {
    altitude: 'strip',
    vsi: 'strip',
    battery: 'strip',
    gps: 'strip',
    heading: 'strip',
    link: 'strip',
    speed: 'strip',
    home: 'strip',
  },
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'bottom', dx: 18, dy: 11, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'top', dx: 0, dy: 40, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'top', dx: -181.5, dy: 8, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'top', dx: -378.5, dy: 8, v: 4 },
    'instrument:altitude': { ax: 'center', ay: 'top', dx: 346, dy: 8, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'top', dx: 460.5, dy: 8, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'top', dx: 3.5, dy: 8, v: 4 },
    'instrument:vsi': { ax: 'right', ay: 'top', dx: 103, dy: 8, v: 4 },
    'instrument:home': { ax: 'center', ay: 'top', dx: 7, dy: 48, v: 4 },
    'instrument:flight-mode': { ax: 'left', ay: 'middle', dx: 8, dy: -160.5, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 190.5, dy: 8, v: 4 },
    'instrument:mission': { ax: 'left', ay: 'middle', dx: 8, dy: -100.5, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'bottom', dx: 0, dy: 118, v: 4 },
    'instrument:controls': { ax: 'left', ay: 'bottom', dx: 0, dy: 0, v: 4 },
  },
};

/** Split-screen cockpit (baked from the field-made "split view" layout): a
 * stretched bottom bar carrying flight control, HOME, the ball and BAT; the
 * data/strips rail docked on the left; the status strip row on top. Sized for
 * a half-width map and auto-applied when the in-map split opens (a user-saved
 * layout named "split*" wins). */
export const SPLIT_COCKPIT: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': true,
    battery: true,
    gps: true,
    altitude: true,
    speed: true,
    heading: false,
    vsi: false,
    home: true,
    'flight-mode': true,
    link: true,
    mission: true,
    annunciator: true,
    rtk: false,
    controls: true,
  },
  scale: {},
  opacity: 1,
  instrumentOpacity: {},
  displayMode: {
    gps: 'strip',
    altitude: 'strip',
    speed: 'strip',
  },
  groups: {
    d1: { members: ['controls', 'home', 'attitude', 'battery'], orientation: 'row', stretch: true },
    d2: { members: ['flight-data', 'annunciator', 'gps', 'altitude', 'speed'], orientation: 'col' },
    d3: { members: ['flight-mode', 'mission', 'link'], orientation: 'row' },
  },
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'middle', dx: 164.5, dy: 44.5, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'middle', dx: 10, dy: -110, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'middle', dx: 154.5, dy: 34.5, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'middle', dx: -249, dy: 7, v: 4 },
    'instrument:altitude': { ax: 'center', ay: 'middle', dx: -254, dy: 37.5, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'middle', dx: -259.5, dy: 77.5, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'bottom', dx: -356, dy: 19, v: 4 },
    'instrument:vsi': { ax: 'right', ay: 'bottom', dx: 103, dy: 19, v: 4 },
    'instrument:home': { ax: 'center', ay: 'middle', dx: 26.5, dy: 138.5, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'top', dx: -200, dy: 8, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 216, dy: 8, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 0, dy: 10, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'middle', dx: 8, dy: 45.5, v: 4 },
    'instrument:controls': { ax: 'left', ay: 'bottom', dx: 32, dy: 4, v: 4 },
    'instrument:group:d1': { ax: 'left', ay: 'bottom', dx: 32, dy: -13, v: 4 },
    'instrument:group:d2': { ax: 'left', ay: 'middle', dx: 0, dy: 29.5, v: 4 },
    'instrument:group:d3': { ax: 'center', ay: 'top', dx: -13.5, dy: 0, v: 4 },
  },
};

/** Ground vehicles: no attitude ball, no VSI, no altitude. The bottom row is
 * the driving scan (flight control, tilt, steering, speed, battery), with
 * cross-track and mission on the navigation rail. */
const ROVER_COCKPIT: InstrumentLayoutSnapshot = {
  visible: {
    attitude: false,
    altitude: false,
    vsi: false,
    tilt: true,
    steer: true,
    xtrack: true,
    'flight-data': true,
    battery: true,
    gps: true,
    speed: true,
    heading: true,
    home: true,
    'flight-mode': true,
    link: true,
    mission: true,
    annunciator: true,
    rtk: false,
    controls: true,
  },
  scale: {},
  opacity: 1,
  instrumentOpacity: {},
  displayMode: {},
  groups: {
    d1: { members: ['controls', 'home', 'heading', 'gps'], orientation: 'row' },
    d2: { members: ['flight-data', 'annunciator', 'xtrack'], orientation: 'col' },
    d3: { members: ['flight-mode', 'mission', 'link'], orientation: 'row' },
    d4: { members: ['steer', 'speed', 'battery'], orientation: 'row' },
  },
  positions: {
    'instrument:tilt': { ax: 'center', ay: 'bottom', dx: 0, dy: 4, v: 4 },
    'instrument:home': { ax: 'center', ay: 'bottom', dx: -356, dy: 19, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'bottom', dx: -252, dy: 18, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'bottom', dx: -156, dy: 19, v: 4 },
    'instrument:steer': { ax: 'center', ay: 'bottom', dx: 148, dy: 19, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'bottom', dx: 252, dy: 18, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'bottom', dx: 364, dy: 19, v: 4 },
    'instrument:xtrack': { ax: 'left', ay: 'middle', dx: 8, dy: 100, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'top', dx: -200, dy: 8, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 0, dy: 10, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 216, dy: 8, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'middle', dx: 10, dy: -110, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'middle', dx: 8, dy: 45.5, v: 4 },
    'instrument:controls': { ax: 'left', ay: 'bottom', dx: 16, dy: 4, v: 4 },
    'instrument:group:d1': { ax: 'left', ay: 'bottom', dx: 16, dy: 7, v: 4 },
    'instrument:group:d2': { ax: 'left', ay: 'top', dx: 0, dy: 64, v: 4 },
    'instrument:group:d3': { ax: 'center', ay: 'top', dx: -13.5, dy: 0, v: 4 },
    'instrument:group:d4': { ax: 'center', ay: 'bottom', dx: 256, dy: 7, v: 4 },
  },
};

export const PRESET_INSTRUMENT_LAYOUTS: PresetInstrumentLayout[] = [
  { name: 'Pilot cockpit', description: 'Gauge bar along the bottom, command rail down the left.', accent: 'green', layout: PILOT_COCKPIT },
  { name: 'Minimal', description: 'Just the ball, flight data and the status strips.', accent: 'blue', layout: MINIMAL },
  { name: 'Strips only', description: 'Compact readout bands, maximum map.', accent: 'amber', layout: STRIPS_ONLY },
  { name: 'Split cockpit', description: 'Slim set for the in-map split; applied automatically.', accent: 'violet', layout: SPLIT_COCKPIT },
  { name: 'Rover', description: 'Ground set: tilt, steering and cross-track instead of the ball.', accent: 'amber', layout: ROVER_COCKPIT },
];
