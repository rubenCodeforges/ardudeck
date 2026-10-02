/**
 * Pre-built graph templates for common ArduPilot scripting patterns.
 * Each template is hand-laid-out with comment annotations, generous spacing,
 * and a clear left-to-right data flow to serve as learning examples.
 */
import type { GraphFile } from './lua-graph-types';

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  graph: GraphFile;
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  // ─── Low Battery Warning ──────────────────────────────────────
  {
    id: 'low-battery-warning',
    name: 'Low Battery Warning', // i18n-exempt
    description: 'Send a GCS alert when battery voltage drops below a threshold.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Low Battery Warning', // i18n-exempt
      description: 'Send a GCS alert when battery voltage drops below threshold', // i18n-exempt
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read battery voltage from the flight controller' }, // i18n-exempt
          },
        },
        {
          id: 'comment_logic',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Is voltage below our safety limit?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Warn the pilot via GCS message' }, // i18n-exempt
          },
        },
        // ── Data flow ──
        {
          id: 'sensor',
          type: 'sensor-battery',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 420, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Voltage < 14.2?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '<' },
          },
        },
        {
          id: 'threshold',
          type: 'var-constant',
          position: { x: 220, y: 290 },
          data: {
            definitionType: 'var-constant',
            label: 'Threshold (V)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '14.2' },
          },
        },
        {
          id: 'alert',
          type: 'action-gcs-text',
          position: { x: 740, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Warn Low Battery', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'WARNING: Low battery voltage!', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'sensor', target: 'compare', sourceHandle: 'voltage', targetHandle: 'a' },
        { id: 'e2', source: 'threshold', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'alert', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Geofence Alert ───────────────────────────────────────────
  {
    id: 'geofence-alert',
    name: 'Geofence Alert', // i18n-exempt
    description: 'Warn when altitude exceeds a safety limit.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Geofence Alert', // i18n-exempt
      description: 'Warn when altitude exceeds a safety limit', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read current barometric altitude' }, // i18n-exempt
          },
        },
        {
          id: 'comment_logic',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Has vehicle exceeded the altitude fence?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 720, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Alert GCS with urgent warning' }, // i18n-exempt
          },
        },
        // ── Data flow ──
        {
          id: 'sensor',
          type: 'sensor-baro-alt',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-baro-alt',
            label: 'Baro Altitude', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 400, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Alt > 120m?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'max_alt',
          type: 'var-constant',
          position: { x: 200, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Max Altitude (m)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '120' },
          },
        },
        {
          id: 'alert',
          type: 'action-gcs-text',
          position: { x: 740, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Altitude Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'ALTITUDE LIMIT EXCEEDED!', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'sensor', target: 'compare', sourceHandle: 'alt_m', targetHandle: 'a' },
        { id: 'e2', source: 'max_alt', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'alert', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Mode Announcement ────────────────────────────────────────
  {
    id: 'mode-announcement',
    name: 'Mode Announcement', // i18n-exempt
    description: 'Send a GCS message whenever the RC mode channel changes.', // i18n-exempt
    category: 'Utility',
    graph: {
      version: 1,
      name: 'Mode Announcement', // i18n-exempt
      description: 'Send a GCS message whenever the RC mode channel changes', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_input',
          type: 'flow-comment',
          position: { x: 40, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read the RC mode switch (channel 5)' }, // i18n-exempt
          },
        },
        {
          id: 'comment_detect',
          type: 'flow-comment',
          position: { x: 380, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Only fire when the value actually changes' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 700, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Notify pilot of the switch change' }, // i18n-exempt
          },
        },
        // ── Data flow ──
        {
          id: 'rc_input',
          type: 'sensor-rc-channel',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-rc-channel',
            label: 'Mode Switch (CH5)', // i18n-exempt
            category: 'sensors',
            propertyValues: { channel: 5 },
          },
        },
        {
          id: 'on_change',
          type: 'timing-on-change',
          position: { x: 400, y: 125 },
          data: {
            definitionType: 'timing-on-change',
            label: 'Detect Change', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'announce',
          type: 'action-gcs-text',
          position: { x: 720, y: 125 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Mode Changed', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Flight mode switch changed', severity: 6 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'rc_input', target: 'on_change', sourceHandle: 'value_us', targetHandle: 'value' },
        { id: 'e2', source: 'on_change', target: 'announce', sourceHandle: 'changed', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Landing Gear ─────────────────────────────────────────────
  {
    id: 'landing-gear',
    name: 'Landing Gear', // i18n-exempt
    description: 'Auto retract/deploy landing gear based on altitude threshold.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Landing Gear', // i18n-exempt
      description: 'Auto retract/deploy landing gear based on altitude', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 30, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Sense', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read current altitude above ground' }, // i18n-exempt
          },
        },
        {
          id: 'comment_decide',
          type: 'flow-comment',
          position: { x: 370, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Decide', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Above gear-change altitude?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_branch',
          type: 'flow-comment',
          position: { x: 660, y: 10 },
          data: {
            definitionType: 'flow-comment',
            label: 'Branch', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Take different action based on result' }, // i18n-exempt
          },
        },
        // ── Sensor column ──
        {
          id: 'altitude',
          type: 'sensor-baro-alt',
          position: { x: 50, y: 100 },
          data: {
            definitionType: 'sensor-baro-alt',
            label: 'Altitude', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'gear_alt',
          type: 'var-constant',
          position: { x: 50, y: 260 },
          data: {
            definitionType: 'var-constant',
            label: 'Gear Alt (m)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '10' },
          },
        },
        // ── Logic column ──
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 380, y: 100 },
          data: {
            definitionType: 'logic-compare',
            label: 'Above 10m?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'branch',
          type: 'logic-if-else',
          position: { x: 680, y: 110 },
          data: {
            definitionType: 'logic-if-else',
            label: 'Branch', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        // ── TRUE path (retract — top) ──
        {
          id: 'retract_pwm',
          type: 'var-constant',
          position: { x: 900, y: 30 },
          data: {
            definitionType: 'var-constant',
            label: 'Retracted PWM', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1100' },
          },
        },
        {
          id: 'retract',
          type: 'action-set-servo',
          position: { x: 1000, y: 100 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Retract Gear', // i18n-exempt
            category: 'actions',
            propertyValues: { servo_num: 9 },
          },
        },
        // ── FALSE path (deploy — bottom) ──
        {
          id: 'deploy_pwm',
          type: 'var-constant',
          position: { x: 900, y: 260 },
          data: {
            definitionType: 'var-constant',
            label: 'Deployed PWM', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1900' },
          },
        },
        {
          id: 'deploy',
          type: 'action-set-servo',
          position: { x: 1000, y: 330 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Deploy Gear', // i18n-exempt
            category: 'actions',
            propertyValues: { servo_num: 9 },
          },
        },
      ],
      edges: [
        // Sensor → Compare
        { id: 'e1', source: 'altitude', target: 'compare', sourceHandle: 'alt_m', targetHandle: 'a' },
        { id: 'e2', source: 'gear_alt', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        // Compare → Branch
        { id: 'e3', source: 'compare', target: 'branch', sourceHandle: 'result', targetHandle: 'condition' },
        // TRUE → Retract
        { id: 'e4', source: 'branch', target: 'retract', sourceHandle: 'true_out', targetHandle: 'trigger' },
        { id: 'e5', source: 'retract_pwm', target: 'retract', sourceHandle: 'value', targetHandle: 'pwm' },
        // FALSE → Deploy
        { id: 'e6', source: 'branch', target: 'deploy', sourceHandle: 'false_out', targetHandle: 'trigger' },
        { id: 'e7', source: 'deploy_pwm', target: 'deploy', sourceHandle: 'value', targetHandle: 'pwm' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  },

  // ─── Camera Trigger ───────────────────────────────────────────
  {
    id: 'camera-trigger',
    name: 'Camera Trigger', // i18n-exempt
    description: 'Trigger camera relay at a fixed time interval while the vehicle is moving.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Camera Trigger', // i18n-exempt
      description: 'Trigger camera relay at time intervals while moving', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Check if the vehicle is moving' }, // i18n-exempt
          },
        },
        {
          id: 'comment_gate',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Only trigger while speed > minimum' }, // i18n-exempt
          },
        },
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 690, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Rate-limit the shutter trigger' }, // i18n-exempt
          },
        },
        {
          id: 'comment_fire',
          type: 'flow-comment',
          position: { x: 1000, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 4', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Activate camera relay' }, // i18n-exempt
          },
        },
        // ── Data flow ──
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'min_speed',
          type: 'var-constant',
          position: { x: 160, y: 270 },
          data: {
            definitionType: 'var-constant',
            label: 'Min Speed (m/s)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1' },
          },
        },
        {
          id: 'moving_check',
          type: 'logic-compare',
          position: { x: 400, y: 115 },
          data: {
            definitionType: 'logic-compare',
            label: 'Moving?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 710, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 5 sec', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 5000 },
          },
        },
        {
          id: 'shutter',
          type: 'action-relay',
          position: { x: 1020, y: 120 },
          data: {
            definitionType: 'action-relay',
            label: 'Camera Shutter', // i18n-exempt
            category: 'actions',
            propertyValues: { relay_num: 0, state: 1 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'speed', target: 'moving_check', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e2', source: 'min_speed', target: 'moving_check', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'moving_check', target: 'timer', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e4', source: 'timer', target: 'shutter', sourceHandle: 'flow', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  },

  // ─── Terrain Follow ───────────────────────────────────────────
  {
    id: 'terrain-follow',
    name: 'Terrain Follow', // i18n-exempt
    description: 'Warn when rangefinder reading is outside the safe range for terrain following.', // i18n-exempt
    category: 'Navigation',
    graph: {
      version: 1,
      name: 'Terrain Follow', // i18n-exempt
      description: 'Monitor rangefinder for safe terrain-following altitude', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read distance to ground from rangefinder' }, // i18n-exempt
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 370, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Is altitude within safe 3-50m range?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_invert',
          type: 'flow-comment',
          position: { x: 670, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Invert: trigger when OUT of range' }, // i18n-exempt
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 940, y: 30 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 4', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Send urgent terrain warning' }, // i18n-exempt
          },
        },
        // ── Data flow ──
        {
          id: 'rangefinder',
          type: 'sensor-rangefinder',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-rangefinder',
            label: 'Rangefinder', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'range_check',
          type: 'logic-range-check',
          position: { x: 390, y: 120 },
          data: {
            definitionType: 'logic-range-check',
            label: 'Safe Range?', // i18n-exempt
            category: 'logic',
            propertyValues: { min: 3, max: 50 },
          },
        },
        {
          id: 'invert',
          type: 'logic-not',
          position: { x: 690, y: 130 },
          data: {
            definitionType: 'logic-not',
            label: 'Out of Range?', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        {
          id: 'warning',
          type: 'action-gcs-text',
          position: { x: 960, y: 130 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Terrain Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'TERRAIN: Rangefinder out of safe range!', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'rangefinder', target: 'range_check', sourceHandle: 'distance_m', targetHandle: 'value' },
        { id: 'e2', source: 'range_check', target: 'invert', sourceHandle: 'in_range', targetHandle: 'input' },
        { id: 'e3', source: 'invert', target: 'warning', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Depth Logger ────────────────────────────────────────────
  {
    id: 'depth-logger',
    name: 'Depth Logger', // i18n-exempt
    description: 'Log rangefinder depth + GPS position to a CSV file, triggered by an RC aux switch.', // i18n-exempt
    category: 'Data Logging', // i18n-exempt
    graph: {
      version: 1,
      name: 'Depth Logger', // i18n-exempt
      description: 'Log rangefinder depth and GPS position to file on switch trigger', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_trigger',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Trigger', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Detect when the pilot flips the aux switch HIGH' }, // i18n-exempt
          },
        },
        {
          id: 'comment_sensors',
          type: 'flow-comment',
          position: { x: 430, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Read Sensors', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Grab depth from rangefinder and GPS position' }, // i18n-exempt
          },
        },
        {
          id: 'comment_log',
          type: 'flow-comment',
          position: { x: 810, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Log & Notify', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Write to file and notify pilot' }, // i18n-exempt
          },
        },
        // ── Trigger chain ──
        {
          id: 'aux_switch',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'Depth Switch', // i18n-exempt
            category: 'sensors',
            propertyValues: { aux_fn: 300 },
          },
        },
        {
          id: 'edge_detect',
          type: 'timing-rising-edge',
          position: { x: 260, y: 120 },
          data: {
            definitionType: 'timing-rising-edge',
            label: 'Switch Flipped?', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        // ── Sensor column ──
        {
          id: 'rangefinder',
          type: 'sensor-rangefinder-orient',
          position: { x: 450, y: 110 },
          data: {
            definitionType: 'sensor-rangefinder-orient',
            label: 'Depth Sensor', // i18n-exempt
            category: 'sensors',
            propertyValues: { orientation: 25 },
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 450, y: 230 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        // ── Log & Notify ──
        {
          id: 'file_log',
          type: 'action-log-to-file',
          position: { x: 830, y: 100 },
          data: {
            definitionType: 'action-log-to-file',
            label: 'Write CSV', // i18n-exempt
            category: 'actions',
            propertyValues: { filename: 'depth_log.csv', separator: ';' },
          },
        },
        {
          id: 'notify',
          type: 'action-gcs-text',
          position: { x: 830, y: 300 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Notify Pilot', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Depth measurement logged', severity: 6 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'aux_switch', target: 'edge_detect', sourceHandle: 'is_high', targetHandle: 'input' },
        { id: 'e2', source: 'edge_detect', target: 'file_log', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e3', source: 'rangefinder', target: 'file_log', sourceHandle: 'distance_m', targetHandle: 'value1' },
        { id: 'e4', source: 'gps', target: 'file_log', sourceHandle: 'lat', targetHandle: 'value2' },
        { id: 'e5', source: 'gps', target: 'file_log', sourceHandle: 'lng', targetHandle: 'value3' },
        { id: 'e6', source: 'edge_detect', target: 'notify', sourceHandle: 'triggered', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Auto RTL on Low Battery ─────────────────────────────────
  {
    id: 'auto-rtl-battery',
    name: 'Auto RTL on Low Battery', // i18n-exempt
    description: 'Automatically switch to RTL flight mode when battery drops below a critical threshold.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Auto RTL on Low Battery', // i18n-exempt
      description: 'Switch to RTL when battery is critically low', // i18n-exempt
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Monitor battery remaining percentage' }, // i18n-exempt
          },
        },
        {
          id: 'comment_decide',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Is battery below critical level?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_act',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Force return-to-launch and warn pilot' }, // i18n-exempt
          },
        },
        {
          id: 'battery',
          type: 'sensor-battery',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'threshold',
          type: 'var-constant',
          position: { x: 200, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Critical % (20)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '20' },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 420, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Below 20%?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '<' },
          },
        },
        {
          id: 'debounce',
          type: 'timing-debounce',
          position: { x: 620, y: 115 },
          data: {
            definitionType: 'timing-debounce',
            label: 'Debounce 3s', // i18n-exempt
            category: 'timing',
            propertyValues: { delay_ms: 3000 },
          },
        },
        {
          id: 'set_rtl',
          type: 'action-set-mode',
          position: { x: 830, y: 100 },
          data: {
            definitionType: 'action-set-mode',
            label: 'Set RTL Mode', // i18n-exempt
            category: 'actions',
            propertyValues: { mode_num: 11 },
          },
        },
        {
          id: 'warn',
          type: 'action-gcs-text',
          position: { x: 830, y: 230 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Critical Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'CRITICAL: Battery low, RTL activated!', severity: 2 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'battery', target: 'compare', sourceHandle: 'remaining_pct', targetHandle: 'a' },
        { id: 'e2', source: 'threshold', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'debounce', sourceHandle: 'result', targetHandle: 'input' },
        { id: 'e4', source: 'debounce', target: 'set_rtl', sourceHandle: 'output', targetHandle: 'trigger' },
        { id: 'e5', source: 'debounce', target: 'warn', sourceHandle: 'output', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Payload Drop ────────────────────────────────────────────
  {
    id: 'payload-drop',
    name: 'Payload Drop', // i18n-exempt
    description: 'Release a servo-actuated payload when an RC aux switch is flipped to HIGH.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Payload Drop', // i18n-exempt
      description: 'Servo-actuated payload release via RC aux switch', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_trigger',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Trigger', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Pilot flips aux switch to release' }, // i18n-exempt
          },
        },
        {
          id: 'comment_branch',
          type: 'flow-comment',
          position: { x: 400, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Branch', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Switch HIGH = release, LOW = hold' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 730, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Actuate', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Move servo to release or hold position' }, // i18n-exempt
          },
        },
        {
          id: 'aux_switch',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'Drop Switch', // i18n-exempt
            category: 'sensors',
            propertyValues: { aux_fn: 301 },
          },
        },
        {
          id: 'branch',
          type: 'logic-if-else',
          position: { x: 420, y: 120 },
          data: {
            definitionType: 'logic-if-else',
            label: 'Switch HIGH?', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        // TRUE path — release
        {
          id: 'release_pwm',
          type: 'var-constant',
          position: { x: 600, y: 40 },
          data: {
            definitionType: 'var-constant',
            label: 'Release PWM', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1100' },
          },
        },
        {
          id: 'release_servo',
          type: 'action-set-servo',
          position: { x: 750, y: 100 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Release Payload', // i18n-exempt
            category: 'actions',
            propertyValues: { servo_num: 10 },
          },
        },
        {
          id: 'release_msg',
          type: 'action-gcs-text',
          position: { x: 980, y: 105 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Drop Confirmed', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'PAYLOAD RELEASED', severity: 5 }, // i18n-exempt
          },
        },
        // FALSE path — hold
        {
          id: 'hold_pwm',
          type: 'var-constant',
          position: { x: 600, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Hold PWM', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1900' },
          },
        },
        {
          id: 'hold_servo',
          type: 'action-set-servo',
          position: { x: 750, y: 310 },
          data: {
            definitionType: 'action-set-servo',
            label: 'Hold Payload', // i18n-exempt
            category: 'actions',
            propertyValues: { servo_num: 10 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'aux_switch', target: 'branch', sourceHandle: 'is_high', targetHandle: 'condition' },
        // TRUE → release
        { id: 'e2', source: 'branch', target: 'release_servo', sourceHandle: 'true_out', targetHandle: 'trigger' },
        { id: 'e3', source: 'release_pwm', target: 'release_servo', sourceHandle: 'value', targetHandle: 'pwm' },
        { id: 'e4', source: 'branch', target: 'release_msg', sourceHandle: 'true_out', targetHandle: 'trigger' },
        // FALSE → hold
        { id: 'e5', source: 'branch', target: 'hold_servo', sourceHandle: 'false_out', targetHandle: 'trigger' },
        { id: 'e6', source: 'hold_pwm', target: 'hold_servo', sourceHandle: 'value', targetHandle: 'pwm' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Speed Limit Warning ─────────────────────────────────────
  {
    id: 'speed-limit-warning',
    name: 'Speed Limit Warning', // i18n-exempt
    description: 'Send periodic GCS warnings when ground speed exceeds a configurable limit.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Speed Limit Warning', // i18n-exempt
      description: 'Warn pilot when ground speed exceeds limit', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read current ground speed' }, // i18n-exempt
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Compare against speed limit' }, // i18n-exempt
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 700, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Rate-limited warning to GCS' }, // i18n-exempt
          },
        },
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'limit',
          type: 'var-constant',
          position: { x: 160, y: 270 },
          data: {
            definitionType: 'var-constant',
            label: 'Speed Limit (m/s)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '25' },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 400, y: 115 },
          data: {
            definitionType: 'logic-compare',
            label: 'Over Limit?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'rate_limit',
          type: 'timing-run-every',
          position: { x: 600, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 5s', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 5000 },
          },
        },
        {
          id: 'warning',
          type: 'action-gcs-text',
          position: { x: 820, y: 120 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Speed Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'WARNING: Speed limit exceeded!', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'speed', target: 'compare', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e2', source: 'limit', target: 'compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'compare', target: 'rate_limit', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e4', source: 'rate_limit', target: 'warning', sourceHandle: 'flow', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Flight Data Logger ──────────────────────────────────────
  {
    id: 'flight-data-logger',
    name: 'Flight Data Logger', // i18n-exempt
    description: 'Periodically log GPS position, altitude, and speed to a CSV file on the SD card.', // i18n-exempt
    category: 'Data Logging', // i18n-exempt
    graph: {
      version: 1,
      name: 'Flight Data Logger', // i18n-exempt
      description: 'Periodic GPS + altitude + speed logging to CSV', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Timing', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Log a data point every 2 seconds' }, // i18n-exempt
          },
        },
        {
          id: 'comment_data',
          type: 'flow-comment',
          position: { x: 370, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Data Sources', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read GPS, altitude, and speed' }, // i18n-exempt
          },
        },
        {
          id: 'comment_log',
          type: 'flow-comment',
          position: { x: 740, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Storage', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Append to CSV file on SD card' }, // i18n-exempt
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 2s', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 2000 },
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 390, y: 110 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'speed',
          type: 'sensor-groundspeed',
          position: { x: 390, y: 260 },
          data: {
            definitionType: 'sensor-groundspeed',
            label: 'Ground Speed', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'log_gps',
          type: 'action-log-to-file',
          position: { x: 760, y: 110 },
          data: {
            definitionType: 'action-log-to-file',
            label: 'Log Position', // i18n-exempt
            category: 'actions',
            propertyValues: { filename: 'flight_log.csv', separator: ',' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'timer', target: 'log_gps', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e2', source: 'gps', target: 'log_gps', sourceHandle: 'lat', targetHandle: 'value1' },
        { id: 'e3', source: 'gps', target: 'log_gps', sourceHandle: 'lng', targetHandle: 'value2' },
        { id: 'e4', source: 'speed', target: 'log_gps', sourceHandle: 'speed_ms', targetHandle: 'value3' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Wind Speed Failsafe ─────────────────────────────────────
  // Inspired by: ArduPilot plane-wind-failsafe.lua
  {
    id: 'wind-speed-failsafe',
    name: 'Wind Speed Failsafe', // i18n-exempt
    description: 'Warn when wind exceeds a threshold, force RTL if it gets critical. Based on ArduPilot plane-wind-failsafe.lua.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Wind Speed Failsafe', // i18n-exempt
      description: 'Wind speed warning + RTL failsafe for planes', // i18n-exempt
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Sense', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read estimated wind speed' }, // i18n-exempt
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Warning', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Warn pilot at 10 m/s' }, // i18n-exempt
          },
        },
        {
          id: 'comment_failsafe',
          type: 'flow-comment',
          position: { x: 380, y: 250 },
          data: {
            definitionType: 'flow-comment',
            label: 'Failsafe', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Force RTL at 15 m/s' }, // i18n-exempt
          },
        },
        {
          id: 'wind',
          type: 'sensor-wind',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-wind',
            label: 'Wind Estimate', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'warn_threshold',
          type: 'var-constant',
          position: { x: 200, y: 200 },
          data: {
            definitionType: 'var-constant',
            label: 'Warn (m/s)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '10' },
          },
        },
        {
          id: 'warn_compare',
          type: 'logic-compare',
          position: { x: 400, y: 110 },
          data: {
            definitionType: 'logic-compare',
            label: 'Wind > 10?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'warn_msg',
          type: 'action-gcs-text',
          position: { x: 680, y: 100 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Wind Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Wind warning: speed exceeding limit', severity: 4 }, // i18n-exempt
          },
        },
        {
          id: 'fs_threshold',
          type: 'var-constant',
          position: { x: 200, y: 410 },
          data: {
            definitionType: 'var-constant',
            label: 'Failsafe (m/s)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '15' },
          },
        },
        {
          id: 'fs_compare',
          type: 'logic-compare',
          position: { x: 400, y: 330 },
          data: {
            definitionType: 'logic-compare',
            label: 'Wind > 15?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'fs_debounce',
          type: 'timing-debounce',
          position: { x: 600, y: 330 },
          data: {
            definitionType: 'timing-debounce',
            label: 'Debounce 5s', // i18n-exempt
            category: 'timing',
            propertyValues: { delay_ms: 5000 },
          },
        },
        {
          id: 'set_rtl',
          type: 'action-set-mode',
          position: { x: 830, y: 310 },
          data: {
            definitionType: 'action-set-mode',
            label: 'Set RTL', // i18n-exempt
            category: 'actions',
            propertyValues: { mode_num: 11 },
          },
        },
        {
          id: 'fs_msg',
          type: 'action-gcs-text',
          position: { x: 830, y: 430 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Wind Failsafe', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'WIND FAILSAFE: RTL activated!', severity: 0 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'wind', target: 'warn_compare', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e2', source: 'warn_threshold', target: 'warn_compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e3', source: 'warn_compare', target: 'warn_msg', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e4', source: 'wind', target: 'fs_compare', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e5', source: 'fs_threshold', target: 'fs_compare', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e6', source: 'fs_compare', target: 'fs_debounce', sourceHandle: 'result', targetHandle: 'input' },
        { id: 'e7', source: 'fs_debounce', target: 'set_rtl', sourceHandle: 'output', targetHandle: 'trigger' },
        { id: 'e8', source: 'fs_debounce', target: 'fs_msg', sourceHandle: 'output', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.8 },
    },
  },

  // ─── Camera on Arm ─────────────────────────────────────────
  // Inspired by: ArduPilot runcam_on_arm.lua
  {
    id: 'camera-on-arm',
    name: 'Camera on Arm/Disarm', // i18n-exempt
    description: 'Notify when vehicle arms or disarms. Extend with relay/servo to auto-start camera recording. Based on ArduPilot runcam_on_arm.lua.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Camera on Arm/Disarm', // i18n-exempt
      description: 'Notify on arm/disarm transitions with buzzer alerts', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Monitor arm/disarm state' }, // i18n-exempt
          },
        },
        {
          id: 'comment_detect',
          type: 'flow-comment',
          position: { x: 340, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Detect arm and disarm transitions' }, // i18n-exempt
          },
        },
        {
          id: 'comment_act',
          type: 'flow-comment',
          position: { x: 680, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Alert pilot and play tunes' }, // i18n-exempt
          },
        },
        {
          id: 'armed',
          type: 'sensor-armed',
          position: { x: 60, y: 130 },
          data: {
            definitionType: 'sensor-armed',
            label: 'Armed State', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'rising',
          type: 'timing-rising-edge',
          position: { x: 340, y: 100 },
          data: {
            definitionType: 'timing-rising-edge',
            label: 'Just Armed?', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'falling',
          type: 'timing-falling-edge',
          position: { x: 340, y: 260 },
          data: {
            definitionType: 'timing-falling-edge',
            label: 'Just Disarmed?', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'arm_msg',
          type: 'action-gcs-text',
          position: { x: 600, y: 80 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Armed Alert', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Camera recording started', severity: 6 }, // i18n-exempt
          },
        },
        {
          id: 'arm_tune',
          type: 'action-play-tune',
          position: { x: 850, y: 80 },
          data: {
            definitionType: 'action-play-tune',
            label: 'Arm Beep', // i18n-exempt
            category: 'actions',
            propertyValues: { tune: 'MFT200L4O5CEG' },
          },
        },
        {
          id: 'disarm_msg',
          type: 'action-gcs-text',
          position: { x: 600, y: 240 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Disarmed Alert', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Camera recording stopped', severity: 6 }, // i18n-exempt
          },
        },
        {
          id: 'disarm_tune',
          type: 'action-play-tune',
          position: { x: 850, y: 240 },
          data: {
            definitionType: 'action-play-tune',
            label: 'Disarm Beep', // i18n-exempt
            category: 'actions',
            propertyValues: { tune: 'MFT200L4O5GEC' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'armed', target: 'rising', sourceHandle: 'is_armed', targetHandle: 'input' },
        { id: 'e2', source: 'armed', target: 'falling', sourceHandle: 'is_armed', targetHandle: 'input' },
        { id: 'e3', source: 'rising', target: 'arm_msg', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e4', source: 'rising', target: 'arm_tune', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e5', source: 'falling', target: 'disarm_msg', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e6', source: 'falling', target: 'disarm_tune', sourceHandle: 'triggered', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── GPS Satellite Monitor ─────────────────────────────────
  {
    id: 'gps-satellite-monitor',
    name: 'GPS Satellite Monitor',
    description: 'Warn the pilot with a buzzer alert when GPS fix degrades below 3D fix quality.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'GPS Satellite Monitor',
      description: 'Alert when GPS fix is lost or degraded', // i18n-exempt
      runIntervalMs: 1000,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read GPS fix status' }, // i18n-exempt
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 370, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Only alert when fix is lost while armed' }, // i18n-exempt
          },
        },
        {
          id: 'comment_act',
          type: 'flow-comment',
          position: { x: 730, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Warn pilot with message and buzzer' }, // i18n-exempt
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps-status',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-gps-status',
            label: 'GPS Status', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'armed',
          type: 'sensor-armed',
          position: { x: 60, y: 280 },
          data: {
            definitionType: 'sensor-armed',
            label: 'Armed?', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'no_fix',
          type: 'logic-not',
          position: { x: 320, y: 110 },
          data: {
            definitionType: 'logic-not',
            label: 'No 3D Fix?', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        {
          id: 'gate',
          type: 'logic-and',
          position: { x: 520, y: 150 },
          data: {
            definitionType: 'logic-and',
            label: 'Armed + No Fix', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        {
          id: 'warn_msg',
          type: 'action-gcs-text',
          position: { x: 750, y: 100 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'GPS Warning', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'WARNING: GPS 3D fix lost!', severity: 2 }, // i18n-exempt
          },
        },
        {
          id: 'warn_tune',
          type: 'action-play-tune',
          position: { x: 750, y: 240 },
          data: {
            definitionType: 'action-play-tune',
            label: 'Alert Buzzer', // i18n-exempt
            category: 'actions',
            propertyValues: { tune: 'MFT100L8O5CDCD' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'gps', target: 'no_fix', sourceHandle: 'has_3d_fix', targetHandle: 'input' },
        { id: 'e2', source: 'no_fix', target: 'gate', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e3', source: 'armed', target: 'gate', sourceHandle: 'is_armed', targetHandle: 'b' },
        { id: 'e4', source: 'gate', target: 'warn_msg', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e5', source: 'gate', target: 'warn_tune', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Flight Mode Logger ────────────────────────────────────
  {
    id: 'flight-mode-logger',
    name: 'Flight Mode Change Logger', // i18n-exempt
    description: 'Log every flight mode change to a file and announce it via GCS message.', // i18n-exempt
    category: 'Data Logging', // i18n-exempt
    graph: {
      version: 1,
      name: 'Flight Mode Change Logger', // i18n-exempt
      description: 'Track and log all flight mode transitions', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read the current flight mode number' }, // i18n-exempt
          },
        },
        {
          id: 'comment_detect',
          type: 'flow-comment',
          position: { x: 360, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Only act when the mode changes' }, // i18n-exempt
          },
        },
        {
          id: 'comment_log',
          type: 'flow-comment',
          position: { x: 680, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Log to file and notify pilot' }, // i18n-exempt
          },
        },
        {
          id: 'mode',
          type: 'sensor-flight-mode',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-flight-mode',
            label: 'Flight Mode', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'on_change',
          type: 'timing-on-change',
          position: { x: 360, y: 125 },
          data: {
            definitionType: 'timing-on-change',
            label: 'Mode Changed?', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 360, y: 260 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'announce',
          type: 'action-gcs-text',
          position: { x: 700, y: 100 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Mode Changed', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'Flight mode changed', severity: 6 }, // i18n-exempt
          },
        },
        {
          id: 'log',
          type: 'action-log-to-file',
          position: { x: 700, y: 240 },
          data: {
            definitionType: 'action-log-to-file',
            label: 'Log Mode Change', // i18n-exempt
            category: 'actions',
            propertyValues: { filename: 'mode_log.csv', separator: ',' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'mode', target: 'on_change', sourceHandle: 'mode_num', targetHandle: 'value' },
        { id: 'e2', source: 'on_change', target: 'announce', sourceHandle: 'changed', targetHandle: 'trigger' },
        { id: 'e3', source: 'on_change', target: 'log', sourceHandle: 'changed', targetHandle: 'trigger' },
        { id: 'e4', source: 'mode', target: 'log', sourceHandle: 'mode_num', targetHandle: 'value1' },
        { id: 'e5', source: 'gps', target: 'log', sourceHandle: 'lat', targetHandle: 'value2' },
        { id: 'e6', source: 'gps', target: 'log', sourceHandle: 'lng', targetHandle: 'value3' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── LED Brightness Switch ─────────────────────────────────
  // Inspired by: ArduPilot leds_on_a_switch.lua
  {
    id: 'led-brightness-switch',
    name: 'LED Brightness Switch',
    description: 'Control LED brightness with a 3-position aux switch (Off / Dim / Bright). Based on ArduPilot leds_on_a_switch.lua.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'LED Brightness Switch',
      description: '3-position aux switch for LED brightness control', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read aux switch (Low / Mid / High)' }, // i18n-exempt
          },
        },
        {
          id: 'comment_route',
          type: 'flow-comment',
          position: { x: 380, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Route to the correct brightness level' }, // i18n-exempt
          },
        },
        {
          id: 'comment_act',
          type: 'flow-comment',
          position: { x: 700, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Set NTF_LED_BRIGHT parameter' }, // i18n-exempt
          },
        },
        {
          id: 'aux_switch',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 120 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'LED Switch', // i18n-exempt
            category: 'sensors',
            propertyValues: { aux_fn: 300 },
          },
        },
        {
          id: 'val_off',
          type: 'var-constant',
          position: { x: 530, y: 80 },
          data: {
            definitionType: 'var-constant',
            label: 'Off (0)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '0' },
          },
        },
        {
          id: 'set_off',
          type: 'action-set-param',
          position: { x: 720, y: 80 },
          data: {
            definitionType: 'action-set-param',
            label: 'LEDs Off', // i18n-exempt
            category: 'actions',
            propertyValues: { param_name: 'NTF_LED_BRIGHT' },
          },
        },
        {
          id: 'val_dim',
          type: 'var-constant',
          position: { x: 530, y: 220 },
          data: {
            definitionType: 'var-constant',
            label: 'Dim (1)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1' },
          },
        },
        {
          id: 'set_dim',
          type: 'action-set-param',
          position: { x: 720, y: 220 },
          data: {
            definitionType: 'action-set-param',
            label: 'LEDs Dim', // i18n-exempt
            category: 'actions',
            propertyValues: { param_name: 'NTF_LED_BRIGHT' },
          },
        },
        {
          id: 'val_bright',
          type: 'var-constant',
          position: { x: 530, y: 360 },
          data: {
            definitionType: 'var-constant',
            label: 'Bright (3)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '3' },
          },
        },
        {
          id: 'set_bright',
          type: 'action-set-param',
          position: { x: 720, y: 360 },
          data: {
            definitionType: 'action-set-param',
            label: 'LEDs Bright', // i18n-exempt
            category: 'actions',
            propertyValues: { param_name: 'NTF_LED_BRIGHT' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'aux_switch', target: 'set_off', sourceHandle: 'is_low', targetHandle: 'trigger' },
        { id: 'e2', source: 'val_off', target: 'set_off', sourceHandle: 'value', targetHandle: 'value' },
        { id: 'e3', source: 'aux_switch', target: 'set_dim', sourceHandle: 'is_mid', targetHandle: 'trigger' },
        { id: 'e4', source: 'val_dim', target: 'set_dim', sourceHandle: 'value', targetHandle: 'value' },
        { id: 'e5', source: 'aux_switch', target: 'set_bright', sourceHandle: 'is_high', targetHandle: 'trigger' },
        { id: 'e6', source: 'val_bright', target: 'set_bright', sourceHandle: 'value', targetHandle: 'value' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },

  // ─── Aerial Survey Automation ────────────────────────────────
  // Complex: 19 functional nodes + 4 comments = 23 total
  {
    id: 'aerial-survey',
    name: 'Aerial Survey Automation', // i18n-exempt
    description: 'Auto-trigger camera at timed intervals when all survey conditions are met: armed, in AUTO mode, moving, and at correct altitude. Logs GPS coordinates for each photo.', // i18n-exempt
    category: 'Automation',
    graph: {
      version: 1,
      name: 'Aerial Survey Automation', // i18n-exempt
      description: 'Camera trigger + GPS logging for automated aerial survey missions', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage comments ──
        {
          id: 'c1', type: 'flow-comment', position: { x: 40, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Sensors', category: 'flow', propertyValues: { text: 'Read vehicle state: arm, mode, speed, altitude, GPS' } }, // i18n-exempt
        },
        {
          id: 'c2', type: 'flow-comment', position: { x: 400, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Conditions', category: 'flow', propertyValues: { text: 'Check: correct mode, moving, at survey altitude' } }, // i18n-exempt
        },
        {
          id: 'c3', type: 'flow-comment', position: { x: 800, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Gate', category: 'flow', propertyValues: { text: 'All 4 conditions must pass before triggering' } }, // i18n-exempt
        },
        {
          id: 'c4', type: 'flow-comment', position: { x: 1200, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Actions', category: 'flow', propertyValues: { text: 'Trigger camera, log GPS + alt, notify pilot' } }, // i18n-exempt
        },
        // ── Sensors ──
        {
          id: 'armed', type: 'sensor-armed', position: { x: 60, y: 120 },
          data: { definitionType: 'sensor-armed', label: 'Armed State', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'mode', type: 'sensor-flight-mode', position: { x: 60, y: 260 },
          data: { definitionType: 'sensor-flight-mode', label: 'Flight Mode', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'speed', type: 'sensor-groundspeed', position: { x: 60, y: 400 },
          data: { definitionType: 'sensor-groundspeed', label: 'Ground Speed', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'altitude', type: 'sensor-baro-alt', position: { x: 60, y: 540 },
          data: { definitionType: 'sensor-baro-alt', label: 'Altitude', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gps', type: 'sensor-gps', position: { x: 60, y: 680 },
          data: { definitionType: 'sensor-gps', label: 'GPS Position', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        // ── Constants ──
        {
          id: 'auto_mode_val', type: 'var-constant', position: { x: 240, y: 330 },
          data: { definitionType: 'var-constant', label: 'AUTO Mode (10)', category: 'variables', propertyValues: { type: 'number', value: '10' } }, // i18n-exempt
        },
        {
          id: 'min_speed_val', type: 'var-constant', position: { x: 240, y: 470 },
          data: { definitionType: 'var-constant', label: 'Min Speed (m/s)', category: 'variables', propertyValues: { type: 'number', value: '2' } }, // i18n-exempt
        },
        // ── Edge detect on arm ──
        {
          id: 'arm_edge', type: 'timing-rising-edge', position: { x: 420, y: 120 },
          data: { definitionType: 'timing-rising-edge', label: 'Just Armed?', category: 'timing', propertyValues: {} }, // i18n-exempt
        },
        // ── Logic checks ──
        {
          id: 'mode_check', type: 'logic-compare', position: { x: 420, y: 260 },
          data: { definitionType: 'logic-compare', label: 'In AUTO?', category: 'logic', propertyValues: { operator: '==' } }, // i18n-exempt
        },
        {
          id: 'speed_check', type: 'logic-compare', position: { x: 420, y: 400 },
          data: { definitionType: 'logic-compare', label: 'Moving?', category: 'logic', propertyValues: { operator: '>' } }, // i18n-exempt
        },
        {
          id: 'alt_check', type: 'logic-range-check', position: { x: 420, y: 540 },
          data: { definitionType: 'logic-range-check', label: 'At Survey Alt?', category: 'logic', propertyValues: { min: 30, max: 120 } }, // i18n-exempt
        },
        // ── AND gates (chain 4 conditions) ──
        {
          id: 'gate1', type: 'logic-and', position: { x: 680, y: 180 },
          data: { definitionType: 'logic-and', label: 'Armed + AUTO', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gate2', type: 'logic-and', position: { x: 680, y: 440 },
          data: { definitionType: 'logic-and', label: 'Moving + Alt OK', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gate3', type: 'logic-and', position: { x: 900, y: 300 },
          data: { definitionType: 'logic-and', label: 'All Conditions', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        // ── Camera timer ──
        {
          id: 'camera_timer', type: 'timing-run-every', position: { x: 1100, y: 300 },
          data: { definitionType: 'timing-run-every', label: 'Every 3 sec', category: 'timing', propertyValues: { interval_ms: 3000 } }, // i18n-exempt
        },
        // ── Actions ──
        {
          id: 'start_msg', type: 'action-gcs-text', position: { x: 680, y: 80 },
          data: { definitionType: 'action-gcs-text', label: 'Survey Ready', category: 'actions', propertyValues: { message: 'Survey mode active - camera armed', severity: 5 } }, // i18n-exempt
        },
        {
          id: 'camera_relay', type: 'action-relay', position: { x: 1300, y: 200 },
          data: { definitionType: 'action-relay', label: 'Camera Shutter', category: 'actions', propertyValues: { relay_num: 0, state: 1 } }, // i18n-exempt
        },
        {
          id: 'photo_msg', type: 'action-gcs-text', position: { x: 1300, y: 350 },
          data: { definitionType: 'action-gcs-text', label: 'Photo Taken', category: 'actions', propertyValues: { message: 'Photo captured', severity: 6 } }, // i18n-exempt
        },
        {
          id: 'log_photo', type: 'action-log-to-file', position: { x: 1300, y: 500 },
          data: { definitionType: 'action-log-to-file', label: 'Log GPS + Alt', category: 'actions', propertyValues: { filename: 'survey_log.csv', separator: ',' } }, // i18n-exempt
        },
      ],
      edges: [
        // Armed → edge detect + gate
        { id: 'e1', source: 'armed', target: 'arm_edge', sourceHandle: 'is_armed', targetHandle: 'input' },
        { id: 'e2', source: 'armed', target: 'gate1', sourceHandle: 'is_armed', targetHandle: 'a' },
        { id: 'e3', source: 'arm_edge', target: 'start_msg', sourceHandle: 'triggered', targetHandle: 'trigger' },
        // Mode check → gate1
        { id: 'e4', source: 'mode', target: 'mode_check', sourceHandle: 'mode_num', targetHandle: 'a' },
        { id: 'e5', source: 'auto_mode_val', target: 'mode_check', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e6', source: 'mode_check', target: 'gate1', sourceHandle: 'result', targetHandle: 'b' },
        // Speed check → gate2
        { id: 'e7', source: 'speed', target: 'speed_check', sourceHandle: 'speed_ms', targetHandle: 'a' },
        { id: 'e8', source: 'min_speed_val', target: 'speed_check', sourceHandle: 'value', targetHandle: 'b' },
        { id: 'e9', source: 'speed_check', target: 'gate2', sourceHandle: 'result', targetHandle: 'a' },
        // Alt check → gate2
        { id: 'e10', source: 'altitude', target: 'alt_check', sourceHandle: 'alt_m', targetHandle: 'value' },
        { id: 'e11', source: 'alt_check', target: 'gate2', sourceHandle: 'in_range', targetHandle: 'b' },
        // Gates → master → timer
        { id: 'e12', source: 'gate1', target: 'gate3', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e13', source: 'gate2', target: 'gate3', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e14', source: 'gate3', target: 'camera_timer', sourceHandle: 'result', targetHandle: 'trigger' },
        // Timer → actions
        { id: 'e15', source: 'camera_timer', target: 'camera_relay', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e16', source: 'camera_timer', target: 'photo_msg', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e17', source: 'camera_timer', target: 'log_photo', sourceHandle: 'flow', targetHandle: 'trigger' },
        // GPS + altitude data → log
        { id: 'e18', source: 'gps', target: 'log_photo', sourceHandle: 'lat', targetHandle: 'value1' },
        { id: 'e19', source: 'gps', target: 'log_photo', sourceHandle: 'lng', targetHandle: 'value2' },
        { id: 'e20', source: 'altitude', target: 'log_photo', sourceHandle: 'alt_m', targetHandle: 'value3' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.65 },
    },
  },

  // ─── Gimbal Stabilizer ───────────────────────────────────────
  // Complex: 16 functional nodes + 4 comments = 20 total
  {
    id: 'gimbal-stabilizer',
    name: 'Gimbal Stabilizer', // i18n-exempt
    description: 'Two-axis camera gimbal stabilization using RC input with attitude compensation. Subtracts vehicle pitch/roll from operator stick input for smooth, stabilized servo output.', // i18n-exempt
    category: 'Configuration',
    graph: {
      version: 1,
      name: 'Gimbal Stabilizer', // i18n-exempt
      description: 'Two-axis servo gimbal with RC control and attitude stabilization', // i18n-exempt
      runIntervalMs: 50,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage comments ──
        {
          id: 'c1', type: 'flow-comment', position: { x: 40, y: 20 },
          data: { definitionType: 'flow-comment', label: 'RC Inputs', category: 'flow', propertyValues: { text: 'Read RC gimbal sticks + vehicle attitude' } }, // i18n-exempt
        },
        {
          id: 'c2', type: 'flow-comment', position: { x: 280, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Normalize', category: 'flow', propertyValues: { text: 'Map RC PWM (1000-2000) to angle (-45..45)' } }, // i18n-exempt
        },
        {
          id: 'c3', type: 'flow-comment', position: { x: 520, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Stabilize', category: 'flow', propertyValues: { text: 'Subtract vehicle tilt for stabilization' } }, // i18n-exempt
        },
        {
          id: 'c4', type: 'flow-comment', position: { x: 960, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Output', category: 'flow', propertyValues: { text: 'Clamp, convert to PWM, drive servos' } }, // i18n-exempt
        },
        // ── Sensors ──
        {
          id: 'rc_tilt', type: 'sensor-rc-channel', position: { x: 60, y: 120 },
          data: { definitionType: 'sensor-rc-channel', label: 'Tilt Stick (CH6)', category: 'sensors', propertyValues: { channel: 6 } }, // i18n-exempt
        },
        {
          id: 'rc_pan', type: 'sensor-rc-channel', position: { x: 60, y: 280 },
          data: { definitionType: 'sensor-rc-channel', label: 'Pan Stick (CH7)', category: 'sensors', propertyValues: { channel: 7 } }, // i18n-exempt
        },
        {
          id: 'attitude', type: 'sensor-attitude', position: { x: 60, y: 440 },
          data: { definitionType: 'sensor-attitude', label: 'Vehicle Attitude', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'aux', type: 'sensor-rc-aux-switch', position: { x: 60, y: 620 },
          data: { definitionType: 'sensor-rc-aux-switch', label: 'Stabilize Switch', category: 'sensors', propertyValues: { aux_fn: 300 } }, // i18n-exempt
        },
        // ── Map RC to angle ──
        {
          id: 'map_tilt', type: 'math-map-range', position: { x: 300, y: 120 },
          data: { definitionType: 'math-map-range', label: 'RC to Tilt Angle', category: 'math', propertyValues: { in_min: 1000, in_max: 2000, out_min: -45, out_max: 45 } }, // i18n-exempt
        },
        {
          id: 'map_pan', type: 'math-map-range', position: { x: 300, y: 280 },
          data: { definitionType: 'math-map-range', label: 'RC to Pan Angle', category: 'math', propertyValues: { in_min: 1000, in_max: 2000, out_min: -45, out_max: 45 } }, // i18n-exempt
        },
        // ── Subtract attitude (stabilization) ──
        {
          id: 'stab_tilt', type: 'math-subtract', position: { x: 540, y: 160 },
          data: { definitionType: 'math-subtract', label: 'Tilt - Pitch', category: 'math', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'stab_pan', type: 'math-subtract', position: { x: 540, y: 320 },
          data: { definitionType: 'math-subtract', label: 'Pan - Roll', category: 'math', propertyValues: {} }, // i18n-exempt
        },
        // ── Clamp to safe travel ──
        {
          id: 'clamp_tilt', type: 'math-clamp', position: { x: 760, y: 160 },
          data: { definitionType: 'math-clamp', label: 'Clamp Tilt', category: 'math', propertyValues: { min: -60, max: 60 } }, // i18n-exempt
        },
        {
          id: 'clamp_pan', type: 'math-clamp', position: { x: 760, y: 320 },
          data: { definitionType: 'math-clamp', label: 'Clamp Pan', category: 'math', propertyValues: { min: -60, max: 60 } }, // i18n-exempt
        },
        // ── Map angle to servo PWM ──
        {
          id: 'tilt_pwm', type: 'math-map-range', position: { x: 980, y: 160 },
          data: { definitionType: 'math-map-range', label: 'Tilt to PWM', category: 'math', propertyValues: { in_min: -60, in_max: 60, out_min: 1000, out_max: 2000 } }, // i18n-exempt
        },
        {
          id: 'pan_pwm', type: 'math-map-range', position: { x: 980, y: 320 },
          data: { definitionType: 'math-map-range', label: 'Pan to PWM', category: 'math', propertyValues: { in_min: -60, in_max: 60, out_min: 1000, out_max: 2000 } }, // i18n-exempt
        },
        // ── Servo outputs ──
        {
          id: 'servo_tilt', type: 'action-set-servo', position: { x: 1220, y: 160 },
          data: { definitionType: 'action-set-servo', label: 'Tilt Servo (S7)', category: 'actions', propertyValues: { servo_num: 7 } }, // i18n-exempt
        },
        {
          id: 'servo_pan', type: 'action-set-servo', position: { x: 1220, y: 320 },
          data: { definitionType: 'action-set-servo', label: 'Pan Servo (S8)', category: 'actions', propertyValues: { servo_num: 8 } }, // i18n-exempt
        },
        // ── Enable notification ──
        {
          id: 'aux_edge', type: 'timing-rising-edge', position: { x: 300, y: 620 },
          data: { definitionType: 'timing-rising-edge', label: 'Switch ON?', category: 'timing', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'enable_msg', type: 'action-gcs-text', position: { x: 540, y: 620 },
          data: { definitionType: 'action-gcs-text', label: 'Stab Enabled', category: 'actions', propertyValues: { message: 'Gimbal stabilization enabled', severity: 6 } }, // i18n-exempt
        },
      ],
      edges: [
        // RC → Map to angle
        { id: 'e1', source: 'rc_tilt', target: 'map_tilt', sourceHandle: 'value_us', targetHandle: 'value' },
        { id: 'e2', source: 'rc_pan', target: 'map_pan', sourceHandle: 'value_us', targetHandle: 'value' },
        // Map → Subtract (A = operator input, B = attitude to remove)
        { id: 'e3', source: 'map_tilt', target: 'stab_tilt', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e4', source: 'map_pan', target: 'stab_pan', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e5', source: 'attitude', target: 'stab_tilt', sourceHandle: 'pitch', targetHandle: 'b' },
        { id: 'e6', source: 'attitude', target: 'stab_pan', sourceHandle: 'roll', targetHandle: 'b' },
        // Subtract → Clamp
        { id: 'e7', source: 'stab_tilt', target: 'clamp_tilt', sourceHandle: 'result', targetHandle: 'value' },
        { id: 'e8', source: 'stab_pan', target: 'clamp_pan', sourceHandle: 'result', targetHandle: 'value' },
        // Clamp → PWM mapping
        { id: 'e9', source: 'clamp_tilt', target: 'tilt_pwm', sourceHandle: 'result', targetHandle: 'value' },
        { id: 'e10', source: 'clamp_pan', target: 'pan_pwm', sourceHandle: 'result', targetHandle: 'value' },
        // PWM → Servo
        { id: 'e11', source: 'tilt_pwm', target: 'servo_tilt', sourceHandle: 'result', targetHandle: 'pwm' },
        { id: 'e12', source: 'pan_pwm', target: 'servo_pan', sourceHandle: 'result', targetHandle: 'pwm' },
        // Aux switch enables both servos
        { id: 'e13', source: 'aux', target: 'servo_tilt', sourceHandle: 'is_high', targetHandle: 'trigger' },
        { id: 'e14', source: 'aux', target: 'servo_pan', sourceHandle: 'is_high', targetHandle: 'trigger' },
        // Aux → edge detect → GCS message
        { id: 'e15', source: 'aux', target: 'aux_edge', sourceHandle: 'is_high', targetHandle: 'input' },
        { id: 'e16', source: 'aux_edge', target: 'enable_msg', sourceHandle: 'triggered', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.7 },
    },
  },

  // ─── Attitude-Reactive LED Display ──────────────────────────
  // Complex: 16 functional nodes + 4 comments = 20 total
  {
    id: 'attitude-led-display',
    name: 'Attitude LED Display', // i18n-exempt
    description: 'Drive NeoPixel LED colors based on vehicle attitude: roll controls red, pitch controls green, yaw controls blue. Enabled by aux switch, only when armed.', // i18n-exempt
    category: 'Creative',
    graph: {
      version: 1,
      name: 'Attitude LED Display', // i18n-exempt
      description: 'RGB LEDs react dynamically to vehicle attitude angles', // i18n-exempt
      runIntervalMs: 50,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage comments ──
        {
          id: 'c1', type: 'flow-comment', position: { x: 40, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Inputs', category: 'flow', propertyValues: { text: 'Read attitude angles, arm state, and enable switch' } }, // i18n-exempt
        },
        {
          id: 'c2', type: 'flow-comment', position: { x: 280, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Process', category: 'flow', propertyValues: { text: 'Abs value, then map angles to 0-255 color range' } }, // i18n-exempt
        },
        {
          id: 'c3', type: 'flow-comment', position: { x: 720, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Clamp', category: 'flow', propertyValues: { text: 'Limit to valid 0-255 for each color channel' } }, // i18n-exempt
        },
        {
          id: 'c4', type: 'flow-comment', position: { x: 980, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Output', category: 'flow', propertyValues: { text: 'Gate by armed + switch, output to LED strip' } }, // i18n-exempt
        },
        // ── Sensors ──
        {
          id: 'attitude', type: 'sensor-attitude', position: { x: 60, y: 160 },
          data: { definitionType: 'sensor-attitude', label: 'Attitude', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'armed', type: 'sensor-armed', position: { x: 60, y: 420 },
          data: { definitionType: 'sensor-armed', label: 'Armed?', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'aux', type: 'sensor-rc-aux-switch', position: { x: 60, y: 560 },
          data: { definitionType: 'sensor-rc-aux-switch', label: 'LED Switch', category: 'sensors', propertyValues: { aux_fn: 300 } }, // i18n-exempt
        },
        // ── Absolute value (roll and pitch can be negative) ──
        {
          id: 'abs_roll', type: 'math-abs', position: { x: 280, y: 120 },
          data: { definitionType: 'math-abs', label: '|Roll|', category: 'math', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'abs_pitch', type: 'math-abs', position: { x: 280, y: 280 },
          data: { definitionType: 'math-abs', label: '|Pitch|', category: 'math', propertyValues: {} }, // i18n-exempt
        },
        // ── Map to 0-255 color range ──
        {
          id: 'map_r', type: 'math-map-range', position: { x: 500, y: 120 },
          data: { definitionType: 'math-map-range', label: 'Roll to Red', category: 'math', propertyValues: { in_min: 0, in_max: 45, out_min: 0, out_max: 255 } }, // i18n-exempt
        },
        {
          id: 'map_g', type: 'math-map-range', position: { x: 500, y: 280 },
          data: { definitionType: 'math-map-range', label: 'Pitch to Green', category: 'math', propertyValues: { in_min: 0, in_max: 45, out_min: 0, out_max: 255 } }, // i18n-exempt
        },
        {
          id: 'map_b', type: 'math-map-range', position: { x: 500, y: 440 },
          data: { definitionType: 'math-map-range', label: 'Yaw to Blue', category: 'math', propertyValues: { in_min: 0, in_max: 360, out_min: 0, out_max: 255 } }, // i18n-exempt
        },
        // ── Clamp to valid 0-255 ──
        {
          id: 'clamp_r', type: 'math-clamp', position: { x: 740, y: 120 },
          data: { definitionType: 'math-clamp', label: 'Clamp Red', category: 'math', propertyValues: { min: 0, max: 255 } }, // i18n-exempt
        },
        {
          id: 'clamp_g', type: 'math-clamp', position: { x: 740, y: 280 },
          data: { definitionType: 'math-clamp', label: 'Clamp Green', category: 'math', propertyValues: { min: 0, max: 255 } }, // i18n-exempt
        },
        {
          id: 'clamp_b', type: 'math-clamp', position: { x: 740, y: 440 },
          data: { definitionType: 'math-clamp', label: 'Clamp Blue', category: 'math', propertyValues: { min: 0, max: 255 } }, // i18n-exempt
        },
        // ── Gate: armed + aux switch ──
        {
          id: 'gate', type: 'logic-and', position: { x: 780, y: 560 },
          data: { definitionType: 'logic-and', label: 'Armed + Enabled', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'timer', type: 'timing-run-every', position: { x: 990, y: 490 },
          data: { definitionType: 'timing-run-every', label: 'Every 100ms', category: 'timing', propertyValues: { interval_ms: 100 } }, // i18n-exempt
        },
        // ── LED output ──
        {
          id: 'led', type: 'action-set-led', position: { x: 1020, y: 240 },
          data: { definitionType: 'action-set-led', label: 'NeoPixel LED', category: 'actions', propertyValues: { instance: 0 } }, // i18n-exempt
        },
        // ── Enable notification ──
        {
          id: 'aux_edge', type: 'timing-rising-edge', position: { x: 300, y: 560 },
          data: { definitionType: 'timing-rising-edge', label: 'Switch ON?', category: 'timing', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'enable_msg', type: 'action-gcs-text', position: { x: 540, y: 560 },
          data: { definitionType: 'action-gcs-text', label: 'LED Active', category: 'actions', propertyValues: { message: 'Attitude LED display activated', severity: 6 } }, // i18n-exempt
        },
      ],
      edges: [
        // Attitude → Abs (roll/pitch can be negative)
        { id: 'e1', source: 'attitude', target: 'abs_roll', sourceHandle: 'roll', targetHandle: 'value' },
        { id: 'e2', source: 'attitude', target: 'abs_pitch', sourceHandle: 'pitch', targetHandle: 'value' },
        // Abs → Map to 0-255
        { id: 'e3', source: 'abs_roll', target: 'map_r', sourceHandle: 'result', targetHandle: 'value' },
        { id: 'e4', source: 'abs_pitch', target: 'map_g', sourceHandle: 'result', targetHandle: 'value' },
        // Yaw direct (already 0-360)
        { id: 'e5', source: 'attitude', target: 'map_b', sourceHandle: 'yaw', targetHandle: 'value' },
        // Map → Clamp
        { id: 'e6', source: 'map_r', target: 'clamp_r', sourceHandle: 'result', targetHandle: 'value' },
        { id: 'e7', source: 'map_g', target: 'clamp_g', sourceHandle: 'result', targetHandle: 'value' },
        { id: 'e8', source: 'map_b', target: 'clamp_b', sourceHandle: 'result', targetHandle: 'value' },
        // Clamp → LED RGB inputs
        { id: 'e9', source: 'clamp_r', target: 'led', sourceHandle: 'result', targetHandle: 'r' },
        { id: 'e10', source: 'clamp_g', target: 'led', sourceHandle: 'result', targetHandle: 'g' },
        { id: 'e11', source: 'clamp_b', target: 'led', sourceHandle: 'result', targetHandle: 'b' },
        // Armed + aux → gate → timer → LED trigger
        { id: 'e12', source: 'armed', target: 'gate', sourceHandle: 'is_armed', targetHandle: 'a' },
        { id: 'e13', source: 'aux', target: 'gate', sourceHandle: 'is_high', targetHandle: 'b' },
        { id: 'e14', source: 'gate', target: 'timer', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e15', source: 'timer', target: 'led', sourceHandle: 'flow', targetHandle: 'trigger' },
        // Aux → edge detect → notification
        { id: 'e16', source: 'aux', target: 'aux_edge', sourceHandle: 'is_high', targetHandle: 'input' },
        { id: 'e17', source: 'aux_edge', target: 'enable_msg', sourceHandle: 'triggered', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.7 },
    },
  },

  // ─── Preflight Health Check ──────────────────────────────────
  // Complex: 19 functional nodes + 4 comments = 23 total
  {
    id: 'preflight-health-check',
    name: 'Preflight Health Check', // i18n-exempt
    description: 'On arm, checks GPS satellite count, battery voltage, and altitude sensor health. Announces PASS or FAIL with a buzzer melody. 19 interconnected nodes.', // i18n-exempt
    category: 'Utility',
    graph: {
      version: 1,
      name: 'Preflight Health Check', // i18n-exempt
      description: 'Automated preflight sensor checks with pass/fail announcement', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage comments ──
        {
          id: 'c1', type: 'flow-comment', position: { x: 40, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Sensors', category: 'flow', propertyValues: { text: 'Read all sensor health indicators on every cycle' } }, // i18n-exempt
        },
        {
          id: 'c2', type: 'flow-comment', position: { x: 400, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Checks', category: 'flow', propertyValues: { text: 'Verify GPS sats >= 8, voltage > 14V, altitude near ground' } }, // i18n-exempt
        },
        {
          id: 'c3', type: 'flow-comment', position: { x: 700, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Health', category: 'flow', propertyValues: { text: 'Chain all checks into a single healthy/unhealthy flag' } }, // i18n-exempt
        },
        {
          id: 'c4', type: 'flow-comment', position: { x: 1040, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Announce', category: 'flow', propertyValues: { text: 'On arm moment: play pass/fail melody and notify GCS' } }, // i18n-exempt
        },
        // ── Sensors ──
        {
          id: 'armed', type: 'sensor-armed', position: { x: 60, y: 120 },
          data: { definitionType: 'sensor-armed', label: 'Armed State', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gps', type: 'sensor-gps-status', position: { x: 60, y: 280 },
          data: { definitionType: 'sensor-gps-status', label: 'GPS Status', category: 'sensors', propertyValues: { instance: 0 } }, // i18n-exempt
        },
        {
          id: 'battery', type: 'sensor-battery', position: { x: 60, y: 440 },
          data: { definitionType: 'sensor-battery', label: 'Battery', category: 'sensors', propertyValues: { instance: 0 } }, // i18n-exempt
        },
        {
          id: 'altitude', type: 'sensor-baro-alt', position: { x: 60, y: 580 },
          data: { definitionType: 'sensor-baro-alt', label: 'Altitude', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        // ── Constants ──
        {
          id: 'sat_min', type: 'var-constant', position: { x: 240, y: 350 },
          data: { definitionType: 'var-constant', label: 'Min Sats (8)', category: 'variables', propertyValues: { type: 'number', value: '8' } }, // i18n-exempt
        },
        {
          id: 'batt_min', type: 'var-constant', position: { x: 240, y: 510 },
          data: { definitionType: 'var-constant', label: 'Min Volts (14)', category: 'variables', propertyValues: { type: 'number', value: '14' } }, // i18n-exempt
        },
        // ── Arm edge detect ──
        {
          id: 'arm_edge', type: 'timing-rising-edge', position: { x: 420, y: 120 },
          data: { definitionType: 'timing-rising-edge', label: 'Arm Moment', category: 'timing', propertyValues: {} }, // i18n-exempt
        },
        // ── Individual checks ──
        {
          id: 'sat_check', type: 'logic-compare', position: { x: 420, y: 280 },
          data: { definitionType: 'logic-compare', label: 'Sats >= 8?', category: 'logic', propertyValues: { operator: '>=' } }, // i18n-exempt
        },
        {
          id: 'batt_check', type: 'logic-compare', position: { x: 420, y: 440 },
          data: { definitionType: 'logic-compare', label: 'Voltage > 14?', category: 'logic', propertyValues: { operator: '>' } }, // i18n-exempt
        },
        {
          id: 'alt_check', type: 'logic-range-check', position: { x: 420, y: 580 },
          data: { definitionType: 'logic-range-check', label: 'Near Ground?', category: 'logic', propertyValues: { min: -5, max: 5 } }, // i18n-exempt
        },
        // ── AND chain → single health flag ──
        {
          id: 'health1', type: 'logic-and', position: { x: 660, y: 350 },
          data: { definitionType: 'logic-and', label: 'GPS + Battery', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'health2', type: 'logic-and', position: { x: 660, y: 500 },
          data: { definitionType: 'logic-and', label: 'All Healthy', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        // ── Branch: pass vs fail ──
        {
          id: 'not_healthy', type: 'logic-not', position: { x: 850, y: 560 },
          data: { definitionType: 'logic-not', label: 'Unhealthy?', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'pass_gate', type: 'logic-and', position: { x: 880, y: 260 },
          data: { definitionType: 'logic-and', label: 'Arm + Healthy', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'fail_gate', type: 'logic-and', position: { x: 880, y: 480 },
          data: { definitionType: 'logic-and', label: 'Arm + Unhealthy', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        // ── Pass actions ──
        {
          id: 'pass_msg', type: 'action-gcs-text', position: { x: 1100, y: 180 },
          data: { definitionType: 'action-gcs-text', label: 'PASS', category: 'actions', propertyValues: { message: 'PREFLIGHT PASS: All systems go', severity: 5 } }, // i18n-exempt
        },
        {
          id: 'pass_tune', type: 'action-play-tune', position: { x: 1100, y: 320 },
          data: { definitionType: 'action-play-tune', label: 'Success Beep', category: 'actions', propertyValues: { tune: 'MFT200L8O5CEGC6' } }, // i18n-exempt
        },
        // ── Fail actions ──
        {
          id: 'fail_msg', type: 'action-gcs-text', position: { x: 1100, y: 460 },
          data: { definitionType: 'action-gcs-text', label: 'FAIL', category: 'actions', propertyValues: { message: 'PREFLIGHT FAIL: Check GPS/battery/alt', severity: 2 } }, // i18n-exempt
        },
        {
          id: 'fail_tune', type: 'action-play-tune', position: { x: 1100, y: 600 },
          data: { definitionType: 'action-play-tune', label: 'Fail Buzzer', category: 'actions', propertyValues: { tune: 'MFT100L4O4GAGAG' } }, // i18n-exempt
        },
      ],
      edges: [
        // Armed → edge detect
        { id: 'e1', source: 'armed', target: 'arm_edge', sourceHandle: 'is_armed', targetHandle: 'input' },
        // GPS check
        { id: 'e2', source: 'gps', target: 'sat_check', sourceHandle: 'num_sats', targetHandle: 'a' },
        { id: 'e3', source: 'sat_min', target: 'sat_check', sourceHandle: 'value', targetHandle: 'b' },
        // Battery check
        { id: 'e4', source: 'battery', target: 'batt_check', sourceHandle: 'voltage', targetHandle: 'a' },
        { id: 'e5', source: 'batt_min', target: 'batt_check', sourceHandle: 'value', targetHandle: 'b' },
        // Altitude check
        { id: 'e6', source: 'altitude', target: 'alt_check', sourceHandle: 'alt_m', targetHandle: 'value' },
        // AND chain: sat + batt → health1, health1 + alt → health2
        { id: 'e7', source: 'sat_check', target: 'health1', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e8', source: 'batt_check', target: 'health1', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e9', source: 'health1', target: 'health2', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e10', source: 'alt_check', target: 'health2', sourceHandle: 'in_range', targetHandle: 'b' },
        // Pass path: arm_edge AND health2
        { id: 'e11', source: 'arm_edge', target: 'pass_gate', sourceHandle: 'triggered', targetHandle: 'a' },
        { id: 'e12', source: 'health2', target: 'pass_gate', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e13', source: 'pass_gate', target: 'pass_msg', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e14', source: 'pass_gate', target: 'pass_tune', sourceHandle: 'result', targetHandle: 'trigger' },
        // Fail path: arm_edge AND NOT(health2)
        { id: 'e15', source: 'health2', target: 'not_healthy', sourceHandle: 'result', targetHandle: 'input' },
        { id: 'e16', source: 'arm_edge', target: 'fail_gate', sourceHandle: 'triggered', targetHandle: 'a' },
        { id: 'e17', source: 'not_healthy', target: 'fail_gate', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e18', source: 'fail_gate', target: 'fail_msg', sourceHandle: 'result', targetHandle: 'trigger' },
        { id: 'e19', source: 'fail_gate', target: 'fail_tune', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.65 },
    },
  },

  // ─── Multi-Timer Task Scheduler ──────────────────────────────
  // Complex: 16 functional nodes + 4 comments = 20 total
  {
    id: 'multi-timer-scheduler',
    name: 'Multi-Timer Task Scheduler',
    description: 'Three independent timers running at different rates: GPS logging every 2s, conditional battery warning every 10s, and GPS quality check every 30s. All gated by arm state.', // i18n-exempt
    category: 'Utility',
    graph: {
      version: 1,
      name: 'Multi-Timer Task Scheduler',
      description: 'Independent timed tasks for logging and conditional monitoring', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Stage comments ──
        {
          id: 'c1', type: 'flow-comment', position: { x: 40, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Sensors', category: 'flow', propertyValues: { text: 'Read GPS, battery, and satellite status' } }, // i18n-exempt
        },
        {
          id: 'c2', type: 'flow-comment', position: { x: 360, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Timers', category: 'flow', propertyValues: { text: 'Three independent timers, all gated by armed state' } }, // i18n-exempt
        },
        {
          id: 'c3', type: 'flow-comment', position: { x: 620, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Conditions', category: 'flow', propertyValues: { text: 'Only warn when conditions are actually bad' } }, // i18n-exempt
        },
        {
          id: 'c4', type: 'flow-comment', position: { x: 920, y: 20 },
          data: { definitionType: 'flow-comment', label: 'Actions', category: 'flow', propertyValues: { text: 'Log data and send conditional warnings' } }, // i18n-exempt
        },
        // ── Sensors ──
        {
          id: 'armed', type: 'sensor-armed', position: { x: 60, y: 140 },
          data: { definitionType: 'sensor-armed', label: 'Armed State', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gps', type: 'sensor-gps', position: { x: 60, y: 280 },
          data: { definitionType: 'sensor-gps', label: 'GPS Position', category: 'sensors', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'battery', type: 'sensor-battery', position: { x: 60, y: 460 },
          data: { definitionType: 'sensor-battery', label: 'Battery', category: 'sensors', propertyValues: { instance: 0 } }, // i18n-exempt
        },
        {
          id: 'gps_status', type: 'sensor-gps-status', position: { x: 60, y: 620 },
          data: { definitionType: 'sensor-gps-status', label: 'GPS Quality', category: 'sensors', propertyValues: { instance: 0 } }, // i18n-exempt
        },
        // ── Thresholds ──
        {
          id: 'batt_threshold', type: 'var-constant', position: { x: 240, y: 530 },
          data: { definitionType: 'var-constant', label: 'Min Battery %', category: 'variables', propertyValues: { type: 'number', value: '20' } }, // i18n-exempt
        },
        {
          id: 'sat_threshold', type: 'var-constant', position: { x: 240, y: 690 },
          data: { definitionType: 'var-constant', label: 'Min Sats', category: 'variables', propertyValues: { type: 'number', value: '6' } }, // i18n-exempt
        },
        // ── Timers (all armed-gated) ──
        {
          id: 'timer_log', type: 'timing-run-every', position: { x: 380, y: 200 },
          data: { definitionType: 'timing-run-every', label: 'Every 2s (Log)', category: 'timing', propertyValues: { interval_ms: 2000 } }, // i18n-exempt
        },
        {
          id: 'timer_batt', type: 'timing-run-every', position: { x: 380, y: 400 },
          data: { definitionType: 'timing-run-every', label: 'Every 10s (Batt)', category: 'timing', propertyValues: { interval_ms: 10000 } }, // i18n-exempt
        },
        {
          id: 'timer_gps', type: 'timing-run-every', position: { x: 380, y: 580 },
          data: { definitionType: 'timing-run-every', label: 'Every 30s (GPS)', category: 'timing', propertyValues: { interval_ms: 30000 } }, // i18n-exempt
        },
        // ── Conditional checks ──
        {
          id: 'batt_low', type: 'logic-compare', position: { x: 620, y: 460 },
          data: { definitionType: 'logic-compare', label: 'Battery < 20%?', category: 'logic', propertyValues: { operator: '<' } }, // i18n-exempt
        },
        {
          id: 'sats_low', type: 'logic-compare', position: { x: 620, y: 620 },
          data: { definitionType: 'logic-compare', label: 'Sats < 6?', category: 'logic', propertyValues: { operator: '<' } }, // i18n-exempt
        },
        // ── Gates: timer fires AND condition is bad ──
        {
          id: 'batt_gate', type: 'logic-and', position: { x: 820, y: 400 },
          data: { definitionType: 'logic-and', label: 'Timer + Low Batt', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        {
          id: 'gps_gate', type: 'logic-and', position: { x: 820, y: 580 },
          data: { definitionType: 'logic-and', label: 'Timer + Low Sats', category: 'logic', propertyValues: {} }, // i18n-exempt
        },
        // ── Actions ──
        {
          id: 'log_gps', type: 'action-log-to-file', position: { x: 940, y: 140 },
          data: { definitionType: 'action-log-to-file', label: 'Log GPS + Alt', category: 'actions', propertyValues: { filename: 'flight_track.csv', separator: ',' } }, // i18n-exempt
        },
        {
          id: 'batt_warn', type: 'action-gcs-text', position: { x: 1040, y: 380 },
          data: { definitionType: 'action-gcs-text', label: 'Battery Warning', category: 'actions', propertyValues: { message: 'WARNING: Battery below 20%', severity: 4 } }, // i18n-exempt
        },
        {
          id: 'gps_warn', type: 'action-gcs-text', position: { x: 1040, y: 560 },
          data: { definitionType: 'action-gcs-text', label: 'GPS Warning', category: 'actions', propertyValues: { message: 'WARNING: Low satellite count', severity: 4 } }, // i18n-exempt
        },
      ],
      edges: [
        // Armed gates all 3 timers
        { id: 'e1', source: 'armed', target: 'timer_log', sourceHandle: 'is_armed', targetHandle: 'trigger' },
        { id: 'e2', source: 'armed', target: 'timer_batt', sourceHandle: 'is_armed', targetHandle: 'trigger' },
        { id: 'e3', source: 'armed', target: 'timer_gps', sourceHandle: 'is_armed', targetHandle: 'trigger' },
        // Timer 1 → GPS log
        { id: 'e4', source: 'timer_log', target: 'log_gps', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e5', source: 'gps', target: 'log_gps', sourceHandle: 'lat', targetHandle: 'value1' },
        { id: 'e6', source: 'gps', target: 'log_gps', sourceHandle: 'lng', targetHandle: 'value2' },
        { id: 'e7', source: 'gps', target: 'log_gps', sourceHandle: 'alt', targetHandle: 'value3' },
        // Battery check
        { id: 'e8', source: 'battery', target: 'batt_low', sourceHandle: 'remaining_pct', targetHandle: 'a' },
        { id: 'e9', source: 'batt_threshold', target: 'batt_low', sourceHandle: 'value', targetHandle: 'b' },
        // Timer 2 AND batt_low → warning
        { id: 'e10', source: 'timer_batt', target: 'batt_gate', sourceHandle: 'flow', targetHandle: 'a' },
        { id: 'e11', source: 'batt_low', target: 'batt_gate', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e12', source: 'batt_gate', target: 'batt_warn', sourceHandle: 'result', targetHandle: 'trigger' },
        // Satellite check
        { id: 'e13', source: 'gps_status', target: 'sats_low', sourceHandle: 'num_sats', targetHandle: 'a' },
        { id: 'e14', source: 'sat_threshold', target: 'sats_low', sourceHandle: 'value', targetHandle: 'b' },
        // Timer 3 AND sats_low → warning
        { id: 'e15', source: 'timer_gps', target: 'gps_gate', sourceHandle: 'flow', targetHandle: 'a' },
        { id: 'e16', source: 'sats_low', target: 'gps_gate', sourceHandle: 'result', targetHandle: 'b' },
        { id: 'e17', source: 'gps_gate', target: 'gps_warn', sourceHandle: 'result', targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.7 },
    },
  },

  // ─── ArduDeck Heartbeat Beacon ────────────────────────────────
  // The minimum-viable FC-side script: publish a NAMED_VALUE_FLOAT every
  // second so the GCS can confirm the script is loaded and running.
  // This is the same pattern ArduDeck's own ardudeck_commands.lua uses for AD_HB.
  {
    id: 'ad-heartbeat-beacon',
    name: 'ArduDeck Heartbeat Beacon',
    description: 'Publish a NAMED_VALUE_FLOAT heartbeat every second so the GCS can confirm the script is alive (mirrors the AD_HB pattern).', // i18n-exempt
    category: 'FC Script',
    graph: {
      version: 1,
      name: 'ArduDeck Heartbeat Beacon',
      description: 'Publish AD_HB once per second', // i18n-exempt
      runIntervalMs: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Tick once per second' }, // i18n-exempt
          },
        },
        {
          id: 'comment_publish',
          type: 'flow-comment',
          position: { x: 480, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Send AD_HB to the GCS so it knows we are alive' }, // i18n-exempt
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 1 sec', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 1000 },
          },
        },
        {
          id: 'version',
          type: 'var-constant',
          position: { x: 240, y: 280 },
          data: {
            definitionType: 'var-constant',
            label: 'Script version', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '1.0' },
          },
        },
        {
          id: 'publish',
          type: 'action-publish-named-float',
          position: { x: 500, y: 110 },
          data: {
            definitionType: 'action-publish-named-float',
            label: 'Publish AD_HB', // i18n-exempt
            category: 'actions',
            propertyValues: { name: 'AD_HB' },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'timer',   target: 'publish', sourceHandle: 'flow',  targetHandle: 'trigger' },
        { id: 'e2', source: 'version', target: 'publish', sourceHandle: 'value', targetHandle: 'value' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.9 },
    },
  },

  // ─── Telemetry Beacon (3 Channels) ────────────────────────────
  // Publishes distance-to-home, satellite count, and battery voltage as
  // NAMED_VALUE_FLOATs every second so a GCS dashboard can show them as
  // first-class telemetry without parsing custom MAVLink.
  {
    id: 'telemetry-beacon',
    name: 'Telemetry Beacon (3 Channels)', // i18n-exempt
    description: 'Publish distance-to-home, sat count, and battery voltage as NAMED_VALUE_FLOATs every second for custom GCS dashboards.', // i18n-exempt
    category: 'FC Script',
    graph: {
      version: 1,
      name: 'Telemetry Beacon', // i18n-exempt
      description: 'Publish DIST_H, SATS, BATT_V to GCS once per second', // i18n-exempt
      runIntervalMs: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read live position, GPS status, and battery' }, // i18n-exempt
          },
        },
        {
          id: 'comment_compute',
          type: 'flow-comment',
          position: { x: 460, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Compute distance from vehicle to home' }, // i18n-exempt
          },
        },
        {
          id: 'comment_publish',
          type: 'flow-comment',
          position: { x: 880, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Publish each value as a NAMED_VALUE_FLOAT' }, // i18n-exempt
          },
        },
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 1 sec', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 1000 },
          },
        },
        {
          id: 'ahrs_loc',
          type: 'sensor-ahrs-location',
          position: { x: 60, y: 240 },
          data: {
            definitionType: 'sensor-ahrs-location',
            label: 'Vehicle Location', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'home',
          type: 'sensor-home',
          position: { x: 60, y: 380 },
          data: {
            definitionType: 'sensor-home',
            label: 'Home Position', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'gps_status',
          type: 'sensor-gps-status',
          position: { x: 60, y: 520 },
          data: {
            definitionType: 'sensor-gps-status',
            label: 'GPS Status', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'battery',
          type: 'sensor-battery',
          position: { x: 60, y: 660 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        {
          id: 'distance',
          type: 'math-location-distance',
          position: { x: 480, y: 290 },
          data: {
            definitionType: 'math-location-distance',
            label: 'Vehicle → Home', // i18n-exempt
            category: 'math',
            propertyValues: {},
          },
        },
        {
          id: 'pub_dist',
          type: 'action-publish-named-float',
          position: { x: 900, y: 240 },
          data: {
            definitionType: 'action-publish-named-float',
            label: 'Publish DIST_H', // i18n-exempt
            category: 'actions',
            propertyValues: { name: 'DIST_H' },
          },
        },
        {
          id: 'pub_sats',
          type: 'action-publish-named-float',
          position: { x: 900, y: 420 },
          data: {
            definitionType: 'action-publish-named-float',
            label: 'Publish SATS', // i18n-exempt
            category: 'actions',
            propertyValues: { name: 'SATS' },
          },
        },
        {
          id: 'pub_batt',
          type: 'action-publish-named-float',
          position: { x: 900, y: 600 },
          data: {
            definitionType: 'action-publish-named-float',
            label: 'Publish BATT_V', // i18n-exempt
            category: 'actions',
            propertyValues: { name: 'BATT_V' },
          },
        },
      ],
      edges: [
        // Compute distance from vehicle to home
        { id: 'e1', source: 'ahrs_loc', target: 'distance', sourceHandle: 'location', targetHandle: 'a' },
        { id: 'e2', source: 'home',     target: 'distance', sourceHandle: 'location', targetHandle: 'b' },
        // Publish each value once per timer tick
        { id: 'e3', source: 'timer',    target: 'pub_dist', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e4', source: 'distance', target: 'pub_dist', sourceHandle: 'distance_m', targetHandle: 'value' },
        { id: 'e5', source: 'timer',    target: 'pub_sats', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e6', source: 'gps_status', target: 'pub_sats', sourceHandle: 'num_sats', targetHandle: 'value' },
        { id: 'e7', source: 'timer',    target: 'pub_batt', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e8', source: 'battery',  target: 'pub_batt', sourceHandle: 'voltage', targetHandle: 'value' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.65 },
    },
  },

  // ─── GUIDED Set-Target via RC Switch ──────────────────────────
  // RC AUX HIGH → command vehicle to fly to a fixed offset from home (e.g.
  // "the staging spot 50m due north"). Demonstrates the RC-trigger →
  // location-math → set-target-location chain that powers most ad-hoc
  // commanding scripts.
  {
    id: 'guided-set-target-rc',
    name: 'GUIDED Set-Target via RC Switch',
    description: 'When an RC AUX switch is HIGH in GUIDED mode, command the vehicle to fly to a fixed offset from home (e.g. 50m north of takeoff).', // i18n-exempt
    category: 'FC Script',
    graph: {
      version: 1,
      name: 'GUIDED Set-Target via RC Switch',
      description: 'RC AUX HIGH → fly to home + 50m north', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_trigger',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Watch RC AUX switch state' }, // i18n-exempt
          },
        },
        {
          id: 'comment_target',
          type: 'flow-comment',
          position: { x: 480, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Compute target = home offset by 50m at 0° (north)' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 900, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Push GUIDED target while switch is HIGH' }, // i18n-exempt
          },
        },
        {
          id: 'rc_aux',
          type: 'sensor-rc-aux-switch',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-rc-aux-switch',
            label: 'RC AUX 7', // i18n-exempt
            category: 'sensors',
            propertyValues: { aux_fn: 7 },
          },
        },
        {
          id: 'home',
          type: 'sensor-home',
          position: { x: 60, y: 280 },
          data: {
            definitionType: 'sensor-home',
            label: 'Home', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'bearing',
          type: 'var-constant',
          position: { x: 280, y: 460 },
          data: {
            definitionType: 'var-constant',
            label: 'Bearing (deg)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '0' },
          },
        },
        {
          id: 'distance',
          type: 'var-constant',
          position: { x: 280, y: 580 },
          data: {
            definitionType: 'var-constant',
            label: 'Distance (m)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '50' },
          },
        },
        {
          id: 'offset',
          type: 'math-location-offset',
          position: { x: 500, y: 280 },
          data: {
            definitionType: 'math-location-offset',
            label: 'Home + 50m N', // i18n-exempt
            category: 'math',
            propertyValues: {},
          },
        },
        {
          id: 'set_target',
          type: 'action-set-target-location',
          position: { x: 920, y: 200 },
          data: {
            definitionType: 'action-set-target-location',
            label: 'GUIDED → target', // i18n-exempt
            category: 'actions',
            propertyValues: {},
          },
        },
      ],
      edges: [
        // Build the offset target location
        { id: 'e1', source: 'home',     target: 'offset', sourceHandle: 'location',    targetHandle: 'from' },
        { id: 'e2', source: 'bearing',  target: 'offset', sourceHandle: 'value',       targetHandle: 'bearing_deg' },
        { id: 'e3', source: 'distance', target: 'offset', sourceHandle: 'value',       targetHandle: 'distance_m' },
        // Push the target while the switch is HIGH
        { id: 'e4', source: 'rc_aux',   target: 'set_target', sourceHandle: 'is_high', targetHandle: 'trigger' },
        { id: 'e5', source: 'offset',   target: 'set_target', sourceHandle: 'location', targetHandle: 'location' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.7 },
    },
  },

  // ─── Distance-Triggered RTL ───────────────────────────────────
  // When the vehicle drifts more than N metres from home, automatically
  // switch to RTL mode. Useful as a backup geofence in case the operator
  // misses an alert. Demonstrates location math + mode change.
  {
    id: 'distance-triggered-rtl',
    name: 'Distance-Triggered RTL',
    description: 'When vehicle drifts more than 200m from home, automatically switch to RTL mode. Backup geofence using location math + mode change.', // i18n-exempt
    category: 'FC Script',
    graph: {
      version: 1,
      name: 'Distance-Triggered RTL',
      description: 'Auto-RTL when distance from home exceeds 200m', // i18n-exempt
      runIntervalMs: 500,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read live position + home' }, // i18n-exempt
          },
        },
        {
          id: 'comment_check',
          type: 'flow-comment',
          position: { x: 460, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Are we more than 200m from home?' }, // i18n-exempt
          },
        },
        {
          id: 'comment_action',
          type: 'flow-comment',
          position: { x: 880, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Switch to RTL mode (Copter mode 6) + warn pilot' }, // i18n-exempt
          },
        },
        {
          id: 'ahrs_loc',
          type: 'sensor-ahrs-location',
          position: { x: 60, y: 110 },
          data: {
            definitionType: 'sensor-ahrs-location',
            label: 'Vehicle', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'home',
          type: 'sensor-home',
          position: { x: 60, y: 260 },
          data: {
            definitionType: 'sensor-home',
            label: 'Home', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'distance',
          type: 'math-location-distance',
          position: { x: 480, y: 180 },
          data: {
            definitionType: 'math-location-distance',
            label: 'Distance to home', // i18n-exempt
            category: 'math',
            propertyValues: {},
          },
        },
        {
          id: 'limit',
          type: 'var-constant',
          position: { x: 280, y: 420 },
          data: {
            definitionType: 'var-constant',
            label: 'Limit (m)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '200' },
          },
        },
        {
          id: 'compare',
          type: 'logic-compare',
          position: { x: 480, y: 360 },
          data: {
            definitionType: 'logic-compare',
            label: 'Distance > 200?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'set_rtl',
          type: 'action-set-mode',
          position: { x: 900, y: 120 },
          data: {
            definitionType: 'action-set-mode',
            label: 'Switch to RTL', // i18n-exempt
            category: 'actions',
            propertyValues: { mode_num: 6 },
          },
        },
        {
          id: 'warn',
          type: 'action-gcs-text',
          position: { x: 900, y: 280 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Warn pilot', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'AUTO RTL: distance from home exceeded', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'ahrs_loc', target: 'distance', sourceHandle: 'location',  targetHandle: 'a' },
        { id: 'e2', source: 'home',     target: 'distance', sourceHandle: 'location',  targetHandle: 'b' },
        { id: 'e3', source: 'distance', target: 'compare',  sourceHandle: 'distance_m', targetHandle: 'a' },
        { id: 'e4', source: 'limit',    target: 'compare',  sourceHandle: 'value',     targetHandle: 'b' },
        { id: 'e5', source: 'compare',  target: 'set_rtl',  sourceHandle: 'result',    targetHandle: 'trigger' },
        { id: 'e6', source: 'compare',  target: 'warn',     sourceHandle: 'result',    targetHandle: 'trigger' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.75 },
    },
  },

  // ─── Patrol Between Two Anchors ───────────────────────────────
  // Toggle between two fixed offsets from home every 30 seconds. A simple
  // ad-hoc patrol pattern that doesn't need a planned mission. Demonstrates
  // the timing-latch pattern + dual conditional set-target-location.
  {
    id: 'patrol-two-anchors',
    name: 'Patrol Between Two Anchors', // i18n-exempt
    description: 'Toggle the GUIDED target between two fixed offsets from home every 30 seconds. Simple ad-hoc patrol with no mission required.', // i18n-exempt
    category: 'FC Script',
    graph: {
      version: 1,
      name: 'Patrol Between Two Anchors', // i18n-exempt
      description: 'Alternate target between home+80m N and home+80m S every 30s', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_timer',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Toggle every 30s using a latch' }, // i18n-exempt
          },
        },
        {
          id: 'comment_anchors',
          type: 'flow-comment',
          position: { x: 480, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Build two anchor positions from home' }, // i18n-exempt
          },
        },
        {
          id: 'comment_select',
          type: 'flow-comment',
          position: { x: 920, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Push the active anchor as GUIDED target' }, // i18n-exempt
          },
        },
        // Toggle source
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 30s', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 30000 },
          },
        },
        {
          id: 'latch',
          type: 'timing-latch',
          position: { x: 240, y: 200 },
          data: {
            definitionType: 'timing-latch',
            label: 'Patrol toggle', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'not_latch',
          type: 'logic-not',
          position: { x: 240, y: 320 },
          data: {
            definitionType: 'logic-not',
            label: 'Other anchor', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        // Anchor positions
        {
          id: 'home',
          type: 'sensor-home',
          position: { x: 480, y: 200 },
          data: {
            definitionType: 'sensor-home',
            label: 'Home', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'bearing_a',
          type: 'var-constant',
          position: { x: 480, y: 380 },
          data: {
            definitionType: 'var-constant',
            label: 'A bearing (N)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '0' },
          },
        },
        {
          id: 'bearing_b',
          type: 'var-constant',
          position: { x: 480, y: 480 },
          data: {
            definitionType: 'var-constant',
            label: 'B bearing (S)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '180' },
          },
        },
        {
          id: 'patrol_dist',
          type: 'var-constant',
          position: { x: 480, y: 580 },
          data: {
            definitionType: 'var-constant',
            label: 'Leg length (m)', // i18n-exempt
            category: 'variables',
            propertyValues: { type: 'number', value: '80' },
          },
        },
        {
          id: 'anchor_a',
          type: 'math-location-offset',
          position: { x: 720, y: 230 },
          data: {
            definitionType: 'math-location-offset',
            label: 'Anchor A', // i18n-exempt
            category: 'math',
            propertyValues: {},
          },
        },
        {
          id: 'anchor_b',
          type: 'math-location-offset',
          position: { x: 720, y: 430 },
          data: {
            definitionType: 'math-location-offset',
            label: 'Anchor B', // i18n-exempt
            category: 'math',
            propertyValues: {},
          },
        },
        // Two set-target nodes, one per anchor, gated by the latch state.
        {
          id: 'set_a',
          type: 'action-set-target-location',
          position: { x: 940, y: 230 },
          data: {
            definitionType: 'action-set-target-location',
            label: 'Go to A', // i18n-exempt
            category: 'actions',
            propertyValues: {},
          },
        },
        {
          id: 'set_b',
          type: 'action-set-target-location',
          position: { x: 940, y: 430 },
          data: {
            definitionType: 'action-set-target-location',
            label: 'Go to B', // i18n-exempt
            category: 'actions',
            propertyValues: {},
          },
        },
      ],
      edges: [
        // Toggle latch each 30s pulse, then NOT for the other branch
        { id: 'e1', source: 'timer',     target: 'latch',     sourceHandle: 'flow',  targetHandle: 'set' },
        { id: 'e2', source: 'latch',     target: 'not_latch', sourceHandle: 'state', targetHandle: 'input' },
        // Build Anchor A = home + (0°, 80m)
        { id: 'e3', source: 'home',        target: 'anchor_a', sourceHandle: 'location', targetHandle: 'from' },
        { id: 'e4', source: 'bearing_a',   target: 'anchor_a', sourceHandle: 'value',    targetHandle: 'bearing_deg' },
        { id: 'e5', source: 'patrol_dist', target: 'anchor_a', sourceHandle: 'value',    targetHandle: 'distance_m' },
        // Build Anchor B = home + (180°, 80m)
        { id: 'e6', source: 'home',        target: 'anchor_b', sourceHandle: 'location', targetHandle: 'from' },
        { id: 'e7', source: 'bearing_b',   target: 'anchor_b', sourceHandle: 'value',    targetHandle: 'bearing_deg' },
        { id: 'e8', source: 'patrol_dist', target: 'anchor_b', sourceHandle: 'value',    targetHandle: 'distance_m' },
        // Set targets: A when latch=true, B when latch=false
        { id: 'e9',  source: 'latch',     target: 'set_a', sourceHandle: 'state',    targetHandle: 'trigger' },
        { id: 'e10', source: 'anchor_a',  target: 'set_a', sourceHandle: 'location', targetHandle: 'location' },
        { id: 'e11', source: 'not_latch', target: 'set_b', sourceHandle: 'result',   targetHandle: 'trigger' },
        { id: 'e12', source: 'anchor_b',  target: 'set_b', sourceHandle: 'location', targetHandle: 'location' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.6 },
    },
  },

  // ─── Camera Trigger Watchdog ──────────────────────────────────
  {
    id: 'camera-trigger-watchdog',
    name: 'Camera Trigger Watchdog', // i18n-exempt
    description: 'Warn on the GCS with the current waypoint when a distance-triggered camera stops actually taking photos (e.g. it overheats). Catches the hotshoe pulse with a hardware interrupt: polling gpio:read misses the 1-2 ms pulse.', // i18n-exempt
    category: 'Safety',
    graph: {
      version: 1,
      name: 'Camera Trigger Watchdog', // i18n-exempt
      description: 'Alert when a distance-triggered camera stops capturing, using an interrupt on the hotshoe signal', // i18n-exempt
      runIntervalMs: 100,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2026-07-09T00:00:00.000Z',
      nodes: [
        {
          id: 'comment_photo',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Real photo = hotshoe pulse caught by interrupt. Y-wire the hotshoe signal to a free AUX pin with SERVOx_FUNCTION = -1. Do NOT reuse CAM1_FEEDBAK_PIN: whoever attaches first owns the interrupt.' }, // i18n-exempt
          },
        },
        {
          id: 'comment_gate',
          type: 'flow-comment',
          position: { x: 40, y: 300 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Only watch while armed and the distance trigger is active (CAM1_TRIGG_DIST > 0)' }, // i18n-exempt
          },
        },
        {
          id: 'comment_warn',
          type: 'flow-comment',
          position: { x: 900, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'No photo within the timeout: warn once with the current waypoint' }, // i18n-exempt
          },
        },
        {
          id: 'pulse',
          type: 'sensor-pwm-pulse',
          position: { x: 320, y: 90 },
          data: {
            definitionType: 'sensor-pwm-pulse',
            label: 'Hotshoe Pulse', // i18n-exempt
            category: 'sensors',
            propertyValues: { pin: 54 },
          },
        },
        {
          id: 'param_trigg',
          type: 'sensor-param-get',
          position: { x: 60, y: 370 },
          data: {
            definitionType: 'sensor-param-get',
            label: 'Trigger Distance', // i18n-exempt
            category: 'sensors',
            propertyValues: { param_name: 'CAM1_TRIGG_DIST' },
          },
        },
        {
          id: 'trigg_active',
          type: 'logic-compare',
          position: { x: 320, y: 370 },
          data: {
            definitionType: 'logic-compare',
            label: 'Dist > 0?', // i18n-exempt
            category: 'logic',
            propertyValues: { operator: '>' },
          },
        },
        {
          id: 'armed',
          type: 'sensor-armed',
          position: { x: 320, y: 500 },
          data: {
            definitionType: 'sensor-armed',
            label: 'Armed', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'gate_and',
          type: 'logic-and',
          position: { x: 580, y: 420 },
          data: {
            definitionType: 'logic-and',
            label: 'Armed AND triggering', // i18n-exempt
            category: 'logic',
            propertyValues: {},
          },
        },
        {
          id: 'watchdog',
          type: 'timing-watchdog',
          position: { x: 840, y: 250 },
          data: {
            definitionType: 'timing-watchdog',
            label: 'No photo timer', // i18n-exempt
            category: 'timing',
            propertyValues: { timeout_ms: 3000 },
          },
        },
        {
          id: 'warn_edge',
          type: 'timing-rising-edge',
          position: { x: 1080, y: 250 },
          data: {
            definitionType: 'timing-rising-edge',
            label: 'On first stall', // i18n-exempt
            category: 'timing',
            propertyValues: {},
          },
        },
        {
          id: 'wp',
          type: 'sensor-current-waypoint',
          position: { x: 1080, y: 400 },
          data: {
            definitionType: 'sensor-current-waypoint',
            label: 'Current WP', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'warn',
          type: 'action-gcs-text',
          position: { x: 1320, y: 250 },
          data: {
            definitionType: 'action-gcs-text',
            label: 'Warn no photo', // i18n-exempt
            category: 'actions',
            propertyValues: { message: 'CAM WATCHDOG: kein Foto bei WP ', severity: 4 }, // i18n-exempt
          },
        },
      ],
      edges: [
        { id: 'e3', source: 'param_trigg', target: 'trigg_active', sourceHandle: 'value', targetHandle: 'a' },
        { id: 'e4', source: 'trigg_active', target: 'gate_and', sourceHandle: 'result', targetHandle: 'a' },
        { id: 'e5', source: 'armed', target: 'gate_and', sourceHandle: 'is_armed', targetHandle: 'b' },
        { id: 'e6', source: 'pulse', target: 'watchdog', sourceHandle: 'pulse_seen', targetHandle: 'kick' },
        { id: 'e7', source: 'gate_and', target: 'watchdog', sourceHandle: 'result', targetHandle: 'enable' },
        { id: 'e8', source: 'watchdog', target: 'warn_edge', sourceHandle: 'expired', targetHandle: 'input' },
        { id: 'e9', source: 'warn_edge', target: 'warn', sourceHandle: 'triggered', targetHandle: 'trigger' },
        { id: 'e10', source: 'wp', target: 'warn', sourceHandle: 'index', targetHandle: 'value' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.75 },
    },
  },

  // ─── Custom Serial Telemetry ─────────────────────────────────
  {
    id: 'custom-serial-telemetry',
    name: 'Custom Serial Telemetry', // i18n-exempt
    description: 'Format position + battery into a custom text sentence with a Custom Lua node and stream it out a serial port and UDP once a second.', // i18n-exempt
    category: 'Utility',
    graph: {
      version: 1,
      name: 'Custom Serial Telemetry', // i18n-exempt
      description: 'Custom-formatted telemetry sentence over serial and UDP', // i18n-exempt
      runIntervalMs: 200,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      nodes: [
        // ── Annotations ──
        {
          id: 'comment_sense',
          type: 'flow-comment',
          position: { x: 40, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 1', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Read position and battery' }, // i18n-exempt
          },
        },
        {
          id: 'comment_format',
          type: 'flow-comment',
          position: { x: 420, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 2', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Custom Lua builds the message. Edit pins and code in the inspector.' }, // i18n-exempt
          },
        },
        {
          id: 'comment_send',
          type: 'flow-comment',
          position: { x: 800, y: 20 },
          data: {
            definitionType: 'flow-comment',
            label: 'Step 3', // i18n-exempt
            category: 'flow',
            propertyValues: { text: 'Rate-limit to 1 Hz, send over serial and UDP. Delete the output you do not need.' }, // i18n-exempt
          },
        },
        // ── Sensors ──
        {
          id: 'gps',
          type: 'sensor-gps',
          position: { x: 60, y: 100 },
          data: {
            definitionType: 'sensor-gps',
            label: 'GPS Position', // i18n-exempt
            category: 'sensors',
            propertyValues: {},
          },
        },
        {
          id: 'battery',
          type: 'sensor-battery',
          position: { x: 60, y: 280 },
          data: {
            definitionType: 'sensor-battery',
            label: 'Battery', // i18n-exempt
            category: 'sensors',
            propertyValues: { instance: 0 },
          },
        },
        // ── Format ──
        {
          id: 'format',
          type: 'flow-custom-lua',
          position: { x: 440, y: 120 },
          data: {
            definitionType: 'flow-custom-lua',
            label: 'Build Sentence', // i18n-exempt
            category: 'flow',
            propertyValues: {
              inputs: 'lat, lng, alt, volt',
              outputs: 'line',
              code: '-- Any Lua you like. Inputs are locals, return feeds the output pins.\nreturn string.format("$ADK,%.6f,%.6f,%.1f,%.2f", lat, lng, alt, volt)',
            },
          },
        },
        // ── Rate limit + outputs ──
        {
          id: 'timer',
          type: 'timing-run-every',
          position: { x: 440, y: 340 },
          data: {
            definitionType: 'timing-run-every',
            label: 'Every 1s', // i18n-exempt
            category: 'timing',
            propertyValues: { interval_ms: 1000 },
          },
        },
        {
          id: 'serial_out',
          type: 'action-serial-write',
          position: { x: 820, y: 100 },
          data: {
            definitionType: 'action-serial-write',
            label: 'Serial Out', // i18n-exempt
            category: 'actions',
            propertyValues: { instance: 0, baud: 57600, line_ending: 'lf' },
          },
        },
        {
          id: 'udp_out',
          type: 'action-socket-send',
          position: { x: 820, y: 290 },
          data: {
            definitionType: 'action-socket-send',
            label: 'UDP Out', // i18n-exempt
            category: 'actions',
            propertyValues: { protocol: 'udp', ip: '192.168.1.10', port: 14550 },
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'gps', target: 'format', sourceHandle: 'lat', targetHandle: 'lat' },
        { id: 'e2', source: 'gps', target: 'format', sourceHandle: 'lng', targetHandle: 'lng' },
        { id: 'e3', source: 'gps', target: 'format', sourceHandle: 'alt', targetHandle: 'alt' },
        { id: 'e4', source: 'battery', target: 'format', sourceHandle: 'voltage', targetHandle: 'volt' },
        { id: 'e5', source: 'timer', target: 'serial_out', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e6', source: 'format', target: 'serial_out', sourceHandle: 'line', targetHandle: 'data' },
        { id: 'e7', source: 'timer', target: 'udp_out', sourceHandle: 'flow', targetHandle: 'trigger' },
        { id: 'e8', source: 'format', target: 'udp_out', sourceHandle: 'line', targetHandle: 'data' },
      ],
      viewport: { x: 0, y: 0, zoom: 0.85 },
    },
  },
];
