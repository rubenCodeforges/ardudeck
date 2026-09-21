/**
 * What kind of aircraft this is, the way the flight-mode code already decides.
 *
 * MAV_TYPE alone is not enough: ArduPlane reports MAV_TYPE_FIXED_WING for a
 * quadplane, so anything keyed off it calls every VTOL a plane. Q_ENABLE says
 * whether the FCU is actually running quadplane code, and a known VTOL SITL
 * frame is stronger still because we chose it ourselves.
 *
 * Extracted because FlightControlPanel and FlightControlInstrument had grown
 * the same derivation independently, and every screen that gets it wrong
 * silently offers copter behaviour to an aircraft that will transition.
 */

import { useConnectionStore } from '../stores/connection-store';
import { useParameterStore } from '../stores/parameter-store';
import { useArduPilotSitlStore } from '../stores/ardupilot-sitl-store';
import { getVehicleClass, type ArduPilotVehicleClass } from '../../shared/telemetry-types';

/**
 * `mavTypeOverride` picks a fleet vehicle instead of the primary connection,
 * matching FlightControlPanel's behaviour.
 */
export function useVehicleClass(mavTypeOverride?: number): ArduPilotVehicleClass {
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const qEnable = useParameterStore((s) => s.parameters.get('Q_ENABLE')?.value);
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  const sitlFrame = useArduPilotSitlStore((s) => s.model);

  return getVehicleClass(mavTypeOverride ?? mavType, {
    qEnable: typeof qEnable === 'number' ? qEnable : undefined,
    sitlFrame: sitlIsRunning ? sitlFrame : undefined,
  });
}

/** True for an airframe that hovers on rotors and cruises on a wing. */
export function useIsVtol(mavTypeOverride?: number): boolean {
  return useVehicleClass(mavTypeOverride) === 'vtol';
}
