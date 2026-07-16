/**
 * Registry of components addressable by the detached-window system.
 *
 * Adding a pop-out for a new panel = add one line here and wrap the inline
 * site with <Detachable componentId="…">. The main process never sees React;
 * it just passes the componentId string through, so this file is the single
 * place renderer-side that decides what each id renders.
 *
 * Components must accept all their props from `props` (URL-encoded JSON) and
 * make no assumptions about parent layout — they should fill 100% of their
 * container with their own scrolling/sizing.
 */

import type { ComponentType } from 'react';
import { AttitudePanel } from '../components/panels/AttitudePanel';
import { BatteryPanel } from '../components/panels/BatteryPanel';
import { AltitudePanel } from '../components/panels/AltitudePanel';
import { GpsPanel } from '../components/panels/GpsPanel';
import { SpeedPanel } from '../components/panels/SpeedPanel';
import { VelocityPanel } from '../components/panels/VelocityPanel';
import { PositionPanel } from '../components/panels/PositionPanel';
import { FlightModePanel } from '../components/panels/FlightModePanel';
import { FlightControlPanel } from '../components/panels/FlightControlPanel';
import { MessagesPanel } from '../components/panels/MessagesPanel';
import { MapPanel } from '../components/panels/MapPanel';
import { TelemetryDashboard } from '../components/telemetry/TelemetryDashboard';
import { MavlinkInspectorView } from '../components/inspector/MavlinkInspectorView';
import { InspectorGraphsView } from '../components/inspector/InspectorGraphsView';
import { ObjectEditorApp } from '../area-editor/ObjectEditorApp';
import SimWorldView from '../components/sim/SimWorldView';
import { CameraPanel } from '../components/camera/CameraPanel';
import { SafetyMonitorPanel } from '../components/panels/SafetyMonitorPanel';
import { NtripPanel } from '../components/panels/NtripPanel';

export interface DetachedComponentDef {
  /** React component to render. Receives `props` as-is from the URL. */
  Component: ComponentType<Record<string, unknown>>;
  /** Sensible default bounds when there's no persisted size. */
  defaultBounds: { width: number; height: number };
}

export const COMPONENT_REGISTRY: Record<string, DetachedComponentDef> = {
  inspector: { Component: MavlinkInspectorView as ComponentType<Record<string, unknown>>, defaultBounds: { width: 1200, height: 800 } },
  'inspector-graphs': { Component: InspectorGraphsView, defaultBounds: { width: 1000, height: 700 } },

  attitude: { Component: AttitudePanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 480, height: 520 } },
  battery: { Component: BatteryPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 420, height: 360 } },
  altitude: { Component: AltitudePanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 360, height: 280 } },
  gps: { Component: GpsPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 360, height: 280 } },
  speed: { Component: SpeedPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 360, height: 280 } },
  velocity: { Component: VelocityPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 360, height: 280 } },
  position: { Component: PositionPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 360, height: 280 } },
  'flight-mode': { Component: FlightModePanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 320, height: 220 } },
  'flight-control': { Component: FlightControlPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 480, height: 360 } },
  messages: { Component: MessagesPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 560, height: 420 } },
  map: { Component: MapPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 960, height: 720 } },
  'telemetry-dashboard': { Component: TelemetryDashboard as ComponentType<Record<string, unknown>>, defaultBounds: { width: 1280, height: 800 } },
  'area-editor': { Component: ObjectEditorApp as ComponentType<Record<string, unknown>>, defaultBounds: { width: 1400, height: 900 } },
  'sim-world': { Component: SimWorldView as ComponentType<Record<string, unknown>>, defaultBounds: { width: 1280, height: 800 } },
  camera: { Component: CameraPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 960, height: 600 } },
  'safety-monitor': { Component: SafetyMonitorPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 420, height: 520 } },
  rtk: { Component: NtripPanel as ComponentType<Record<string, unknown>>, defaultBounds: { width: 420, height: 560 } },
};

export function getDetachedComponent(componentId: string): DetachedComponentDef | undefined {
  return COMPONENT_REGISTRY[componentId];
}
