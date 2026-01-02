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
} from './msp-handlers.js';
