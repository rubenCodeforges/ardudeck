/** A workspace layout = dockview grid + cockpit instruments, in-map split and Vision render mode. */

import { t } from '../../../shared/i18n/index.js';
import type { SerializedDockview } from 'dockview-react';
import type { PanelId } from '../panels';
import type { CameraRenderMode } from '../../../shared/camera-types';
import { useMapInstrumentsStore, sanitizeLayout, type InstrumentLayoutSnapshot } from '../../stores/map-instruments-store';
import { useMapSplitStore } from '../../stores/map-split-store';
import { useCameraStore } from '../../stores/camera-store';
import { PRESET_INSTRUMENT_LAYOUTS } from '../map/instruments/preset-layouts';

export interface WorkspaceExtras {
  /** Cockpit on screen when captured, custom (unsaved) arrangements included. */
  instruments: InstrumentLayoutSnapshot;
  /** Cockpit to restore when the split closes; null when the map was not split. */
  splitRestore: InstrumentLayoutSnapshot | null;
  /** Preset or saved instrument layout that was selected, if any. */
  instrumentPreset: string | null;
  split: { target: PanelId | null; ratio: number };
  renderMode: CameraRenderMode;
}

export interface WorkspaceLayoutData {
  v: 2;
  dock: SerializedDockview;
  /** Missing on a grid-only layout (older ones that were given a description later). */
  extras?: WorkspaceExtras;
  description?: string;
}

/** What capture and the built-ins produce: always with the cockpit, split and render mode. */
export type FullWorkspaceLayout = WorkspaceLayoutData & { extras: WorkspaceExtras };

export function isWorkspaceV2(data: unknown): data is WorkspaceLayoutData {
  return !!data && typeof data === 'object' && (data as { v?: unknown }).v === 2 && 'dock' in data;
}

/** The grid of any saved layout: v2 carries it under `dock`, older ones are the grid itself. */
export function dockOf(data: unknown): SerializedDockview {
  return (isWorkspaceV2(data) ? data.dock : data) as SerializedDockview;
}

/** Description of a saved layout, if it has one (only v2 layouts can). */
export function descriptionOf(data: unknown): string | undefined {
  return isWorkspaceV2(data) && data.description ? data.description : undefined;
}

export function captureWorkspace(dock: SerializedDockview, description?: string): FullWorkspaceLayout {
  const instruments = useMapInstrumentsStore.getState();
  const split = useMapSplitStore.getState();
  const trimmed = description?.trim();
  return {
    v: 2,
    dock,
    ...(trimmed ? { description: trimmed } : {}),
    extras: {
      instruments: instruments.captureLayoutSnapshot(),
      splitRestore: split.target ? instruments.splitSnapshot : null,
      instrumentPreset: instruments.activePreset,
      split: { target: split.target, ratio: split.ratio },
      renderMode: useCameraStore.getState().renderMode,
    },
  };
}

/** Restore everything a v2 layout carries besides the grid. Older layouts carry nothing. */
export function applyWorkspaceExtras(extras: WorkspaceExtras): void {
  useMapSplitStore.getState().applyFromLayout(extras.split.target, extras.split.ratio);
  useMapInstrumentsStore.getState().restoreWorkspace(extras.instruments, extras.splitRestore, extras.instrumentPreset);
  useCameraStore.getState().setRenderMode(extras.renderMode);
}

/** Same layout with a new description; an older grid-only layout keeps having no extras. */
export function withDescription(data: unknown, description: string): WorkspaceLayoutData {
  const trimmed = description.trim();
  const base: WorkspaceLayoutData = isWorkspaceV2(data) ? { ...data } : { v: 2, dock: data as SerializedDockview };
  delete base.description;
  return trimmed ? { ...base, description: trimmed } : base;
}

const EXPORT_KIND = 'workspace-layout';

export function exportPayload(name: string, data: unknown): string {
  return JSON.stringify({ app: 'ardudeck', kind: EXPORT_KIND, version: 2, name, layout: data }, null, 2);
}

export function exportFileName(name: string): string {
  return `${name.replace(/[^\w.-]+/g, '_')}.ardudeck-workspace.json`;
}

function isDock(v: unknown): v is SerializedDockview {
  if (!v || typeof v !== 'object') return false;
  const d = v as { grid?: unknown; panels?: unknown };
  return !!d.grid && typeof d.grid === 'object' && !!d.panels && typeof d.panels === 'object';
}

function sanitizeExtras(raw: unknown): WorkspaceExtras | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const instruments = sanitizeLayout(e.instruments);
  if (!instruments) return undefined;
  const split = (e.split ?? {}) as { target?: unknown; ratio?: unknown };
  return {
    instruments,
    splitRestore: e.splitRestore ? sanitizeLayout(e.splitRestore) : null,
    instrumentPreset: typeof e.instrumentPreset === 'string' ? e.instrumentPreset : null,
    split: {
      target: typeof split.target === 'string' && split.target !== 'map' ? (split.target as PanelId) : null,
      ratio: typeof split.ratio === 'number' ? split.ratio : 0.6,
    },
    renderMode: e.renderMode === 'synthetic' ? 'synthetic' : 'live',
  };
}

/** Parse a shared file. Returns the suggested name and a cleaned layout, or why it was refused. */
export function parseImport(raw: string): { name: string; layout: WorkspaceLayoutData } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: t('telemetry:layouts.importInvalidJson') };
  }
  const p = (parsed ?? {}) as { app?: unknown; kind?: unknown; name?: unknown; layout?: unknown };
  if (p.app !== 'ardudeck' || p.kind !== EXPORT_KIND) return { error: t('telemetry:layouts.importNotLayout') };
  const layout = p.layout;
  const dock = isWorkspaceV2(layout) ? layout.dock : layout;
  if (!isDock(dock)) return { error: t('telemetry:layouts.importNoPanels') };
  const extras = isWorkspaceV2(layout) ? sanitizeExtras(layout.extras) : undefined;
  const description = isWorkspaceV2(layout) && typeof layout.description === 'string' ? layout.description.trim() : '';
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : t('telemetry:layouts.importedName');
  return {
    name,
    layout: { v: 2, dock, ...(extras ? { extras } : {}), ...(description ? { description } : {}) },
  };
}

/** `name`, or `name (2)`, `name (3)`... whichever is free. */
export function uniqueLayoutName(name: string, taken: string[]): string {
  if (!taken.includes(name) && !isBuiltinLayout(name)) return name;
  for (let i = 2; ; i += 1) {
    const candidate = `${name} (${i})`;
    if (!taken.includes(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Built-in layouts
// ---------------------------------------------------------------------------

function presetCockpit(name: string): InstrumentLayoutSnapshot {
  const preset = PRESET_INSTRUMENT_LAYOUTS.find((p) => p.name === name);
  if (!preset) throw new Error(`Unknown instrument preset ${name}`); // i18n-exempt: internal invariant
  return preset.layout;
}

const PILOT_COCKPIT = 'Pilot cockpit'; // i18n-exempt: preset identifier

/** Pilot cockpit with the gauge bar centred and lifted clear of the edge, for the shorter mission map. */
function missionCockpit(): InstrumentLayoutSnapshot {
  const base = presetCockpit(PILOT_COCKPIT);
  return {
    ...base,
    positions: { ...base.positions, 'instrument:group:d1': { ax: 'center', ay: 'bottom', dx: 0, dy: 8, v: 4 } },
  };
}

// i18n-exempt: dockview titles are persisted with the layout
const MAP_PANEL = { id: 'map', contentComponent: 'MapPanel', title: 'Map' };

const PILOT_DOCK: SerializedDockview = {
  grid: {
    root: { type: 'branch', data: [{ type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 815 }], size: 1392 },
    width: 1392,
    height: 815,
    orientation: 'VERTICAL',
  },
  panels: { map: MAP_PANEL },
  activeGroup: '1',
} as SerializedDockview;

const FPV_DOCK: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 693 },
        { type: 'leaf', data: { views: ['camera'], activeView: 'camera', id: '2' }, size: 699 },
      ],
      size: 815,
    },
    width: 1392,
    height: 815,
    orientation: 'HORIZONTAL',
  },
  panels: { map: MAP_PANEL, camera: { id: 'camera', contentComponent: 'CameraPanel', title: 'Vision' } }, // i18n-exempt
  activeGroup: '1',
} as SerializedDockview;

const MISSION_DOCK: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 1012 },
            { type: 'leaf', data: { views: ['waypoints'], activeView: 'waypoints', id: '2' }, size: 380 },
          ],
          size: 575,
        },
        { type: 'leaf', data: { views: ['altitudeProfile'], activeView: 'altitudeProfile', id: '3' }, size: 240 },
      ],
      size: 1392,
    },
    width: 1392,
    height: 815,
    orientation: 'VERTICAL',
  },
  panels: {
    map: MAP_PANEL,
    // i18n-exempt: dockview titles are persisted with the layout
    waypoints: { id: 'waypoints', contentComponent: 'WaypointTablePanel', title: 'Waypoints' },
    altitudeProfile: { id: 'altitudeProfile', contentComponent: 'AltitudeProfilePanel', title: 'Altitude Profile' }, // i18n-exempt
  },
  activeGroup: '1',
} as SerializedDockview;

export interface BuiltinLayout {
  labelKey: string;
  descriptionKey: string;
  /** Only offered when the vehicle can fly missions. */
  needsMissions?: boolean;
  data: () => FullWorkspaceLayout;
}

export const BUILTIN_LAYOUTS = {
  pilotView: {
    labelKey: 'telemetry:layouts.pilotLabel',
    descriptionKey: 'telemetry:layouts.pilotDescription',
    data: () => ({
      v: 2,
      dock: PILOT_DOCK,
      extras: {
        instruments: presetCockpit(PILOT_COCKPIT),
        splitRestore: presetCockpit(PILOT_COCKPIT),
        instrumentPreset: PILOT_COCKPIT,
        split: { target: 'camera', ratio: 0.5 },
        renderMode: 'synthetic',
      },
    }),
  },
  fpv: {
    labelKey: 'telemetry:layouts.fpvLabel',
    descriptionKey: 'telemetry:layouts.fpvDescription',
    data: () => ({
      v: 2,
      dock: FPV_DOCK,
      extras: {
        instruments: presetCockpit(PILOT_COCKPIT),
        splitRestore: null,
        instrumentPreset: PILOT_COCKPIT,
        split: { target: null, ratio: 0.6 },
        renderMode: useCameraStore.getState().renderMode,
      },
    }),
  },
  mission: {
    labelKey: 'telemetry:layouts.missionLabel',
    descriptionKey: 'telemetry:layouts.missionDescription',
    needsMissions: true,
    data: () => ({
      v: 2,
      dock: MISSION_DOCK,
      extras: {
        instruments: missionCockpit(),
        splitRestore: null,
        instrumentPreset: PILOT_COCKPIT,
        split: { target: null, ratio: 0.6 },
        renderMode: useCameraStore.getState().renderMode,
      },
    }),
  },
} satisfies Record<string, BuiltinLayout>;

export type BuiltinLayoutKey = keyof typeof BUILTIN_LAYOUTS;

export const DEFAULT_LAYOUT: BuiltinLayoutKey = 'pilotView';

export function isBuiltinLayout(name: string): name is BuiltinLayoutKey {
  return name in BUILTIN_LAYOUTS;
}
