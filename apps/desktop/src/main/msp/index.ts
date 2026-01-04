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
} from './msp-handlers.js';
