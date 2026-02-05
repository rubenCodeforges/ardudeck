import { useEffect, useState, useCallback, useRef } from 'react';
import { useOsdStore, BUNDLED_FONT_NAMES, type OsdElementId, type DemoTelemetry, type OsdMode } from '../../stores/osd-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { OsdPreview } from './OsdCanvas';
import { OsdConfigurator } from './OsdConfigurator';
import { DraggableSlider } from '../ui/DraggableSlider';

/** RC channel values state */
interface RcChannelValues {
  roll: number;      // Channel 1: 1000-2000
  pitch: number;     // Channel 2: 1000-2000
  throttle: number;  // Channel 3: 1000-2000
  yaw: number;       // Channel 4: 1000-2000
  aux1: number;      // Channel 5
  aux2: number;      // Channel 6
}

const DEFAULT_RC_VALUES: RcChannelValues = {
  roll: 1500,
  pitch: 1500,
  throttle: 1000,
  yaw: 1500,
  aux1: 1000,
  aux2: 1000,
};

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

  // RC Control state
  const [rcValues, setRcValues] = useState<RcChannelValues>(DEFAULT_RC_VALUES);
  const [rcEnabled, setRcEnabled] = useState(false);
  const rcSendInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Send RC values to FC
  const sendRcValues = useCallback(async (values: RcChannelValues) => {
    if (!connectionState.isConnected || !rcEnabled) return;

    try {
      // Build 8-channel array (standard minimum for most FCs)
      const channels = [
        values.roll,
        values.pitch,
        values.throttle,
        values.yaw,
        values.aux1,
        values.aux2,
        1000, // AUX3
        1000, // AUX4
      ];
      await window.electronAPI?.mspSetRawRc?.(channels);
    } catch (err) {
      console.error('[RC Control] Failed to send RC:', err);
    }
  }, [connectionState.isConnected, rcEnabled]);

  // Update RC value and send immediately
  const updateRcValue = useCallback((key: keyof RcChannelValues, value: number) => {
    setRcValues(prev => {
      const newValues = { ...prev, [key]: value };
      // Send immediately on change
      sendRcValues(newValues);
      return newValues;
    });
  }, [sendRcValues]);

  // Start/stop continuous RC sending
  useEffect(() => {
    if (rcEnabled && connectionState.isConnected) {
      // Send RC values at 20Hz (50ms) - matches Betaflight Configurator's rate
      rcSendInterval.current = setInterval(() => {
        sendRcValues(rcValues);
      }, 50);

      return () => {
        if (rcSendInterval.current) {
          clearInterval(rcSendInterval.current);
          rcSendInterval.current = null;
        }
      };
    } else {
      if (rcSendInterval.current) {
        clearInterval(rcSendInterval.current);
        rcSendInterval.current = null;
      }
    }
  }, [rcEnabled, connectionState.isConnected, rcValues, sendRcValues]);

  // Reset RC to center/idle
  const resetRcValues = useCallback(() => {
    setRcValues(DEFAULT_RC_VALUES);
  }, []);

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
                {/* CCRP demo: Adjust heading to test steering cue, approach distance to simulate approach */}
                <DemoSlider
                  label="Approach Distance"
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

          {/* Live mode info and RC Control */}
          {mode === 'live' && (
            <div className="flex-1 p-3 overflow-y-auto">
              <h3 className="text-sm font-medium text-white mb-3">Live Telemetry</h3>
              {connectionState.isConnected ? (
                <div className="space-y-2 text-xs mb-4">
                  <p className="text-green-400">
                    Connected to {connectionState.fcVariant || connectionState.autopilot || 'FC'}
                    {connectionState.fcVersion && ` ${connectionState.fcVersion}`}
                  </p>
                  <p className="text-gray-400">Receiving live OSD data</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-4">
                  Connect to a flight controller to see live OSD data.
                </p>
              )}

              {/* RC Control Section */}
              {connectionState.isConnected && (
                <div className="border-t border-gray-700 pt-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white">RC Control</h3>
                    <button
                      onClick={resetRcValues}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Reset
                    </button>
                  </div>

                  {/* Info note */}
                  <p className="mb-3 text-[10px] text-gray-500">
                    Sends MSP_SET_RAW_RC at 20Hz. For iNav, set receiver_type to MSP in{' '}
                    <span className="text-blue-400">Parameters → Safety</span> tab.
                  </p>

                  {/* RC Enable Toggle */}
                  <label className="flex items-center gap-2 mb-3 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={rcEnabled}
                      onChange={(e) => setRcEnabled(e.target.checked)}
                      className="rounded-sm bg-gray-700 border-gray-600"
                    />
                    <span>Send RC Values</span>
                    {rcEnabled && <span className="text-green-400 text-[10px]">(20Hz)</span>}
                  </label>

                  {/* RC Sliders */}
                  <div className="space-y-2">
                    <RcSlider
                      label="Roll"
                      value={rcValues.roll}
                      onChange={(v) => updateRcValue('roll', v)}
                      centerValue={1500}
                    />
                    <RcSlider
                      label="Pitch"
                      value={rcValues.pitch}
                      onChange={(v) => updateRcValue('pitch', v)}
                      centerValue={1500}
                    />
                    <RcSlider
                      label="Throttle"
                      value={rcValues.throttle}
                      onChange={(v) => updateRcValue('throttle', v)}
                      centerValue={1000}
                      isThrottle
                    />
                    <RcSlider
                      label="Yaw"
                      value={rcValues.yaw}
                      onChange={(v) => updateRcValue('yaw', v)}
                      centerValue={1500}
                    />

                    {/* AUX Channels */}
                    <div className="border-t border-gray-700 pt-2 mt-2">
                      <p className="text-[10px] text-gray-500 mb-2">AUX Channels</p>
                      <RcSlider
                        label="AUX1"
                        value={rcValues.aux1}
                        onChange={(v) => updateRcValue('aux1', v)}
                        centerValue={1500}
                        isAux
                      />
                      <RcSlider
                        label="AUX2"
                        value={rcValues.aux2}
                        onChange={(v) => updateRcValue('aux2', v)}
                        centerValue={1500}
                        isAux
                      />
                    </div>
                  </div>

                  {/* Quick presets */}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => updateRcValue('aux1', 2000)}
                      className="flex-1 px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                    >
                      AUX1 High
                    </button>
                    <button
                      onClick={() => updateRcValue('aux1', 1000)}
                      className="flex-1 px-2 py-1 text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
                    >
                      AUX1 Low
                    </button>
                  </div>
                </div>
              )}
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

/**
 * RC Channel Slider with visual feedback
 */
function RcSlider({
  label,
  value,
  onChange,
  centerValue = 1500,
  isThrottle = false,
  isAux = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  centerValue?: number;
  isThrottle?: boolean;
  isAux?: boolean;
}) {
  const min = 1000;
  const max = 2000;
  const range = max - min;
  const percentage = ((value - min) / range) * 100;

  // Color based on position
  const getBarColor = () => {
    if (isThrottle) {
      // Throttle: green gradient based on value
      const intensity = percentage / 100;
      return `rgba(34, 197, 94, ${0.3 + intensity * 0.7})`;
    }
    if (isAux) {
      // AUX: blue when high, gray when low
      return value > 1500 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(107, 114, 128, 0.4)';
    }
    // Stick channels: show deviation from center
    const deviation = Math.abs(value - centerValue);
    if (deviation < 50) return 'rgba(107, 114, 128, 0.4)';
    return value > centerValue ? 'rgba(59, 130, 246, 0.6)' : 'rgba(249, 115, 22, 0.6)';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-400 w-12 shrink-0">{label}</span>
      <div className="flex-1 relative">
        <div className="h-4 bg-gray-800 rounded overflow-hidden relative">
          {/* Center line for stick channels */}
          {!isThrottle && (
            <div
              className="absolute top-0 bottom-0 w-px bg-gray-600"
              style={{ left: '50%' }}
            />
          )}
          {/* Value bar */}
          <div
            className="absolute top-0 bottom-0 transition-all duration-75"
            style={{
              left: isThrottle ? 0 : '50%',
              width: isThrottle
                ? `${percentage}%`
                : `${Math.abs(percentage - 50)}%`,
              transform: !isThrottle && value < centerValue ? 'translateX(-100%)' : undefined,
              backgroundColor: getBarColor(),
            }}
          />
          {/* Slider input */}
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
      <span className="text-[10px] text-gray-400 w-10 text-right font-mono">{value}</span>
    </div>
  );
}
