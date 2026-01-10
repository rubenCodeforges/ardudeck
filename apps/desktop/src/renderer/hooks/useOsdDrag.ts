/**
 * OSD Element Drag Hook
 *
 * Provides drag-and-drop functionality for OSD elements.
 * Converts pixel movements to character grid positions.
 */

import { useState, useRef, useCallback } from 'react';
import type { OsdElementId } from '../stores/osd-store';

interface UseOsdDragOptions {
  elementId: OsdElementId;
  elementWidth: number; // Element width in characters
  elementHeight: number; // Element height in characters
  charWidth: number; // Pixels per character width (12 * scale)
  charHeight: number; // Pixels per character height (18 * scale)
  gridCols: number; // Total columns (30)
  gridRows: number; // Total rows (16 PAL, 13 NTSC)
  onPositionChange: (id: OsdElementId, x: number, y: number) => void;
}

interface DragState {
  startX: number;
  startY: number;
  startCol: number;
  startRow: number;
}

export function useOsdDrag(options: UseOsdDragOptions) {
  const {
    elementId,
    elementWidth,
    elementHeight,
    charWidth,
    charHeight,
    gridCols,
    gridRows,
    onPositionChange,
  } = options;

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState>({ startX: 0, startY: 0, startCol: 0, startRow: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, currentX: number, currentY: number) => {
      e.preventDefault();
      e.stopPropagation();

      // Capture pointer for smooth dragging even outside element bounds
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startCol: currentX,
        startRow: currentY,
      };
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;

      // Convert pixel delta to grid delta (round for snapping)
      const colDelta = Math.round(deltaX / charWidth);
      const rowDelta = Math.round(deltaY / charHeight);

      // Calculate new position
      let newX = dragRef.current.startCol + colDelta;
      let newY = dragRef.current.startRow + rowDelta;

      // Clamp to bounds (accounting for element size)
      const maxX = gridCols - elementWidth;
      const maxY = gridRows - elementHeight;

      newX = Math.max(0, Math.min(maxX, newX));
      newY = Math.max(0, Math.min(maxY, newY));

      onPositionChange(elementId, newX, newY);
    },
    [isDragging, charWidth, charHeight, gridCols, gridRows, elementWidth, elementHeight, elementId, onPositionChange]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  return {
    isDragging,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
