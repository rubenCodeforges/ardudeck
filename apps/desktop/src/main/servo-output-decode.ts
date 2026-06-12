/**
 * Pure decoder for SERVO_OUTPUT_RAW (MAVLink msg 36).
 *
 * Split out of the IPC parse switch so the v2-truncation behavior can be
 * unit-tested in isolation. MAVLink v2 strips trailing zero bytes from the
 * payload, and ArduPilot always sends port=0 for the MAIN outputs - so the port
 * byte (offset 20) and the usually-zero high servo channels get truncated and
 * the payload routinely arrives far shorter than the nominal 21/37 bytes. A
 * naive `length >= 21` guard therefore dropped nearly every real message and
 * left the Servo Output live view dead on every craft and every link.
 */

/** Little-endian uint16 read; missing (truncated) bytes read back as 0. */
function readUint16(payload: Uint8Array, offset: number): number {
  return (payload[offset] ?? 0) | ((payload[offset + 1] ?? 0) << 8);
}

export interface ServoOutputDecoded {
  outputs: number[];
}

/**
 * Decode a SERVO_OUTPUT_RAW payload. Returns null for AUX ports (port != 0) or
 * payloads too short to carry any servo value. Truncated trailing bytes read
 * back as 0, which is their real value (v2 only truncates zeros).
 */
export function decodeServoOutputRaw(payload: Uint8Array): ServoOutputDecoded | null {
  // Wire order: time_usec(4) @0, servo1-8(2 each) @4..19, port(1) @20,
  //   servo9-16(2 each, v2 extension) @21..36.
  // Need at least time_usec + servo1 to carry anything useful.
  if (payload.length < 6) return null;

  // port absent (truncated) means 0 = MAIN outputs, which is what we want.
  const port = payload[20] ?? 0;
  if (port !== 0) return null;

  const outputs: number[] = [];
  for (let i = 0; i < 8; i++) {
    outputs.push(readUint16(payload, 4 + i * 2));
  }
  // servo9-16 are present only when the payload extends past the port byte.
  if (payload.length > 21) {
    for (let i = 0; i < 8; i++) {
      outputs.push(readUint16(payload, 21 + i * 2));
    }
  }
  return { outputs };
}
