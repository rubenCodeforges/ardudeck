/**
 * Survey Config Panel - Floating panel with camera, overlap, pattern, and angle controls.
 * Shows on the right side of the map when a survey polygon is drawn.
 */
import { useState, useCallback } from 'react';
import { useSurveyStore } from '../../stores/survey-store';
import { useMissionStore } from '../../stores/mission-store';
import { CameraPresetSelector } from './CameraPresetSelector';
import { SurveyStatsPanel } from './SurveyStatsPanel';
import { surveyToMissionItems } from './mission-builder';
import type { SurveyPattern, CameraPreset, AltitudeReference } from './survey-types';

const PATTERN_OPTIONS: { id: SurveyPattern; label: string; description: string }[] = [
  { id: 'grid', label: 'Grid', description: 'Lawnmower pattern' },
  { id: 'crosshatch', label: 'Crosshatch', description: 'Double perpendicular grid' },
  { id: 'circular', label: 'Circular', description: 'Concentric rings' },
];

const ALT_REF_OPTIONS: { id: AltitudeReference; label: string; description: string }[] = [
  { id: 'relative', label: 'Relative', description: 'Altitude relative to home position' },
  { id: 'terrain', label: 'Terrain', description: 'Altitude above terrain (AGL) at each point' },
  { id: 'asl', label: 'ASL', description: 'Altitude above mean sea level' },
];

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
  const startDrawing = useSurveyStore((s) => s.startDrawing);
  const clearSurvey = useSurveyStore((s) => s.clearSurvey);

  const insertMissionItems = useMissionStore((s) => s.insertMissionItems);

  const [isCustomCamera, setIsCustomCamera] = useState(config.camera.name === 'Custom');
  const [customCamera, setCustomCamera] = useState<CameraPreset>(config.camera);
  const [insertSuccess, setInsertSuccess] = useState(false);

  const handleCameraChange = useCallback((preset: CameraPreset) => {
    setIsCustomCamera(preset.name === 'Custom');
    setCustomCamera(preset);
    setCamera(preset);
  }, [setCamera]);

  const handleCustomField = useCallback((field: keyof CameraPreset, value: number) => {
    const updated = { ...customCamera, [field]: value };
    setCustomCamera(updated);
    setCamera(updated);
  }, [customCamera, setCamera]);

  const handleInsertSurvey = useCallback(() => {
    if (!result || !polygon) return;
    const fullConfig = { ...config, polygon };
    const items = surveyToMissionItems(result, fullConfig);
    if (items.length === 0) return;

    insertMissionItems(items);

    setInsertSuccess(true);
    setTimeout(() => setInsertSuccess(false), 2000);
  }, [result, polygon, config, insertMissionItems]);

  if (!polygon) return null;

  return (
    <div className="absolute top-3 right-24 z-[1000] w-72 max-h-[calc(100%-24px)] flex flex-col bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <h3 className="text-sm font-medium text-white">Survey Grid</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startDrawing}
            className="p-1 text-gray-400 hover:text-purple-400 transition-colors"
            title="Redraw polygon"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={clearSurvey}
            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
            title="Clear survey"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
        {/* Camera Section */}
        <Section title="Camera">
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
        </Section>

        {/* Flight Section */}
        <Section title="Flight">
          <div className="space-y-2">
            <SliderInput label="Altitude" value={config.altitude} onChange={setAltitude} min={10} max={500} step={5} unit="m" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-14 flex-shrink-0">Alt Ref</span>
              <div className="flex gap-1 flex-1">
                {ALT_REF_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAltitudeReference(opt.id)}
                    className={`flex-1 px-1.5 py-1 text-[10px] rounded-md transition-colors ${
                      config.altitudeReference === opt.id
                        ? 'bg-purple-600/80 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <SliderInput label="Speed" value={config.speed} onChange={setSpeed} min={1} max={30} step={0.5} unit="m/s" />
          </div>
        </Section>

        {/* Overlap Section */}
        <Section title="Overlap">
          <div className="space-y-2">
            <SliderInput label="Front" value={config.frontOverlap} onChange={setFrontOverlap} min={50} max={95} step={1} unit="%" />
            <SliderInput label="Side" value={config.sideOverlap} onChange={setSideOverlap} min={20} max={99} step={1} unit="%" />
          </div>
        </Section>

        {/* Pattern Section */}
        <Section title="Pattern">
          <div className="flex gap-1">
            {PATTERN_OPTIONS.map(opt => (
              <button
                key={opt.id}
                onClick={() => setPattern(opt.id)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                  config.pattern === opt.id
                    ? 'bg-purple-600/80 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }`}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Grid Angle & Overshoot */}
        {config.pattern !== 'circular' && (
          <Section title="Grid">
            <div className="space-y-2">
              <SliderInput label="Angle" value={config.gridAngle} onChange={setGridAngle} min={0} max={359} step={1} unit="°" />
              <SliderInput label="Overshoot" value={config.overshoot} onChange={setOvershoot} min={0} max={100} step={5} unit="m" />
            </div>
          </Section>
        )}

        {/* Show footprints toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Show footprints</span>
          <button
            onClick={() => setShowFootprints(!showFootprints)}
            className={`w-8 h-4.5 rounded-full transition-colors relative ${
              showFootprints ? 'bg-purple-600' : 'bg-gray-600'
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${
              showFootprints ? 'left-4' : 'left-0.5'
            }`} />
          </button>
        </div>

        {/* Stats */}
        {result && result.stats.photoCount > 0 && (
          <div className="pt-3 border-t border-gray-700/50">
            <SurveyStatsPanel stats={result.stats} />
          </div>
        )}

      </div>

      {/* Insert button — pinned outside scroll area */}
      {result && result.waypoints.length > 0 && (
        <div className="p-4 pt-0 flex-shrink-0">
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
      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">{title}</div>
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
      <span className="text-xs text-gray-400 w-14 flex-shrink-0">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:cursor-grab"
      />
      <span className="text-xs text-gray-300 w-14 text-right tabular-nums font-medium">{value}{unit}</span>
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
      <label className="text-[10px] text-gray-500">{label}</label>
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
        className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded text-gray-200 focus:border-purple-500 focus:outline-none"
      />
    </div>
  );
}
