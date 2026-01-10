/**
 * MSP Module
 *
 * MSP (MultiWii Serial Protocol) support for Betaflight/iNav/Cleanflight boards.
 */

export {
  registerMspHandlers,
  unregisterMspHandlers,
  tryMspDetection,
  startMspTelemetry,
  stopMspTelemetry,
  cleanupMspConnection,
  exitCliModeIfActive,
  autoConfigureSitlPlatform,
  getMspVehicleType,
  resetSitlAutoConfig,
} from './msp-handlers.js';
