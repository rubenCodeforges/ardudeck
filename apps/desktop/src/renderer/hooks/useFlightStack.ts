import { useConnectionStore } from '../stores/connection-store';
import { useSettingsStore } from '../stores/settings-store';
import { flightStack, type FlightStack } from '../utils/flight-stack';

export function useFlightStack(): FlightStack {
  const link = useConnectionStore((s) => s.connectionState);
  const toggle = useSettingsStore((s) => s.missionDefaults.missionFirmware);
  return flightStack(link, toggle);
}
