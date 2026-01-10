/**
 * OSD Position Editor
 *
 * Panel for editing the selected element's position with number inputs.
 */

import type { OsdElementId, OsdElementPosition } from '../../stores/osd-store';
import type { ElementSize } from '../../utils/osd/element-sizes';
import type { VideoType } from '../../utils/osd/font-renderer';

interface Props {
  elementId: OsdElementId;
  position: OsdElementPosition;
  size: ElementSize;
  videoType: VideoType;
  onPositionChange: (id: OsdElementId, x: number, y: number) => void;
  onReset: (id: OsdElementId) => void;
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

export function OsdPositionEditor({
  elementId,
  position,
  size,
  videoType,
  onPositionChange,
  onReset,
}: Props) {
  const gridRows = videoType === 'PAL' ? 16 : 13;
  const maxX = 30 - size.width;
  const maxY = gridRows - size.height;

  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      const clampedX = Math.max(0, Math.min(maxX, value));
      onPositionChange(elementId, clampedX, position.y);
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      const clampedY = Math.max(0, Math.min(maxY, value));
      onPositionChange(elementId, position.x, clampedY);
    }
  };

  return (
    <div className="p-3 bg-gray-800 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-white">{formatElementName(elementId)}</h4>
        <button
          onClick={() => onReset(elementId)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">X Position</label>
          <input
            type="number"
            value={position.x}
            onChange={handleXChange}
            min={0}
            max={maxX}
            className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Y Position</label>
          <input
            type="number"
            value={position.y}
            onChange={handleYChange}
            min={0}
            max={maxY}
            className="w-full bg-gray-700 text-white text-sm rounded px-2 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>
          Size: {size.width}×{size.height} chars
        </span>
        <span>
          Max: [{maxX}, {maxY}]
        </span>
      </div>
    </div>
  );
}
