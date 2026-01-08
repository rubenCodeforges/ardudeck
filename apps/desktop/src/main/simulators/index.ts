/**
 * Simulators Module
 *
 * Exports all simulator-related functionality for ArduDeck.
 */

export {
  detectSimulators,
  detectFlightGear,
  detectXPlane,
  getFlightGearProtocolDir,
  getFlightGearRoot,
  type SimulatorInfo,
  type SimulatorType,
} from './simulator-detector';

export {
  flightGearLauncher,
  FLIGHTGEAR_AIRCRAFT,
  FLIGHTGEAR_AIRPORTS,
  type FlightGearConfig,
} from './flightgear-launcher';

export {
  protocolBridge,
  type BridgeConfig,
} from './protocol-bridge';
