/**
 * Shared receiver protocol constants.
 *
 * Used by ReceiverTab, TransmitterCheckStep troubleshooter, and
 * ReceiverWizard so the option lists stay in sync.
 */

// =============================================================================
// iNav
// =============================================================================

export const INAV_RECEIVER_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'SERIAL', label: 'Serial' },
  { value: 'MSP', label: 'MSP' },
  { value: 'SIM (SITL)', label: 'SITL' },
] as const;

export const INAV_QUICK_SELECT = [
  { value: 'CRSF', label: 'CRSF / ELRS' },
  { value: 'SBUS', label: 'SBUS' },
  { value: 'IBUS', label: 'iBUS' },
  { value: 'SPEKTRUM2048', label: 'Spektrum' },
] as const;

// =============================================================================
// Betaflight
// =============================================================================

export const BF_QUICK_SELECT = [
  { value: 9, label: 'CRSF / ELRS' },
  { value: 2, label: 'SBUS' },
  { value: 7, label: 'iBUS' },
  { value: 1, label: 'Spektrum' },
  { value: 12, label: 'FPort' },
] as const;

export const BF_PROVIDERS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'SPEK1024' },
  { value: 1, label: 'SPEK2048' },
  { value: 2, label: 'SBUS' },
  { value: 3, label: 'SUMD' },
  { value: 4, label: 'SUMH' },
  { value: 5, label: 'XBUS_MODE_B' },
  { value: 6, label: 'XBUS_MODE_B_RJ01' },
  { value: 7, label: 'iBUS' },
  { value: 8, label: 'JETIEXBUS' },
  { value: 9, label: 'CRSF' },
  { value: 10, label: 'SRXL' },
  { value: 11, label: 'TARGET_CUSTOM' },
  { value: 12, label: 'FPORT' },
  { value: 13, label: 'SRXL2' },
  { value: 14, label: 'GHST' },
  { value: 15, label: 'MSP' },
];

// =============================================================================
// Protocol hints
// =============================================================================

/** Hint text keyed by iNav serialrx_provider name */
export const PROTOCOL_HINTS: Record<string, string> = {
  CRSF: 'Low-latency digital link. Used by TBS Crossfire and ExpressLRS receivers.',
  SBUS: 'Inverted serial protocol. Common with FrSky and RadioLink receivers. Some boards need a hardware inverter.',
  IBUS: 'FlySky digital protocol. Connect to a free UART RX pad.',
  SPEKTRUM2048: 'Spektrum satellite receiver. Bind to transmitter first, then connect to UART.',
  FPORT: 'FrSky F.Port combines SBUS + telemetry on a single wire.',
  GHST: 'ImmersionRC Ghost ultra-low latency protocol.',
  SRXL2: 'Spektrum SRXL2 bidirectional serial protocol.',
  MSP: 'For GCS/SITL control only. Do not use with a physical receiver.',
};

/** Hint text keyed by Betaflight numeric provider value */
export const BF_PROTOCOL_HINTS: Record<number, string> = {
  9: 'Low-latency digital link. Used by TBS Crossfire and ExpressLRS receivers.',
  2: 'Inverted serial protocol. Common with FrSky and RadioLink receivers.',
  7: 'FlySky digital protocol. Connect to a free UART RX pad.',
  1: 'Spektrum satellite receiver. Bind to transmitter first.',
  12: 'FrSky F.Port combines SBUS + telemetry on a single wire.',
  14: 'ImmersionRC Ghost ultra-low latency protocol.',
  13: 'Spektrum SRXL2 bidirectional serial protocol.',
  15: 'For GCS/SITL control only. Do not use with a physical receiver.',
};

// =============================================================================
// Reverse lookups (name → numeric value for MSP_SET_RX_CONFIG)
// =============================================================================

/** Map iNav receiver_type name → numeric value (byte 23 of RX_CONFIG) */
export const INAV_RECEIVER_TYPE_INDEX: Record<string, number> = {
  'NONE': 0,
  'SERIAL': 1,
  'MSP': 2,
  'SIM (SITL)': 3,
};

/** Map serialrx_provider name → numeric value (byte 0 of RX_CONFIG) */
export const SERIALRX_PROVIDER_INDEX: Record<string, number> = {
  'SPEK1024': 0,
  'SPEK2048': 1,
  'SBUS': 2,
  'SUMD': 3,
  'SUMH': 4,
  'XBUS_MODE_B': 5,
  'XBUS_MODE_B_RJ01': 6,
  'IBUS': 7,
  'JETIEXBUS': 8,
  'CRSF': 9,
  'SRXL': 10,
  'TARGET_CUSTOM': 11,
  'FPORT': 12,
  'SRXL2': 13,
  'GHST': 14,
  'MSP': 15,
};

// =============================================================================
// Serial port function bits
// =============================================================================

/** Bit index for Serial RX in the serial port functionMask */
export const SERIAL_FUNCTION_BIT_RX = 6;
