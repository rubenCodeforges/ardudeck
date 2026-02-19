/**
 * Board-specific UART pad labels and receiver suggestions.
 *
 * Maps boardId (from MSP BOARD_INFO) to human-readable labels
 * for each UART identifier. Used by PortsTab and ReceiverWizard.
 *
 * UART identifiers: 0=UART1, 1=UART2, ... 7=UART8
 */

/** Human-readable UART labels keyed by boardId → identifier → label */
export const BOARD_UART_LABELS: Record<string, Record<number, string>> = {
  // Matek F405-SE
  MATEKF405SE: {
    0: 'UART1 (T1/R1)',
    1: 'UART2 (SBUS pad, built-in inverter)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5 only, no RX)',
    5: 'UART6 (R6 only, no TX)',
  },
  // Matek F405-Wing / F405-Wing V2
  MATEKF405: {
    0: 'UART1 (T1/R1)',
    1: 'UART2 (SBUS pad, built-in inverter)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5/R5)',
    5: 'UART6 (R6 only)',
  },
  // SpeedyBee F405 Wing
  SPEEDYBEEF405WING: {
    0: 'UART1 (T1/R1)',
    1: 'UART2 (SBUS pad)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5/R5)',
  },
  // SpeedyBee F405 V3 / V4
  SPEEDYBEEF405V3: {
    0: 'UART1 (SBUS pad, built-in inverter)',
    1: 'UART2 (T2/R2)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5/R5)',
    5: 'UART6 (R6 only, ESC telemetry)',
  },
  SPEEDYBEEF405V4: {
    0: 'UART1 (SBUS pad, built-in inverter)',
    1: 'UART2 (T2/R2)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5/R5)',
    5: 'UART6 (R6 only, ESC telemetry)',
  },
  // Matek H743-Wing
  MATEKH743: {
    0: 'UART1 (T1/R1)',
    1: 'UART2 (SBUS pad, built-in inverter)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    4: 'UART5 (T5/R5, ESC telemetry)',
    5: 'UART6 (T6/R6)',
    6: 'UART7 (T7/R7)',
    7: 'UART8 (R8 only)',
  },
  // Kakute F7 / F7 Mini
  KAKUTEF7: {
    0: 'UART1 (SBUS pad, built-in inverter)',
    1: 'UART2 (T2/R2)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4, ESC telemetry)',
    5: 'UART6 (T6/R6)',
  },
  KAKUTEF7MINI: {
    0: 'UART1 (SBUS pad, built-in inverter)',
    1: 'UART2 (T2/R2)',
    2: 'UART3 (T3/R3, GPS)',
    3: 'UART4 (T4, ESC telemetry)',
    5: 'UART6 (T6/R6)',
  },
  // Mambaf405
  MAMBAF405US: {
    0: 'UART1 (SBUS pad, built-in inverter)',
    1: 'UART2 (T2/R2)',
    2: 'UART3 (T3/R3)',
    3: 'UART4 (T4/R4)',
    5: 'UART6 (T6/R6, ESC telemetry)',
  },
};

/** Suggested UART for receiver based on board. */
export const BOARD_RX_SUGGESTION: Record<string, { uart: number; note: string }> = {
  MATEKF405SE: { uart: 1, note: 'SBUS pad on UART2 has built-in inverter' },
  MATEKF405: { uart: 1, note: 'SBUS pad on UART2 has built-in inverter' },
  SPEEDYBEEF405WING: { uart: 1, note: 'SBUS pad on UART2' },
  SPEEDYBEEF405V3: { uart: 0, note: 'SBUS pad on UART1 has built-in inverter' },
  SPEEDYBEEF405V4: { uart: 0, note: 'SBUS pad on UART1 has built-in inverter' },
  MATEKH743: { uart: 1, note: 'SBUS pad on UART2 has built-in inverter' },
  KAKUTEF7: { uart: 0, note: 'SBUS pad on UART1 has built-in inverter' },
  KAKUTEF7MINI: { uart: 0, note: 'SBUS pad on UART1 has built-in inverter' },
  MAMBAF405US: { uart: 0, note: 'SBUS pad on UART1 has built-in inverter' },
};
