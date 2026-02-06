/**
 * MSP Module
 *
 * MSP (MultiWii Serial Protocol) support for Betaflight/iNav/Cleanflight boards.
 */

export { registerMspHandlers, unregisterMspHandlers } from './msp-registration.js';
export { tryMspDetection } from './msp-detection.js';
export { startMspTelemetry, stopMspTelemetry } from './msp-telemetry.js';
export { cleanupMspConnection } from './msp-cleanup.js';
export { exitCliModeIfActive } from '../cli/cli-handlers.js';
export { autoConfigureSitlPlatform, getMspVehicleType } from './msp-mixer.js';
export { resetSitlAutoConfig, resetMspCliFlags } from './msp-commands.js';
