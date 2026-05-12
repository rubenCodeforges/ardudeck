/**
 * Survey Config Panel — settings UI for the survey grid planner.
 *
 * Rendered as a dockable panel (sibling tab of Waypoints in MissionPlanningView).
 * Renders nothing when no polygon has been drawn yet, so the empty state is
 * the dock tab itself with no content fields shown.
 *
 * Layout philosophy:
 *  - Top: Template dropdown + draw/clear icons (compact toolbar)
 *  - Always-visible essentials: Camera (or Corridor), Movement, Pattern
 *  - Advanced: collapsed by default, contains Overlap, Grid angle/overshoot,
 *    Show footprints toggle. Power users open once and it sticks for the session.
 *  - Stats + Insert button pinned at the bottom outside the scroll area.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSurveyStore } from '../../stores/survey-store';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { CameraPresetSelector } from './CameraPresetSelector';
import { SurveyStatsPanel } from './SurveyStatsPanel';
import { surveyToMissionItems } from './mission-builder';
import {
  BUILTIN_SURVEY_PRESETS,
  captureCurrentAsPresetConfig,
  makeUserPreset,
  type SurveyPreset,
} from './survey-presets';
import type { SurveyPattern, CameraPreset, AltitudeReference, GroundPattern } from './survey-types';
import type { PersistedSurveyPreset } from '../../../shared/ipc-channels';

// Pattern catalog. Each entry advertises which modes it applies to so the UI
// can filter without scattering conditional logic across the component.
const ALL_PATTERN_OPTIONS: {
  id: SurveyPattern;
  label: string;
  description: string;
  modes: ('camera' | 'mower')[];
}[] = [
  { id: 'grid', label: 'Grid', description: 'Parallel back-and-forth lines', modes: ['camera', 'mower'] },
  { id: 'crosshatch', label: 'Crosshatch', description: 'Two perpendicular grid passes', modes: ['camera', 'mower'] },
  { id: 'circular', label: 'Circular', description: 'Concentric rings around centroid', modes: ['camera'] },
  { id: 'spiral', label: 'Spiral', description: 'Polygon-aware inward/outward spiral', modes: ['mower'] },
  { id: 'perimeter-fill', label: 'Perimeter + Fill', description: 'Edge passes then grid interior', modes: ['mower'] },
];

const GROUND_PATTERN_OPTIONS: { id: GroundPattern; label: string; description: string }[] = [
  { id: 'boustrophedon', label: 'Zigzag', description: 'U-turn at line ends (skid-steer rovers)' },
  { id: 'reverse-alternating', label: 'Reverse', description: 'Drive forward then reverse — no U-turns (Ackermann/car-like rovers, needs ArduRover DO_SET_REVERSE support)' },
];

const ALT_REF_OPTIONS: { id: AltitudeReference; label: string; description: string }[] = [
  { id: 'relative', label: 'Relative', description: 'Altitude relative to home position' },
  { id: 'terrain', label: 'Terrain', description: 'Altitude above terrain (AGL) at each point' },
  { id: 'asl', label: 'ASL', description: 'Altitude above mean sea level' },
];

// Rehydrate a persisted preset blob from settings into a typed SurveyPreset.
// The persisted form is intentionally loose (Record<string, unknown>) so the
// shared module doesn't import renderer-only types; we cast here at the edge.
function rehydrateUserPreset(p: PersistedSurveyPreset): SurveyPreset {
  return {
    id: p.id,
    name: p.name,
    description: p.description || 'Saved preset',
    tag: 'Custom',
    isUserDefined: true,
    config: p.config as SurveyPreset['config'],
    ...(p.camera ? { camera: p.camera as unknown as CameraPreset } : {}),
  };
}

export function SurveyConfigPanel() {
  const polygon = useSurveyStore((s) => s.polygon);
  const config = useSurveyStore((s) => s.config);
  const result = useSurveyStore((s) => s.result);
  const showFootprints = useSurveyStore((s) => s.showFootprints);

  const setPattern = useSurveyStore((s) => s.setPattern);
  const setAltitude = useSurveyStore((s) => s.setAltitude);
  const setSpeed = useSurveyStore((s) => s.setSpeed);
  const setFrontOverlap = useSurveyStore((s) => s.setFrontOverlap);
  const setSideOverlap = useSurveyStore((s) => s.setSideOverlap);
  const setCamera = useSurveyStore((s) => s.setCamera);
  const setGridAngle = useSurveyStore((s) => s.setGridAngle);
  const setOvershoot = useSurveyStore((s) => s.setOvershoot);
  const setAltitudeReference = useSurveyStore((s) => s.setAltitudeReference);
  const setShowFootprints = useSurveyStore((s) => s.setShowFootprints);
  const setGroundPattern = useSurveyStore((s) => s.setGroundPattern);
  const setSpiralDirection = useSurveyStore((s) => s.setSpiralDirection);
  const setPerimeterPasses = useSurveyStore((s) => s.setPerimeterPasses);
  const startDrawing = useSurveyStore((s) => s.startDrawing);
  const clearSurvey = useSurveyStore((s) => s.clearSurvey);
  const applyPresetConfig = useSurveyStore((s) => s.applyPresetConfig);

  const insertMissionItems = useMissionStore((s) => s.insertMissionItems);

  // Preset state lives in settings-store (persisted via electron-store).
  const userPresets = useSettingsStore((s) => s.surveyPresets);
  const lastPresetId = useSettingsStore((s) => s.lastSurveyPresetId);
  const saveSurveyPreset = useSettingsStore((s) => s.saveSurveyPreset);
  const removeSurveyPreset = useSettingsStore((s) => s.removeSurveyPreset);
  const setLastSurveyPresetId = useSettingsStore((s) => s.setLastSurveyPresetId);

  const [isCustomCamera, setIsCustomCamera] = useState(config.camera.name === 'Custom');
  const [isManualCamera, setIsManualCamera] = useState(config.camera.name === 'Manual');
  const [customCamera, setCustomCamera] = useState<CameraPreset>(config.camera);
  const [insertSuccess, setInsertSuccess] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Combined preset list: built-ins first, user-defined below.
  const allPresets: SurveyPreset[] = [
    ...BUILTIN_SURVEY_PRESETS,
    ...userPresets.map(rehydrateUserPreset),
  ];

  const handleCameraChange = useCallback((preset: CameraPreset) => {
    const nextIsManual = preset.name === 'Manual';
    setIsCustomCamera(preset.name === 'Custom');
    setIsManualCamera(nextIsManual);
    setCustomCamera(preset);
    setCamera(preset);
    // If the pattern we're holding doesn't apply in the new mode, snap it to
    // grid so the Pattern selector always shows an active button. Without
    // this, switching camera→mower while on 'circular' (camera-only) leaves
    // the row of buttons with nothing highlighted.
    const mode = nextIsManual ? 'mower' : 'camera';
    const currentValid = ALL_PATTERN_OPTIONS.find((o) => o.id === config.pattern)?.modes.includes(mode);
    if (!currentValid) setPattern('grid');
  }, [setCamera, config.pattern, setPattern]);

  const handleCustomField = useCallback((field: keyof CameraPreset, value: number) => {
    const updated = { ...customCamera, [field]: value };
    setCustomCamera(updated);
    setCamera(updated);
  }, [customCamera, setCamera]);

  const handleManualCorridorChange = useCallback((value: number) => {
    const updated = { ...customCamera, manualCorridorWidth: value };
    setCustomCamera(updated);
    setCamera(updated);
  }, [customCamera, setCamera]);

  const handlePresetSelect = useCallback((preset: SurveyPreset) => {
    // The store action applies config (and camera, when present) atomically
    // and regenerates the survey result. Camera change also has to update the
    // local isCustom/isManual flags so the right detail inputs show up.
    applyPresetConfig(preset.config, preset.camera);
    const nextIsManual = preset.camera ? preset.camera.name === 'Manual' : isManualCamera;
    if (preset.camera) {
      setIsCustomCamera(preset.camera.name === 'Custom');
      setIsManualCamera(nextIsManual);
      setCustomCamera(preset.camera);
    }
    // Pattern is taken from preset.config when set, but if the preset didn't
    // specify one we may now be in a different mode with an incompatible
    // pattern (e.g. circular carried over from camera→mower). Snap to grid.
    const resolvedPattern = preset.config.pattern ?? config.pattern;
    const mode = nextIsManual ? 'mower' : 'camera';
    const valid = ALL_PATTERN_OPTIONS.find((o) => o.id === resolvedPattern)?.modes.includes(mode);
    if (!valid) setPattern('grid');
    setLastSurveyPresetId(preset.id);
  }, [applyPresetConfig, isManualCamera, config.pattern, setPattern, setLastSurveyPresetId]);

  const handleSavePreset = useCallback(() => {
    // Simple prompt for the name — full dialog is overkill for this. If the
    // user cancels we bail; empty names are also rejected.
    const name = window.prompt('Name this preset:', `My preset ${userPresets.length + 1}`);
    if (!name || !name.trim()) return;
    const preset = makeUserPreset(
      name.trim(),
      captureCurrentAsPresetConfig({ ...config, polygon: [] }),
      // Only persist camera details if the user is on a non-built-in camera —
      // otherwise loading the preset on a different vehicle profile shouldn't
      // forcibly swap the camera back.
      (isCustomCamera || isManualCamera) ? config.camera : undefined,
    );
    saveSurveyPreset({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      tag: preset.tag,
      isUserDefined: true,
      config: preset.config as unknown as Record<string, unknown>,
      ...(preset.camera ? { camera: preset.camera as unknown as Record<string, unknown> } : {}),
    });
    setLastSurveyPresetId(preset.id);
  }, [config, isCustomCamera, isManualCamera, userPresets.length, saveSurveyPreset, setLastSurveyPresetId]);

  const handleDeletePreset = useCallback((id: string) => {
    if (!window.confirm('Delete this preset?')) return;
    removeSurveyPreset(id);
  }, [removeSurveyPreset]);

  const handleInsertSurvey = useCallback(() => {
    if (!result || !polygon) return;
    const fullConfig = { ...config, polygon };
    const items = surveyToMissionItems(result, fullConfig);
    if (items.length === 0) return;

    insertMissionItems(items);

    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 2000);
  }, [result, polygon, config, insertMissionItems]);

  // Empty-state copy when no polygon yet — guides the user back to the map.
  if (!polygon) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-content-secondary bg-surface">
        <svg className="w-10 h-10 mb-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <p className="text-sm font-medium mb-1 text-content">No survey polygon</p>
        <p className="text-xs text-content-tertiary max-w-[14rem]">
          Click the Survey button on the map toolbar, then draw a polygon to plan a grid.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Top toolbar: template picker + redraw/clear icons.
          Tab title comes from dockview, no need to repeat "Survey Grid" here. */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-subtle flex-shrink-0">
        <div className="flex-1 min-w-0">
          <PresetDropdown
            presets={allPresets}
            selectedId={lastPresetId}
            onSelect={handlePresetSelect}
            onDelete={handleDeletePreset}
          />
        </div>
        <button
          onClick={handleSavePreset}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Save current settings as a preset"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 4h11l3 3v13H5z M9 4v5h6V4 M9 17h6" />
          </svg>
        </button>
        <button
          onClick={startDrawing}
          className="p-1.5 text-content-secondary hover:text-purple-400 transition-colors"
          title="Redraw polygon"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={clearSurvey}
          className="p-1.5 text-content-secondary hover:text-red-400 transition-colors"
          title="Clear survey"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto flex-1 min-h-0">
        {/* Camera Section */}
        <Section title={isManualCamera ? 'Corridor' : 'Camera'}>
          <CameraPresetSelector value={config.camera} onChange={handleCameraChange} />
          {isCustomCamera && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <NumberInput label="Sensor W (mm)" value={customCamera.sensorWidth} onChange={(v) => handleCustomField('sensorWidth', v)} min={1} max={100} step={0.1} />
              <NumberInput label="Sensor H (mm)" value={customCamera.sensorHeight} onChange={(v) => handleCustomField('sensorHeight', v)} min={1} max={100} step={0.1} />
              <NumberInput label="Image W (px)" value={customCamera.imageWidth} onChange={(v) => handleCustomField('imageWidth', v)} min={100} max={20000} step={1} />
              <NumberInput label="Image H (px)" value={customCamera.imageHeight} onChange={(v) => handleCustomField('imageHeight', v)} min={100} max={20000} step={1} />
              <NumberInput label="Focal (mm)" value={customCamera.focalLength} onChange={(v) => handleCustomField('focalLength', v)} min={1} max={200} step={0.1} />
            </div>
          )}
          {isManualCamera && (
            <div className="mt-2">
              <NumberInput
                label="Corridor width (m)"
                value={customCamera.manualCorridorWidth ?? 1.5}
                onChange={handleManualCorridorChange}
                min={0.1}
                max={500}
                step={0.1}
              />
              <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
                Sets line spacing directly. For ground vehicles (rover/lawnmower) where the corridor is the operating width, not a camera footprint.
              </p>
            </div>
          )}
        </Section>

        {/* Movement (or Flight) — always visible. Altitude only for camera modes. */}
        <Section title={isManualCamera ? 'Movement' : 'Flight'}>
          <div className="space-y-2">
            {!isManualCamera && (
              <>
                <SliderInput label="Altitude" value={config.altitude} onChange={setAltitude} min={10} max={500} step={5} unit="m" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-content-secondary w-14 flex-shrink-0">Alt Ref</span>
                  <div className="flex gap-1 flex-1">
                    {ALT_REF_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setAltitudeReference(opt.id)}
                        className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                          config.altitudeReference === opt.id
                            ? 'bg-purple-600/80 text-white'
                            : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                        }`}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <SliderInput label="Speed" value={config.speed} onChange={setSpeed} min={1} max={30} step={0.5} unit="m/s" />
          </div>
        </Section>

        {/* Pattern — filtered by mode so the user only sees patterns that
            make sense (mower hides Circular which generates wedge-leaving
            circles regardless of polygon shape; camera mode hides Spiral and
            Perimeter+Fill which are mowing-specific). */}
        <Section title="Pattern">
          {(() => {
            const mode = isManualCamera ? 'mower' : 'camera';
            const visible = ALL_PATTERN_OPTIONS.filter((o) => o.modes.includes(mode));
            return (
              <div className="grid grid-cols-2 gap-1">
                {visible.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPattern(opt.id)}
                    className={`px-2 py-1.5 text-xs rounded-lg transition-colors ${
                      config.pattern === opt.id
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Spiral direction sub-control — only when spiral pattern is active. */}
          {config.pattern === 'spiral' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">Direction</span>
              <div className="flex gap-1 flex-1">
                {(['inward', 'outward'] as const).map((dir) => {
                  const active = (config.spiralDirection ?? 'inward') === dir;
                  return (
                    <button
                      key={dir}
                      onClick={() => setSpiralDirection(dir)}
                      className={`flex-1 px-2 py-1 text-[11px] rounded-md transition-colors ${
                        active
                          ? 'bg-purple-600/80 text-white'
                          : 'bg-surface-raised text-content-secondary hover:text-content'
                      }`}
                      title={dir === 'inward' ? 'Start at perimeter, end at center' : 'Start at center, end at perimeter'}
                    >
                      {dir === 'inward' ? 'In' : 'Out'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Perimeter+Fill passes — only when that pattern is active. */}
          {config.pattern === 'perimeter-fill' && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-content-secondary w-14 flex-shrink-0">Passes</span>
              <input
                type="range"
                value={config.perimeterPasses ?? 2}
                onChange={(e) => setPerimeterPasses(Number(e.target.value))}
                min={1}
                max={5}
                step={1}
                className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
              />
              <span className="text-xs text-content w-14 text-right tabular-nums font-medium">
                {config.perimeterPasses ?? 2}×
              </span>
            </div>
          )}
        </Section>

        {/* Ground path — manual / mower mode only. Picks how the rover moves
            between lines: zigzag (skid-steer) vs reverse (Ackermann). */}
        {isManualCamera && (
          <Section title="Path">
            <div className="flex gap-1">
              {GROUND_PATTERN_OPTIONS.map(opt => {
                const active = (config.groundPattern ?? 'boustrophedon') === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setGroundPattern(opt.id)}
                    className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                      active
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-raised'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-content-tertiary leading-snug">
              {(config.groundPattern ?? 'boustrophedon') === 'reverse-alternating'
                ? 'Mission inserts DO_SET_REVERSE between lines. Rover firmware must support it.'
                : 'Standard zigzag pattern. Rover turns 180° at each line end.'}
            </p>
          </Section>
        )}

        {/* Advanced — collapsed by default. Holds Overlap, Grid tuning, and
            the Show footprints toggle. Once expanded, state sticks for the
            session (no need to re-open every regen). */}
        <div>
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium text-content-secondary hover:text-content uppercase tracking-wider transition-colors"
            title="Show/hide advanced settings"
          >
            <span>Advanced</span>
            <svg
              className={`w-3 h-3 transition-transform ${advancedOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {advancedOpen && (
            <div className="mt-1 space-y-3 pl-2 border-l border-subtle">
              {!isManualCamera && (
                <Section title="Overlap">
                  <div className="space-y-2">
                    <SliderInput label="Front" value={config.frontOverlap} onChange={setFrontOverlap} min={50} max={95} step={1} unit="%" />
                    <SliderInput label="Side" value={config.sideOverlap} onChange={setSideOverlap} min={20} max={99} step={1} unit="%" />
                  </div>
                </Section>
              )}

              {config.pattern !== 'circular' && (
                <Section title="Grid">
                  <div className="space-y-2">
                    <SliderInput label="Angle" value={config.gridAngle} onChange={setGridAngle} min={0} max={359} step={1} unit="°" />
                    {!isManualCamera && (
                      <SliderInput label="Overshoot" value={config.overshoot} onChange={setOvershoot} min={0} max={100} step={5} unit="m" />
                    )}
                  </div>
                </Section>
              )}

              {!isManualCamera && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-content-secondary">Show footprints</span>
                  <button
                    onClick={() => setShowFootprints(!showFootprints)}
                    className={`w-8 h-4.5 rounded-full transition-colors relative ${
                      showFootprints ? 'bg-purple-600' : 'bg-surface-raised'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
                      showFootprints ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats — show whenever we have a generated result. */}
        {result && result.waypoints.length > 0 && (
          <div className="pt-3 border-t border-subtle">
            <SurveyStatsPanel stats={result.stats} />
          </div>
        )}
      </div>

      {/* Insert button — pinned outside scroll area */}
      {result && result.waypoints.length > 0 && (
        <div className="p-3 pt-0 flex-shrink-0">
          <button
            onClick={handleInsertSurvey}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              insertSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {insertSuccess
              ? `Inserted ${result.waypoints.length} waypoints`
              : `Insert Survey (${result.waypoints.length} WPs)`
            }
          </button>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function SliderInput({
  label, value, onChange, min, max, step, unit,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-content-secondary w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1 bg-surface-inset rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
      />
      <span className="text-xs text-content w-14 text-right tabular-nums font-medium">{value}{unit}</span>
    </div>
  );
}

function NumberInput({
  label, value, onChange, min, max, step,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <div>
      <label className="text-[10px] text-content-secondary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= min && v <= max) onChange(v);
        }}
        min={min}
        max={max}
        step={step}
        className="w-full px-2 py-1 text-xs bg-surface-raised border border rounded text-content focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}

// Templates dropdown — grouped by tag (Flying / Ground / Custom). Selecting
// a preset applies its config; user-defined presets carry a delete affordance
// on hover.
function PresetDropdown({
  presets,
  selectedId,
  onSelect,
  onDelete,
}: {
  presets: SurveyPreset[];
  selectedId: string | null;
  onSelect: (preset: SurveyPreset) => void;
  onDelete: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = presets.find((p) => p.id === selectedId);
  const grouped = {
    Flying: presets.filter((p) => p.tag === 'Flying'),
    Ground: presets.filter((p) => p.tag === 'Ground'),
    Custom: presets.filter((p) => p.tag === 'Custom'),
  };

  // Compute popup position from the trigger's bounding rect. We render via a
  // portal to document.body so the dropdown isn't clipped by the dockview
  // panel's overflow:hidden boundary. Anchored to the trigger's right edge —
  // the survey tab lives on the right side of the screen, so growing leftward
  // keeps the menu inside the viewport.
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 288);
      setPopupStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
        width,
        maxHeight: Math.min(360, window.innerHeight - rect.bottom - 16),
      });
    };
    update();
    // Recompute on scroll/resize so the popup tracks the trigger if anything
    // shifts. Capture-phase scroll catches inner scroll containers too.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-2.5 py-1.5 text-left text-xs bg-surface-raised border border rounded-md text-content hover:border transition-colors flex items-center justify-between"
        title="Pick a preset (or stay with current settings)"
      >
        <span className="truncate">
          {selected ? selected.name : 'Pick a template…'}
        </span>
        <svg className={`w-3 h-3 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <>
          {/* Click-outside scrim. Sits below the popup but above the rest of
              the app — clicks dismiss without flashing past other UI. */}
          <div
            className="fixed inset-0"
            style={{ zIndex: 9998 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{ ...popupStyle, zIndex: 9999 }}
            className="bg-surface-solid border border-subtle rounded-md shadow-2xl overflow-y-auto"
          >
            {(['Flying', 'Ground', 'Custom'] as const).map((tag) => {
              const items = grouped[tag];
              if (items.length === 0) return null;
              return (
                <div key={tag}>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-content-secondary uppercase tracking-wider bg-surface-input">
                    {tag === 'Custom' ? 'Saved' : tag}
                  </div>
                  {items.map((p) => (
                    <div
                      key={p.id}
                      className={`group flex items-center gap-1 hover:bg-purple-600/20 transition-colors ${
                        p.id === selectedId ? 'bg-purple-600/10' : ''
                      }`}
                    >
                      <button
                        onClick={() => { onSelect(p); setIsOpen(false); }}
                        className={`flex-1 px-3 py-2 text-left text-xs ${
                          p.id === selectedId ? 'text-purple-300' : 'text-content'
                        }`}
                      >
                        <div className="font-medium whitespace-nowrap">{p.name}</div>
                        <div className="text-[10px] text-content-tertiary leading-snug mt-0.5">{p.description}</div>
                      </button>
                      {p.isUserDefined && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                          className="opacity-0 group-hover:opacity-100 px-2 text-content-tertiary hover:text-red-400 transition-opacity"
                          title="Delete preset"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
