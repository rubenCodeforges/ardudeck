import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { create } from 'zustand';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import { useVehicleMissionView } from '../../stores/vehicle-mission-store';
import { commandHasLocation, hasValidCoordinates } from '../../../shared/mission-types';
import { WaypointPicker } from './WaypointPicker';

const PREVIEW_ICON = L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: '<div style="width:34px;height:34px;border-radius:50%;border:3px solid #06b6d4;background:rgba(6,182,212,0.16);box-shadow:0 0 0 4px rgba(6,182,212,0.22)"></div>',
});

const usePinPicker = create<{ open: { seq: number; x: number; y: number } | null }>(() => ({ open: null }));

/** Click on a waypoint pin of the primary vehicle's mission: opens the waypoint picker at that pin. */
export function openWaypointPickerAt(seq: number, x: number, y: number): void {
  if (!useConnectionStore.getState().connectionState.isConnected) return;
  usePinPicker.setState({ open: { seq, x, y } });
}

export function PinWaypointPicker(): JSX.Element | null {
  const open = usePinPicker((s) => s.open);
  const { items } = useVehicleMissionView();
  const currentSeq = useMissionStore((s) => s.currentSeq);
  if (!open || items.length === 0) return null;
  return (
    <WaypointPicker
      count={items.length}
      current={currentSeq}
      initial={open.seq}
      anchor={{ x: open.x + 12, y: open.y + 12 }}
      onClose={() => usePinPicker.setState({ open: null })}
    />
  );
}

/** The waypoint chosen in the picker, ringed on the map before it is committed. */
export function WaypointPreviewMarker(): JSX.Element | null {
  const selectedSeq = useMissionStore((s) => s.selectedSeq);
  const { items } = useVehicleMissionView();
  const wp = useMemo(
    () => (selectedSeq === null ? null : items.find((it) => it.seq === selectedSeq && commandHasLocation(it.command) && hasValidCoordinates(it.latitude, it.longitude)) ?? null),
    [items, selectedSeq],
  );
  if (!wp) return null;
  return <Marker position={[wp.latitude, wp.longitude]} icon={PREVIEW_ICON} interactive={false} zIndexOffset={900} />;
}
