/**
 * OSD Element Overlay
 *
 * Renders a draggable overlay box for an OSD element.
 * Uses CSS transform for GPU-composited positioning (no ghost trails).
 */

import { useOsdDrag } from '../../hooks/useOsdDrag';
import type { OsdElementId } from '../../stores/osd-store';
import type { OsdElementPosition } from '../../stores/osd-store';
import type { ElementSize } from '../../utils/osd/element-registry';
import type { VideoType } from '../../utils/osd/font-renderer';

interface Props {
  elementId: OsdElementId;
  position: OsdElementPosition;
  size: ElementSize;
  scale: number;
  videoType: VideoType;
  isSelected: boolean;
  showLabels: boolean;
  onSelect: (id: OsdElementId) => void;
  onPositionChange: (id: OsdElementId, x: number, y: number) => void;
}

const CHAR_WIDTH = 12;
const CHAR_HEIGHT = 18;

function formatElementName(id: OsdElementId): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OsdElementOverlay({
  elementId,
  position,
  size,
  scale,
  videoType,
  isSelected,
  showLabels,
  onSelect,
  onPositionChange,
}: Props) {
  const charWidth = CHAR_WIDTH * scale;
  const charHeight = CHAR_HEIGHT * scale;
  const gridRows = videoType === 'PAL' ? 16 : 13;

  const { isDragging, handlePointerDown, handlePointerMove, handlePointerUp } = useOsdDrag({
    elementId,
    elementWidth: size.width,
    elementHeight: size.height,
    charWidth,
    charHeight,
    gridCols: 30,
    gridRows,
    onPositionChange,
  });

  if (!position.enabled) return null;

  const width = size.width * charWidth;
  const height = size.height * charHeight;
  const tx = position.x * charWidth;
  const ty = position.y * charHeight;

  return (
    <div
      className={`
        absolute cursor-move border
        ${isSelected ? 'border-blue-500 bg-blue-500/20' : 'border-transparent hover:border-blue-400/50'}
        ${isDragging ? 'opacity-70 z-50' : 'z-10'}
      `}
      style={{
        transform: `translate(${tx}px, ${ty}px)`,
        width,
        height,
        top: 0,
        left: 0,
        pointerEvents: 'auto',
        willChange: isDragging ? 'transform' : 'auto',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(elementId);
      }}
      onPointerDown={(e) => handlePointerDown(e, position.x, position.y)}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {(showLabels || isSelected) && (
        <span
          className={`
            absolute -top-4 left-0 text-[10px] whitespace-nowrap px-1 rounded
            ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-800/80 text-blue-300'}
          `}
        >
          {formatElementName(elementId)}
        </span>
      )}

      {isSelected && (
        <span className="absolute -bottom-4 left-0 text-[10px] text-gray-400">
          [{position.x}, {position.y}]
        </span>
      )}
    </div>
  );
}
