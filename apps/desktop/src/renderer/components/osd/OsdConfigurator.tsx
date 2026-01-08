/**
 * OSD Configurator
 *
 * Visual drag-and-drop editor for OSD element positioning.
 * Displays the OSD preview with draggable overlays for each element.
 */

import { useState } from 'react';
import {
  useOsdStore,
  DEFAULT_ELEMENT_POSITIONS,
  type OsdElementId,
} from '../../stores/osd-store';
import { OSD_COLS, OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT, getOsdRows } from '../../utils/osd/font-renderer';
import { OSD_ELEMENT_SIZES, getElementSize } from '../../utils/osd/element-sizes';
import { OsdCanvas } from './OsdCanvas';
import { OsdElementOverlay } from './OsdElementOverlay';
import { OsdElementList } from './OsdElementList';
import { OsdPositionEditor } from './OsdPositionEditor';

export function OsdConfigurator() {
  const {
    elementPositions,
    setElementPosition,
    toggleElement,
    resetElementPositions,
    videoType,
    scale,
    showGrid,
    setShowGrid,
    backgroundColor,
    setBackgroundColor,
  } = useOsdStore();

  const [selectedElement, setSelectedElement] = useState<OsdElementId | null>(null);
  const [showLabels, setShowLabels] = useState(true);

  const rows = getOsdRows(videoType);
  const canvasWidth = OSD_COLS * OSD_CHAR_WIDTH * scale;
  const canvasHeight = rows * OSD_CHAR_HEIGHT * scale;

  // Handle position change from drag or input
  const handlePositionChange = (id: OsdElementId, x: number, y: number) => {
    setElementPosition(id, { x, y });
  };

  // Reset single element to default
  const handleResetElement = (id: OsdElementId) => {
    const defaultPos = DEFAULT_ELEMENT_POSITIONS[id];
    setElementPosition(id, { x: defaultPos.x, y: defaultPos.y });
  };

  // Click on empty area deselects
  const handleCanvasClick = () => {
    setSelectedElement(null);
  };

  return (
    <div className="flex h-full">
      {/* Left: Preview with overlays */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 bg-gray-900">
        {/* Canvas container with overlay */}
        <div
          className="relative"
          style={{
            width: canvasWidth,
            height: canvasHeight,
          }}
          onClick={handleCanvasClick}
        >
          {/* OSD Canvas */}
          <OsdCanvas />

          {/* Draggable element overlays */}
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
        </div>

        {/* Options below canvas */}
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

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            Show Labels
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

        {/* Help text */}
        <p className="mt-2 text-xs text-gray-500">
          Click and drag elements to reposition. Click element in list to select.
        </p>
      </div>

      {/* Right: Controls panel */}
      <div className="w-72 border-l border-gray-700 flex flex-col overflow-hidden">
        {/* Element list - takes remaining space */}
        <div className="p-4 border-b border-gray-700 flex-1 overflow-y-auto min-h-0">
          <OsdElementList
            positions={elementPositions}
            selectedElement={selectedElement}
            onSelect={setSelectedElement}
            onToggle={toggleElement}
          />
        </div>

        {/* Position editor (when element selected) - fixed height */}
        {selectedElement && (
          <div className="p-4 border-b border-gray-700 flex-shrink-0">
            <OsdPositionEditor
              elementId={selectedElement}
              position={elementPositions[selectedElement]}
              size={getElementSize(selectedElement)}
              videoType={videoType}
              onPositionChange={handlePositionChange}
              onReset={handleResetElement}
            />
          </div>
        )}

        {/* Reset all button */}
        <div className="p-4 flex-shrink-0">
          <button
            onClick={resetElementPositions}
            className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
          >
            Reset All Positions
          </button>
        </div>
      </div>
    </div>
  );
}
