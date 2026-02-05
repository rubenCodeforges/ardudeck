/**
 * OSD Edit Panel
 *
 * Right-panel content for edit mode.
 * Shows position editor with alignment buttons and nudge controls.
 */

import { useOsdStore, DEFAULT_ELEMENT_POSITIONS, type OsdElementId } from '../../stores/osd-store';
import { getElementSize } from '../../utils/osd/element-sizes';
import { getOsdRows, OSD_COLS } from '../../utils/osd/font-renderer';

interface Props {
  selectedElement: OsdElementId | null;
}

export function OsdEditPanel({ selectedElement }: Props) {
  const elementPositions = useOsdStore((s) => s.elementPositions);
  const setElementPosition = useOsdStore((s) => s.setElementPosition);
  const resetElementPositions = useOsdStore((s) => s.resetElementPositions);
  const videoType = useOsdStore((s) => s.videoType);

  if (!selectedElement) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-gray-700">
          <h3 className="text-xs font-medium text-gray-300">Position Editor</h3>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-gray-500 text-center">
            Click an element on the canvas or in the browser to edit its position
          </p>
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={resetElementPositions}
            className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
          >
            Reset All Positions
          </button>
        </div>
      </div>
    );
  }

  const pos = elementPositions[selectedElement];
  const size = getElementSize(selectedElement);
  const rows = getOsdRows(videoType);
  const maxX = OSD_COLS - size.width;
  const maxY = rows - size.height;

  const setPos = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(maxX, x));
    const clampedY = Math.max(0, Math.min(maxY, y));
    setElementPosition(selectedElement, { x: clampedX, y: clampedY });
  };

  const nudge = (dx: number, dy: number) => {
    setPos(pos.x + dx, pos.y + dy);
  };

  const centerH = () => setPos(Math.round((OSD_COLS - size.width) / 2), pos.y);
  const centerV = () => setPos(pos.x, Math.round((rows - size.height) / 2));

  const handleReset = () => {
    const def = DEFAULT_ELEMENT_POSITIONS[selectedElement];
    if (def) setElementPosition(selectedElement, { x: def.x, y: def.y });
  };

  const formatName = (id: string) =>
    id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-300">{formatName(selectedElement)}</h3>
          <button
            onClick={handleReset}
            className="text-[10px] text-blue-400 hover:text-blue-300"
          >
            Reset
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-0.5">
          {size.width}x{size.height} chars
        </p>
      </div>

      <div className="p-3 space-y-3">
        {/* Position inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">X Position</label>
            <input
              type="number"
              value={pos.x}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v)) setPos(v, pos.y);
              }}
              min={0}
              max={maxX}
              className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 mb-1">Y Position</label>
            <input
              type="number"
              value={pos.y}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v)) setPos(pos.x, v);
              }}
              min={0}
              max={maxY}
              className="w-full bg-gray-800 text-white text-xs rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Nudge arrows */}
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5">Nudge</p>
          <div className="grid grid-cols-3 gap-1 w-24 mx-auto">
            <div />
            <NudgeBtn label="^" onClick={() => nudge(0, -1)} />
            <div />
            <NudgeBtn label="<" onClick={() => nudge(-1, 0)} />
            <div className="w-7 h-7" />
            <NudgeBtn label=">" onClick={() => nudge(1, 0)} />
            <div />
            <NudgeBtn label="v" onClick={() => nudge(0, 1)} />
            <div />
          </div>
        </div>

        {/* Alignment */}
        <div>
          <p className="text-[10px] text-gray-500 mb-1.5">Align</p>
          <div className="flex gap-1.5">
            <button
              onClick={centerH}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Center H
            </button>
            <button
              onClick={centerV}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Center V
            </button>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => setPos(0, pos.y)}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Left
            </button>
            <button
              onClick={() => setPos(maxX, pos.y)}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Right
            </button>
          </div>
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => setPos(pos.x, 0)}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Top
            </button>
            <button
              onClick={() => setPos(pos.x, maxY)}
              className="flex-1 px-2 py-1 text-[10px] bg-gray-800 hover:bg-gray-700 text-gray-400 rounded border border-gray-700"
            >
              Bottom
            </button>
          </div>
        </div>
      </div>

      <div className="mt-auto p-3 border-t border-gray-700">
        <button
          onClick={resetElementPositions}
          className="w-full px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
        >
          Reset All Positions
        </button>
      </div>
    </div>
  );
}

function NudgeBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs rounded border border-gray-700"
    >
      {label}
    </button>
  );
}
