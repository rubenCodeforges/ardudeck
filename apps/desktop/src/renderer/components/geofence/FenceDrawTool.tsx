/**
 * FenceDrawTool - Handles map click events for drawing fences
 *
 * Drawing modes:
 * - polygon-inclusion/exclusion: Click points, double-click to complete
 * - circle-inclusion/exclusion: Click center, drag for radius
 * - return-point: Single click to set
 */

import { useEffect } from 'react';
import { useMapEvents } from 'react-leaflet';
import { useFenceStore } from '../../stores/fence-store';

export function FenceDrawTool() {
  const { drawMode, drawingVertices, addDrawingVertex, completeDrawing, cancelDrawing } = useFenceStore();

  // Handle map click for drawing
  useMapEvents({
    click(e) {
      if (drawMode === 'none') return;

      const { lat, lng } = e.latlng;

      if (drawMode === 'return-point') {
        // Single click sets return point
        addDrawingVertex(lat, lng);
        completeDrawing();
      } else if (drawMode.startsWith('circle-')) {
        // Circle: first click = center, second click = edge (defines radius)
        addDrawingVertex(lat, lng);
        if (drawingVertices.length >= 1) {
          // Second click completes the circle
          completeDrawing();
        }
      } else if (drawMode.startsWith('polygon-')) {
        // Polygon: each click adds a vertex
        addDrawingVertex(lat, lng);
      }
    },
    dblclick(e) {
      if (drawMode === 'none') return;

      // Double-click completes polygon drawing
      if (drawMode.startsWith('polygon-') && drawingVertices.length >= 3) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
        completeDrawing();
      }
    },
    contextmenu(e) {
      if (drawMode !== 'none') {
        // Right-click cancels drawing
        e.originalEvent.preventDefault();
        cancelDrawing();
      }
    },
  });

  // Handle escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawMode !== 'none') {
        cancelDrawing();
      }
      // Enter completes polygon if enough vertices
      if (e.key === 'Enter' && drawMode.startsWith('polygon-') && drawingVertices.length >= 3) {
        completeDrawing();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, drawingVertices.length, cancelDrawing, completeDrawing]);

  // This component doesn't render anything - it just handles events
  return null;
}
