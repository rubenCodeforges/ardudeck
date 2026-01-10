import { useEffect } from 'react';
import { useOsdStore, BUNDLED_FONT_NAMES, type OsdElementId, type DemoTelemetry, type OsdMode } from '../../stores/osd-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { OsdPreview } from './OsdCanvas';
import { OsdConfigurator } from './OsdConfigurator';
import { DraggableSlider } from '../ui/DraggableSlider';

/**
 * OSD Simulator View - Main tab component
 */
export function OsdView() {
  const {
    currentFont,
    currentFontName,
    isLoadingFont,
    fontError,
    videoType,
    scale,
    showGrid,
    backgroundColor,
    mode,
    demoValues,
    elementPositions,
    loadBundledFont,
    setVideoType,
    setScale,
    setShowGrid,
    setBackgroundColor,
    setMode,
    updateDemoValue,
    resetDemoValues,
    toggleElement,
    resetElementPositions,
    updateScreenBuffer,
  } = useOsdStore();

  // Load default font on mount
  useEffect(() => {
    if (!currentFont) {
      loadBundledFont('default');
    }
  }, [currentFont, loadBundledFont]);

  // Update screen buffer when font loads
  useEffect(() => {
    if (currentFont) {
      updateScreenBuffer();
    }
  }, [currentFont, updateScreenBuffer]);

  // Get connection info
  const connectionState = useConnectionStore((s) => s.connectionState);

  // Subscribe to telemetry changes (same store for both MAVLink and MSP)
  const attitude = useTelemetryStore((s) => s.attitude);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);

  // Start MSP telemetry polling when in live mode with MSP connection
  useEffect(() => {
    const isMsp = connectionState.protocol === 'msp' || !!connectionState.fcVariant;
    if (mode === 'live' && isMsp && connectionState.isConnected) {
      // Small delay to ensure connection is stable after reconnect
      const startTimeout = setTimeout(() => {
        // Start MSP telemetry polling (data goes to same telemetry store)
        window.electronAPI?.mspStartTelemetry(10); // 10Hz
      }, 100);

      return () => {
        clearTimeout(startTimeout);
        window.electronAPI?.mspStopTelemetry();
      };
    }
  }, [mode, connectionState]); // Use entire connectionState object to detect reconnects

  // Update OSD when telemetry changes in live mode
  useEffect(() => {
    if (mode === 'live' && currentFont) {
      updateScreenBuffer();
    }
  }, [
    mode,
    currentFont,
    // Telemetry (same store for MAVLink and MSP)
    attitude,
    vfrHud,
    battery,
    gps,
    position,
    updateScreenBuffer,
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="text-xl font-semibold text-white">OSD Simulator</h1>
        <div className="flex items-center gap-4">
          {/* Mode selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Mode:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as OsdMode)}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              <option value="demo">Demo</option>
              <option value="live">Live</option>
              <option value="edit">Edit Layout</option>
            </select>
          </div>

          {/* Video type */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Video:</label>
            <select
              value={videoType}
              onChange={(e) => setVideoType(e.target.value as 'PAL' | 'NTSC')}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              <option value="PAL">PAL (30x16)</option>
              <option value="NTSC">NTSC (30x13)</option>
            </select>
          </div>

          {/* Scale */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Scale:</label>
            <select
              value={scale}
              onChange={(e) => setScale(parseInt(e.target.value))}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
            </select>
          </div>

          {/* Font selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">Font:</label>
            <select
              value={currentFontName}
              onChange={(e) => loadBundledFont(e.target.value)}
              disabled={isLoadingFont}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              {BUNDLED_FONT_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main content */}
      {mode === 'edit' ? (
        /* Edit mode - show configurator */
        <div className="flex-1 overflow-hidden">
          {fontError && (
            <div className="m-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {fontError}
            </div>
          )}
          {isLoadingFont ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">Loading font...</div>
          ) : !currentFont ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">No font loaded</div>
          ) : (
            <OsdConfigurator />
          )}
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* OSD Preview */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-900">
          {fontError && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {fontError}
            </div>
          )}

          {isLoadingFont ? (
            <div className="text-gray-400">Loading font...</div>
          ) : !currentFont ? (
            <div className="text-gray-400">No font loaded</div>
          ) : (
            <OsdPreview showCrtEffect={false} />
          )}

          {/* Display options */}
          <div className="flex items-center gap-4 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600"
              />
              Show Grid
            </label>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-400">Background:</label>
              <input
                type="color"
                value={backgroundColor.startsWith('rgba') ? '#0064c8' : backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-8 h-6 rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Connection status */}
          <div className="mt-4 text-sm text-gray-500">
            {mode === 'demo' ? 'Demo Mode - Adjust values on the right' : 'Live Mode - Waiting for telemetry'}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-80 border-l border-gray-700 flex flex-col overflow-hidden">
          {/* Elements toggle */}
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white">Elements</h3>
              <button
                onClick={resetElementPositions}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto">
              {(Object.keys(elementPositions) as OsdElementId[]).map((id) => (
                <label key={id} className="flex items-center gap-1.5 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={elementPositions[id].enabled}
                    onChange={() => toggleElement(id)}
                    className="rounded-sm bg-gray-700 border-gray-600 w-3 h-3"
                  />
                  {formatElementName(id)}
                </label>
              ))}
            </div>
          </div>

          {/* Demo values */}
          {mode === 'demo' && (
            <div className="flex-1 p-3 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">Demo Values</h3>
                <button
                  onClick={resetDemoValues}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Reset
                </button>
              </div>

              <div className="space-y-3">
                <DemoSlider
                  label="Altitude"
                  value={demoValues.altitude}
                  onChange={(v) => updateDemoValue('altitude', v)}
                  min={0}
                  max={1000}
                  unit="m"
                />
                <DemoSlider
                  label="Speed"
                  value={demoValues.speed}
                  onChange={(v) => updateDemoValue('speed', v)}
                  min={0}
                  max={50}
                  step={0.1}
                  unit="m/s"
                />
                <DemoSlider
                  label="Heading"
                  value={demoValues.heading}
                  onChange={(v) => updateDemoValue('heading', v)}
                  min={0}
                  max={359}
                  unit="deg"
                />
                <DemoSlider
                  label="Pitch"
                  value={demoValues.pitch}
                  onChange={(v) => updateDemoValue('pitch', v)}
                  min={-45}
                  max={45}
                  unit="deg"
                />
                <DemoSlider
                  label="Roll"
                  value={demoValues.roll}
                  onChange={(v) => updateDemoValue('roll', v)}
                  min={-45}
                  max={45}
                  unit="deg"
                />
                <DemoSlider
                  label="Battery"
                  value={demoValues.batteryVoltage}
                  onChange={(v) => updateDemoValue('batteryVoltage', v)}
                  min={9}
                  max={16.8}
                  step={0.1}
                  unit="V"
                />
                <DemoSlider
                  label="Battery %"
                  value={demoValues.batteryPercent}
                  onChange={(v) => updateDemoValue('batteryPercent', v)}
                  min={0}
                  max={100}
                  unit="%"
                />
                <DemoSlider
                  label="GPS Sats"
                  value={demoValues.gpsSats}
                  onChange={(v) => updateDemoValue('gpsSats', v)}
                  min={0}
                  max={20}
                />
                <DemoSlider
                  label="RSSI"
                  value={demoValues.rssi}
                  onChange={(v) => updateDemoValue('rssi', v)}
                  min={0}
                  max={100}
                  unit="%"
                />
                <DemoSlider
                  label="Throttle"
                  value={demoValues.throttle}
                  onChange={(v) => updateDemoValue('throttle', v)}
                  min={0}
                  max={100}
                  unit="%"
                />
                <DemoSlider
                  label="Distance"
                  value={demoValues.distance}
                  onChange={(v) => updateDemoValue('distance', v)}
                  min={0}
                  max={5000}
                  unit="m"
                />
                <DemoSlider
                  label="Flight Time"
                  value={demoValues.flightTime}
                  onChange={(v) => updateDemoValue('flightTime', v)}
                  min={0}
                  max={3600}
                  unit="s"
                />
                {/* CCRP demo: Adjust heading to test steering cue, longitude to simulate approach */}
                <DemoSlider
                  label="Longitude"
                  value={demoValues.longitude}
                  onChange={(v) => updateDemoValue('longitude', v)}
                  min={-122.43}
                  max={-122.41}
                  step={0.0001}
                  unit="deg"
                />
              </div>
            </div>
          )}

          {/* Live mode info */}
          {mode === 'live' && (
            <div className="flex-1 p-3">
              <h3 className="text-sm font-medium text-white mb-3">Live Telemetry</h3>
              <p className="text-xs text-gray-400">
                Connect to a flight controller to see live OSD data.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Demo value slider
 */
function DemoSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <DraggableSlider
      label={`${label}${unit ? ` (${unit})` : ''}`}
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      showValue
      valueFormatter={(v) => {
        if (step && step < 0.001) return v.toFixed(4);
        if (step && step < 1) return v.toFixed(1);
        return v.toString();
      }}
    />
  );
}

/**
 * Format element ID to display name
 */
function formatElementName(id: OsdElementId): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
