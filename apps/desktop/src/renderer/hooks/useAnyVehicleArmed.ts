import { useFleetVehicles } from './useFleet';
import { useTelemetryStore } from '../stores/telemetry-store';

/** Decoration must never cover a live vehicle. */
export function useAnyVehicleArmed(): boolean {
  const primaryArmed = useTelemetryStore((s) => s.flight.armed);
  const fleet = useFleetVehicles();
  return primaryArmed || fleet.some((v) => v.armed);
}
