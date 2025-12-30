/**
 * RallyMapOverlay - Renders rally points on the Leaflet map
 *
 * Displays orange square markers with "R1", "R2", etc.
 * Markers are draggable in edit mode
 */

import { useCallback } from 'react';
import { Marker } from 'react-leaflet';
import { useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useRallyStore } from '../../stores/rally-store';
import type { RallyPoint } from '../../../shared/rally-types';

interface RallyMapOverlayProps {
  readOnly?: boolean;
}

// Create rally point icon with number
const createRallyIcon = (index: number, isSelected: boolean) =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${isSelected ? '#ffffff' : '#f97316'};
        border: 2px solid ${isSelected ? '#f97316' : '#ea580c'};
        border-radius: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isSelected ? '#f97316' : '#ffffff'};
        font-size: 11px;
        font-weight: bold;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        R${index + 1}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

export function RallyMapOverlay({ readOnly = false }: RallyMapOverlayProps) {
  const {
    rallyPoints,
    selectedSeq,
    addMode,
    setSelectedSeq,
    moveRallyPoint,
    addRallyPoint,
  } = useRallyStore();

  // Handle map click for adding rally points
  useMapEvents({
    click(e) {
      if (!addMode || readOnly) return;
      const { lat, lng } = e.latlng;
      addRallyPoint(lat, lng, 100); // Default 100m altitude
    },
  });

  // Handle marker click
  const handleMarkerClick = useCallback(
    (point: RallyPoint) => {
      if (readOnly) return;
      setSelectedSeq(selectedSeq === point.seq ? null : point.seq);
    },
    [readOnly, selectedSeq, setSelectedSeq]
  );

  // Handle marker drag
  const handleMarkerDrag = useCallback(
    (seq: number, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      const { lat, lng } = e.target.getLatLng();
      moveRallyPoint(seq, lat, lng);
    },
    [readOnly, moveRallyPoint]
  );

  return (
    <>
      {rallyPoints.map((point, index) => {
        const isSelected = selectedSeq === point.seq;

        return (
          <Marker
            key={point.seq}
            position={[point.latitude, point.longitude]}
            icon={createRallyIcon(index, isSelected)}
            draggable={!readOnly}
            eventHandlers={{
              click: () => handleMarkerClick(point),
              dragend: (e) => handleMarkerDrag(point.seq, e as unknown as L.LeafletMouseEvent),
            }}
          />
        );
      })}
    </>
  );
}
