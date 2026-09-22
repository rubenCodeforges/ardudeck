/**
 * Survey Draw Tool - Map click handler for polygon drawing.
 * Follows the same pattern as FenceDrawTool.
 * Click to add vertices, double-click to complete, ESC to cancel.
 */
import { useEffect } from 'react';
import { useMapEvents } from 'react-leaflet';
import { useSurveyStore } from '../../stores/survey-store';

export function SurveyDrawTool() {
  const drawMode = useSurveyStore((s) => s.drawMode);
  const drawingVertices = useSurveyStore((s) => s.drawingVertices);
  const editingGroupId = useSurveyStore((s) => s.editingGroupId);
  const addVertex = useSurveyStore((s) => s.addVertex);
  const completePolygon = useSurveyStore((s) => s.completePolygon);
  const completeBranch = useSurveyStore((s) => s.completeBranch);
  const cancelDrawing = useSurveyStore((s) => s.cancelDrawing);
  const deactivateSurvey = useSurveyStore((s) => s.deactivateSurvey);

  useMapEvents({
    click: (e) => {
      if (drawMode === 'polygon' || drawMode === 'branch') {
        addVertex(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Clicking empty map while editing a committed survey exits edit mode,
      // like clicking away from a selection. The survey's own layers call
      // L.DomEvent.stopPropagation, which is what keeps this to genuinely
      // empty clicks: a plain DOM stopPropagation does not stop Leaflet
      // propagating a layer click to the map. We gate on editingGroupId so an
      // un-inserted draft isn't discarded by a stray click.
      if (editingGroupId) {
        deactivateSurvey();
      }
    },
    dblclick: (e) => {
      if (drawMode === 'none') return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      if (drawMode === 'branch') {
        if (drawingVertices.length >= 1) completeBranch(); // dbl-click adds the final point
        return;
      }
      if (drawingVertices.length >= 2) {
        // Double-click adds a vertex then completes (3+ total)
        completePolygon();
      }
    },
    contextmenu: (e) => {
      if (drawMode === 'none') return;
      e.originalEvent.preventDefault();
      cancelDrawing();
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (drawMode === 'none') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      } else if (e.key === 'Enter') {
        if (drawMode === 'branch' && drawingVertices.length >= 2) completeBranch();
        else if (drawMode === 'polygon' && drawingVertices.length >= 3) completePolygon();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawMode, drawingVertices.length, cancelDrawing, completePolygon, completeBranch]);

  return null;
}
