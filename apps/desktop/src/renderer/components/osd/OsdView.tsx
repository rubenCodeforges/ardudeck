/**
 * OSD Simulator View
 *
 * 3-column layout:
 *   Left: Element browser (categorized accordion with search)
 *   Center: OSD canvas + display options + optional edit overlays
 *   Right: Context panel (demo sliders / live mode switches / edit position)
 */

import { useEffect, useState } from 'react';
import { useOsdStore, BUNDLED_FONT_NAMES, type OsdElementId, type OsdMode } from '../../stores/osd-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { OsdCanvas } from './OsdCanvas';
import { OsdElementOverlay } from './OsdElementOverlay';
import { OsdElementBrowser } from './OsdElementBrowser';
import { OsdContextPanel } from './OsdContextPanel';
import { OSD_COLS, OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT, getOsdRows } from '../../utils/osd/font-renderer';
import { getElementSize } from '../../utils/osd/element-sizes';

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
    elementPositions,
    loadBundledFont,
    setVideoType,
    setScale,
    setShowGrid,
    setBackgroundColor,
    setMode,
    setElementPosition,
    updateScreenBuffer,
  } = useOsdStore();

  const [selectedElement, setSelectedElement] = useState<OsdElementId | null>(null);
  const [showLabels, setShowLabels] = useState(true);

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

  // Subscribe to telemetry for live mode (includes flight for armed/mode display)
  const attitude = useTelemetryStore((s) => s.attitude);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);
  const flight = useTelemetryStore((s) => s.flight);

  // Start MSP telemetry polling when in live mode
  useEffect(() => {
    const isMsp = connectionState.protocol === 'msp' || !!connectionState.fcVariant;
    if (mode === 'live' && isMsp && connectionState.isConnected) {
      const startTimeout = setTimeout(() => {
        window.electronAPI?.mspStartTelemetry(10);
      }, 100);
      return () => {
        clearTimeout(startTimeout);
        window.electronAPI?.mspStopTelemetry();
      };
    }
  }, [mode, connectionState]);

  // Update OSD when telemetry changes in live mode
  useEffect(() => {
    if (mode === 'live' && currentFont) {
      updateScreenBuffer();
    }
  }, [mode, currentFont, attitude, vfrHud, battery, gps, position, flight, updateScreenBuffer]);

  // Canvas dimensions for edit overlays
  const rows = getOsdRows(videoType);
  const canvasWidth = OSD_COLS * OSD_CHAR_WIDTH * scale;
  const canvasHeight = rows * OSD_CHAR_HEIGHT * scale;

  const handlePositionChange = (id: OsdElementId, x: number, y: number) => {
    setElementPosition(id, { x, y });
  };

  const handleCanvasClick = () => {
    setSelectedElement(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 shrink-0">
        <h1 className="text-sm font-semibold text-white">OSD Simulator</h1>
        <div className="flex items-center gap-3">
          {/* Mode selector */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-500">Mode:</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as OsdMode)}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              <option value="demo">Demo</option>
              <option value="live">Live</option>
              <option value="edit">Edit Layout</option>
            </select>
          </div>

          {/* Video type */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-500">Video:</label>
            <select
              value={videoType}
              onChange={(e) => setVideoType(e.target.value as 'PAL' | 'NTSC')}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              <option value="PAL">PAL</option>
              <option value="NTSC">NTSC</option>
            </select>
          </div>

          {/* Scale */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-500">Scale:</label>
            <select
              value={scale}
              onChange={(e) => setScale(parseInt(e.target.value))}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
            </select>
          </div>

          {/* Font */}
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-gray-500">Font:</label>
            <select
              value={currentFontName}
              onChange={(e) => loadBundledFont(e.target.value)}
              disabled={isLoadingFont}
              className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
            >
              {BUNDLED_FONT_NAMES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* LEFT: Element browser */}
        <div className="w-48 border-r border-gray-700 flex flex-col overflow-hidden shrink-0">
          <OsdElementBrowser
            selectedElement={selectedElement}
            onSelect={setSelectedElement}
          />
        </div>

        {/* CENTER: Canvas area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-900 overflow-auto">
          {fontError && (
            <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-xs">
              {fontError}
            </div>
          )}

          {isLoadingFont ? (
            <div className="text-gray-400 text-sm">Loading font...</div>
          ) : !currentFont ? (
            <div className="text-gray-400 text-sm">No font loaded</div>
          ) : (
            <div
              className="relative"
              style={{ width: canvasWidth, height: canvasHeight }}
              onClick={handleCanvasClick}
            >
              <OsdCanvas />

              {/* Edit overlays (show in edit mode) */}
              {mode === 'edit' && (
                <div className="absolute inset-0">
                  {(Object.entries(elementPositions) as [OsdElementId, typeof elementPositions[OsdElementId]][]).map(
                    ([id, pos]) => (
                      <OsdElementOverlay
                        key={id}
                        elementId={id}
                        position={pos}
                        size={getElementSize(id)}
                        scale={scale}
                        videoType={videoType}
                        isSelected={selectedElement === id}
                        showLabels={showLabels}
                        onSelect={setSelectedElement}
                        onPositionChange={handlePositionChange}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Display options below canvas */}
          <div className="flex items-center gap-4 mt-3">
            <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="rounded bg-gray-700 border-gray-600 w-3 h-3"
              />
              Grid
            </label>

            {mode === 'edit' && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 w-3 h-3"
                />
                Labels
              </label>
            )}

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] text-gray-400">BG:</label>
              <input
                type="color"
                value={backgroundColor.startsWith('rgba') ? '#0064c8' : backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-6 h-5 rounded cursor-pointer"
              />
            </div>
          </div>

          {mode === 'edit' && (
            <p className="mt-2 text-[10px] text-gray-500">
              Drag elements to reposition. Select in browser to edit.
            </p>
          )}
        </div>

        {/* RIGHT: Context panel */}
        <div className="w-60 border-l border-gray-700 flex flex-col overflow-hidden shrink-0">
          <OsdContextPanel mode={mode} selectedElement={selectedElement} />
        </div>
      </div>
    </div>
  );
}
