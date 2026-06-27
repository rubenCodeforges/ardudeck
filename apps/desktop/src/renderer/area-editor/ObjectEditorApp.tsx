/**
 * ObjectEditorApp — object-based Area Editor shell.
 *
 * Layout (pro-editor convention): a vertical TOOL RAIL on the left, a slim
 * top bar with branding + the active tool's options + global actions, the map
 * in the center, and a right column with the Objects panel above the Flight
 * Briefing. Rendered via the detached-window system (componentId "area-editor").
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import { ObjectEditorMap } from './ObjectEditorMap';
import { ObjectEditorHud } from './ObjectEditorHud';
import { ObjectsPanel } from './ObjectsPanel';
import { ObjectEditorContextMenu } from './ObjectEditorContextMenu';
import { AreaEditorLayers } from './AreaEditorLayers';
import { GoToLocation } from './GoToLocation';
import { attachObjectInteractions } from './attachObjectInteractions';
import { attachWindLayer } from './attachWindLayer';
import { useAreaEditorLayersStore } from './area-editor-layers-store';
import { WindControls } from '../components/map/overlays/WindControls';
import { useObjectsStore, type AreaTool } from './objects-store';
import { useSurveyStore } from '../stores/survey-store';
import { objectWorldRing, objectWorldHoles } from './area-object';
import { parseGisArea } from '../../shared/gis-area-import';
import { useSettingsStore, type ThemePreference } from '../stores/settings-store';
import {
  distanceValueFromMeters,
  toMetersFromDistanceUnit,
  UNIT_LABELS,
  type DistanceUnit,
} from '../../shared/user-units.js';
import logoImage from '../assets/logo.png';

// ---- icons (16px line) ----
const S = { className: 'w-4 h-4', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICursor = () => <svg {...S}><path d="M4 3l7.07 16.97 2.51-7.39 7.39-2.51L4 3z" /></svg>;
const IPolygon = () => <svg {...S}><path d="M12 3l8 6-3 9H7L4 9z" /></svg>;
const ICorridor = () => <svg {...S}><path d="M4 18l5-5 4 4 7-7" /><circle cx="4" cy="18" r="1.4" /><circle cx="20" cy="10" r="1.4" /></svg>;
const IRect = () => <svg {...S}><rect x="3" y="6" width="18" height="12" rx="1" /></svg>;
const ICircle = () => <svg {...S}><circle cx="12" cy="12" r="8" /></svg>;
const IEdit = () => <svg {...S}><path d="M6 18L12 5l6 9z" /><rect x="4" y="16" width="4" height="4" rx="0.5" fill="currentColor" /><rect x="10" y="3" width="4" height="4" rx="0.5" fill="currentColor" /><rect x="16" y="13" width="4" height="4" rx="0.5" fill="currentColor" /></svg>;
const IHole = () => <svg {...S}><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /></svg>;
const ISplit = () => <svg {...S}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M8 7.5L20 16M8 16.5L20 8" /></svg>;
const IRuler = () => <svg {...S}><path d="M3 16.5L16.5 3l4.5 4.5L7.5 21z" /><path d="M8 8l2 2M11 5l2 2M5 11l2 2" /></svg>;
const IImport = () => <svg {...S}><path d="M12 3v12M8 11l4 4 4-4M4 20h16" /></svg>;
const IExportKml = () => <svg {...S}><path d="M12 21V9M8 13l4-4 4 4M4 5h16" /></svg>;
const IExportKmz = () => <svg {...S}><rect x="4" y="8" width="16" height="12" rx="1" /><path d="M4 12h16M9 8V5h6v3" /></svg>;
const ISend = () => <svg {...S}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>;
const IMoon = () => <svg {...S}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>;
const ISun = () => <svg {...S}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
const IMonitor = () => <svg {...S}><rect x="3" y="4" width="18" height="12" rx="1" /><path d="M8 20h8M12 16v4" /></svg>;
const IUndo = () => <svg {...S}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>;
const IRedo = () => <svg {...S}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>;

const THEME_CYCLE: ThemePreference[] = ['dark', 'light', 'system'];
const THEME_ICON: Record<ThemePreference, () => JSX.Element> = { dark: IMoon, light: ISun, system: IMonitor };
const THEME_TIP: Record<ThemePreference, string> = {
  dark: 'Theme: Dark (click for Light)', light: 'Theme: Light (click for System)', system: 'Theme: System (click for Dark)',
};

const TOOLS: { id: AreaTool; icon: () => JSX.Element; tip: string }[] = [
  { id: 'select', icon: ICursor, tip: 'Select & transform — move, rotate, scale' },
  { id: 'polygon', icon: IPolygon, tip: 'Draw area — click points, double-click to finish' },
  { id: 'corridor', icon: ICorridor, tip: 'Draw corridor — a centerline for a linear survey' },
  { id: 'rectangle', icon: IRect, tip: 'Rectangle — drag on the map' },
  { id: 'circle', icon: ICircle, tip: 'Circle — drag from the center' },
  { id: 'edit', icon: IEdit, tip: 'Edit points of the selected object' },
  { id: 'hole', icon: IHole, tip: 'Cut a hole — select an area, then click an inner ring (double-click to finish)' },
  { id: 'split', icon: ISplit, tip: 'Split — select an area, then draw a line across it (two clicks)' },
  { id: 'measure', icon: IRuler, tip: 'Measure distance & area' },
];

function ActionButton({ tip, onClick, disabled = false, primary = false, children }: {
  tip: string; onClick: () => void; disabled?: boolean; primary?: boolean; children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button" data-tip={tip} aria-label={tip} disabled={disabled} onClick={onClick}
      className={
        'p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' +
        (primary ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-surface-raised text-content hover:brightness-125')
      }
    >
      {children}
    </button>
  );
}

function clampMin(value: number, min: number): number {
  return Math.max(min, value);
}

function DistanceDraftInput({
  valueMeters,
  distanceUnit,
  minMeters,
  stepMeters,
  ariaLabel,
  className,
  onCommit,
}: {
  valueMeters: number;
  distanceUnit: DistanceUnit;
  minMeters: number;
  stepMeters: number;
  ariaLabel: string;
  className: string;
  onCommit: (meters: number) => void;
}): JSX.Element {
  const displayValue = distanceValueFromMeters(valueMeters, distanceUnit);
  const minDisplay = distanceValueFromMeters(minMeters, distanceUnit);
  const stepDisplay = distanceValueFromMeters(stepMeters, distanceUnit);
  const [draft, setDraft] = useState(() => String(displayValue));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(displayValue));
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(String(distanceValueFromMeters(valueMeters, distanceUnit)));
  }, [distanceUnit, valueMeters]);

  const commitDisplay = useCallback((display: number) => {
    const clamped = clampMin(display, minDisplay);
    onCommit(toMetersFromDistanceUnit(clamped, distanceUnit));
    setDraft(String(clamped));
  }, [distanceUnit, minDisplay, onCommit]);

  return (
    <input
      type="number"
      min={minDisplay}
      step={stepDisplay}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextDraft = e.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === '') return;
        const parsed = Number(nextDraft);
        if (!Number.isFinite(parsed) || parsed < minDisplay) return;
        onCommit(toMetersFromDistanceUnit(parsed, distanceUnit));
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        const parsed = Number(draft);
        if (draft.trim() === '' || !Number.isFinite(parsed)) {
          resetDraft();
          return;
        }
        commitDisplay(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          resetDraft();
          e.currentTarget.blur();
        }
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
}

export function ObjectEditorApp(): JSX.Element {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const tool = useObjectsStore((s) => s.tool);
  const objects = useObjectsStore((s) => s.objects);
  const selectedId = useObjectsStore((s) => s.selectedId);
  const corridorWidthM = useObjectsStore((s) => s.corridorWidthM);
  const measurePoints = useObjectsStore((s) => s.measurePoints);
  const canUndo = useObjectsStore((s) => s.past.length > 0);
  const canRedo = useObjectsStore((s) => s.future.length > 0);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const [sent, setSent] = useState(false);
  const [bufferM, setBufferM] = useState(10);

  const { setTool, setCorridorWidth, clearMeasure, loadWorldRings, bufferSelected, undo, redo } = useObjectsStore.getState();

  const windOn = useAreaEditorLayersStore((s) => s.overlays.wind);

  const handleMapReady = useCallback((map: maplibregl.Map) => {
    const c1 = attachObjectInteractions(map);
    const c2 = attachWindLayer(map);
    setMap(map);
    cleanupRef.current = () => { c1(); c2(); };
  }, []);
  useEffect(() => () => { cleanupRef.current?.(); cleanupRef.current = null; }, []);
  useEffect(() => { setSent(false); }, [objects]);

  // Editor keyboard shortcuts: undo/redo and delete the selected element.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const st = useObjectsStore.getState();
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) st.redo(); else st.undo();
      } else if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        st.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selectedMeasure) { e.preventDefault(); st.clearMeasure(); }
        else if (st.selectedId) { e.preventDefault(); st.deleteSelected(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const selectedIsCorridor = selected?.type === 'corridor';
  const validObjects = objects.filter((o) => o.visible && objectWorldRing(o).length >= (o.type === 'corridor' ? 2 : 3));
  const hasValid = validObjects.length > 0;

  const cycleTheme = useCallback(() => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
  }, [theme, setTheme]);
  const ThemeIcon = THEME_ICON[theme] ?? IMoon;

  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSend = useCallback(() => {
    // Carry the editor's survey config so the mission reproduces exactly what
    // the briefing showed (same camera/overlaps/altitude). polygon/holes are
    // per-area, supplied separately below.
    const { polygon: _p, holes: _h, ...editorConfig } =
      useSurveyStore.getState().config as Record<string, unknown>;
    const areas = useObjectsStore.getState().objects
      .filter((o) => o.visible && objectWorldRing(o).length >= (o.type === 'corridor' ? 2 : 3))
      .map((o) =>
        o.type === 'corridor'
          ? { polygon: objectWorldRing(o), kind: 'corridor' as const, corridorWidth: o.corridorWidthM ?? 60, config: editorConfig }
          : { polygon: objectWorldRing(o), holes: objectWorldHoles(o), config: editorConfig },
      );
    if (areas.length === 0) return;
    void window.electronAPI.commitAreas(areas);
    // Show a brief "Sent" confirmation, then re-enable so the user can send
    // again (e.g. after tweaking the mission and coming back).
    setSent(true);
    if (sentTimer.current) clearTimeout(sentTimer.current);
    sentTimer.current = setTimeout(() => setSent(false), 1800);
  }, []);
  useEffect(() => () => { if (sentTimer.current) clearTimeout(sentTimer.current); }, []);

  const handleImport = useCallback(async () => {
    try {
      const result = await window.electronAPI.importSurveyArea();
      if (!result.success || !result.content || !result.format) return;
      const areas = parseGisArea(result.content, result.format);
      if (areas.length === 0) return;
      loadWorldRings(areas.map((a) => ({ ring: a.polygon, holes: a.holes ?? [], type: 'polygon' as const })));
    } catch (err) {
      console.warn('[ObjectEditor] import failed:', err);
    }
  }, [loadWorldRings]);

  const handleExport = useCallback(async (format: 'kml' | 'kmz') => {
    try {
      const exportAreas = useObjectsStore.getState().objects
        .filter((o) => o.type !== 'corridor' && o.visible && objectWorldRing(o).length >= 3)
        .map((o, i) => ({ name: o.name || `Area ${i + 1}`, polygon: objectWorldRing(o), holes: objectWorldHoles(o) }));
      if (exportAreas.length === 0) return;
      await window.electronAPI.exportAreasKml(exportAreas, format);
    } catch (err) {
      console.warn('[ObjectEditor] export failed:', err);
    }
  }, []);

  return (
    <div data-testid="object-editor-shell" className="h-full w-full flex flex-col overflow-hidden bg-surface-base text-content">
      {/* Top bar */}
      <div className="flex-shrink-0 h-12 flex items-center gap-3 px-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-2 shrink-0">
          <img src={logoImage} alt="ArduDeck" className="h-7 w-7 rounded-md object-cover" />
          <span className="text-sm font-semibold tracking-tight">ArduDeck</span>
        </div>

        {/* Context options for the active tool */}
        <div className="flex items-center gap-2 min-w-0">
          {(tool === 'corridor' || selectedIsCorridor) && (
            <div className="flex items-center gap-1.5" data-tip="Corridor swath width">
              <span className="text-content-tertiary"><ICorridor /></span>
              <DistanceDraftInput
                valueMeters={corridorWidthM}
                distanceUnit={distanceUnit}
                minMeters={1}
                stepMeters={5}
                onCommit={setCorridorWidth}
                className="w-16 h-7 px-2 rounded bg-surface-input border border-subtle text-content text-xs"
                ariaLabel={`Corridor width in ${UNIT_LABELS.distance[distanceUnit]}`}
              />
              <span className="text-xs text-content-tertiary">{UNIT_LABELS.distance[distanceUnit]}</span>
            </div>
          )}
          {tool === 'hole' && (
            <span className="text-xs text-content-secondary">
              Click inside an area to cut a hole, double-click to finish
            </span>
          )}
          {tool === 'split' && (
            <span className="text-xs text-content-secondary">
              Draw a line across an area to slice it (two clicks)
            </span>
          )}
          {tool === 'select' && selected && !selectedIsCorridor && (
            <div className="flex items-center gap-1" data-tip="Grow or shrink the selected area by a margin">
              <span className="text-xs text-content-tertiary">Buffer</span>
              <button type="button" aria-label="Shrink" onClick={() => bufferSelected(-bufferM)}
                className="w-6 h-7 inline-flex items-center justify-center rounded bg-surface-raised text-content hover:brightness-125">−</button>
              <DistanceDraftInput
                valueMeters={bufferM}
                distanceUnit={distanceUnit}
                minMeters={1}
                stepMeters={5}
                onCommit={setBufferM}
                className="w-14 h-7 px-2 rounded bg-surface-input border border-subtle text-content text-xs"
                ariaLabel={`Buffer distance in ${UNIT_LABELS.distance[distanceUnit]}`}
              />
              <span className="text-xs text-content-tertiary">{UNIT_LABELS.distance[distanceUnit]}</span>
              <button type="button" aria-label="Grow" onClick={() => bufferSelected(bufferM)}
                className="w-6 h-7 inline-flex items-center justify-center rounded bg-surface-raised text-content hover:brightness-125">+</button>
            </div>
          )}
          {tool === 'measure' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-content-secondary">Click to measure · double-click to finish</span>
              {measurePoints.length > 0 && (
                <button type="button" onClick={clearMeasure} className="text-xs text-content-secondary hover:text-content underline-offset-2 hover:underline">Clear</button>
              )}
            </div>
          )}
        </div>

        {/* Global actions */}
        <div className="ml-auto flex items-center gap-1">
          <ActionButton tip="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><IUndo /></ActionButton>
          <ActionButton tip="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo}><IRedo /></ActionButton>
          <div className="w-px h-6 bg-subtle mx-1" />
          <ActionButton tip="Import KML / KMZ" onClick={() => void handleImport()}><IImport /></ActionButton>
          <ActionButton tip="Export areas as KML" disabled={!hasValid} onClick={() => void handleExport('kml')}><IExportKml /></ActionButton>
          <ActionButton tip="Export areas as KMZ" disabled={!hasValid} onClick={() => void handleExport('kmz')}><IExportKmz /></ActionButton>
          <button
            type="button" onClick={handleSend} disabled={!hasValid || sent}
            data-tip="Send these areas to the mission planner"
            className="ml-1 h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ISend />{sent ? 'Sent' : 'Send to mission'}
          </button>
          <div className="w-px h-6 bg-subtle mx-1" />
          <ActionButton tip={THEME_TIP[theme]} onClick={cycleTheme}><ThemeIcon /></ActionButton>
        </div>
      </div>

      {/* Body: rail + map + right column */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Tool rail */}
        <div className="w-12 flex-shrink-0 flex flex-col items-center gap-1 py-2 border-r border-subtle bg-surface-nav">
          {TOOLS.map(({ id, icon: Icon, tip }) => (
            <button
              key={id}
              type="button"
              data-tip={tip}
              aria-label={tip}
              onClick={() => setTool(id)}
              className={
                'w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors ' +
                (tool === id ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised hover:text-content')
              }
            >
              <Icon />
            </button>
          ))}
        </div>

        {/* Map */}
        <div className="relative flex-1 min-w-0">
          <ObjectEditorMap onMapReady={handleMapReady} />
          <GoToLocation map={map} />
          <AreaEditorLayers />
          {windOn && <WindControls />}
        </div>

        {/* Right column: objects + briefing */}
        <div className="w-72 flex-shrink-0 flex flex-col border-l border-subtle bg-surface overflow-hidden">
          <div className="h-1/2 min-h-0 border-b border-subtle"><ObjectsPanel /></div>
          <div className="h-1/2 min-h-0"><ObjectEditorHud /></div>
        </div>
      </div>

      <ObjectEditorContextMenu />
    </div>
  );
}
