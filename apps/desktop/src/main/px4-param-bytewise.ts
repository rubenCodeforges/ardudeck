/**
 * PX4 uses the MAVLink "bytewise" (cast) param union: for integer parameter
 * types the 4 bytes of the param_value field hold the raw integer bits, to be
 * reinterpreted according to param_type. ArduPilot instead uses "by value":
 * every param, including ints, is the numeric value cast to a float32.
 *
 * The generated PARAM_VALUE / PARAM_SET (de)serializers in mavlink-ts always
 * treat param_value as a float32 (by value, the ArduPilot convention). These
 * helpers reinterpret the raw param_value bytes for PX4 connections only, at
 * the app layer, so mavlink-ts stays firmware-agnostic.
 *
 * param_value occupies bytes [0..4) of both the PARAM_VALUE and PARAM_SET
 * payloads, little-endian.
 */

import { MavParamType } from '../shared/parameter-types.js';

const PARAM_VALUE_OFFSET = 0;

function isIntegerType(paramType: number): boolean {
  switch (paramType) {
    case MavParamType.UINT8:
    case MavParamType.INT8:
    case MavParamType.UINT16:
    case MavParamType.INT16:
    case MavParamType.UINT32:
    case MavParamType.INT32:
      return true;
    default:
      return false;
  }
}

/**
 * Decode a PX4 (bytewise) param_value from the raw 4 wire bytes of a payload.
 *
 * This MUST be called with the actual wire payload (not a value that has
 * already been float-decoded): reinterpreting the integer bits as a float and
 * back is lossy (can yield NaN / denormals) and loses the original bytes.
 *
 * For integer param types the bytes are read with the matching typed getter;
 * for REAL32 (and anything non-integer) it falls back to float32, which matches
 * the by-value path so REAL32 is correct under both conventions.
 */
export function decodePx4ParamValue(payload: Uint8Array, paramType: number): number {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  switch (paramType) {
    case MavParamType.UINT8:
      return view.getUint8(PARAM_VALUE_OFFSET);
    case MavParamType.INT8:
      return view.getInt8(PARAM_VALUE_OFFSET);
    case MavParamType.UINT16:
      return view.getUint16(PARAM_VALUE_OFFSET, true);
    case MavParamType.INT16:
      return view.getInt16(PARAM_VALUE_OFFSET, true);
    case MavParamType.UINT32:
      return view.getUint32(PARAM_VALUE_OFFSET, true);
    case MavParamType.INT32:
      return view.getInt32(PARAM_VALUE_OFFSET, true);
    default:
      return view.getFloat32(PARAM_VALUE_OFFSET, true);
  }
}

/**
 * Rewrite the param_value bytes of an already-serialized PARAM_SET payload with
 * the PX4 (bytewise) encoding of `value` according to `paramType`.
 *
 * For integer types the typed integer bits are written little-endian (8/16-bit
 * types zero-pad the unused high bytes). For REAL32 (and non-integer types) the
 * payload is left untouched, since serializeParamSet already wrote the float32
 * (matching the by-value path). Mutates and returns the same buffer.
 */
export function encodePx4ParamSetValue(payload: Uint8Array, value: number, paramType: number): Uint8Array {
  if (!isIntegerType(paramType)) {
    return payload;
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  switch (paramType) {
    case MavParamType.UINT8:
      view.setUint32(PARAM_VALUE_OFFSET, 0, true);
      view.setUint8(PARAM_VALUE_OFFSET, value & 0xff);
      break;
    case MavParamType.INT8:
      view.setUint32(PARAM_VALUE_OFFSET, 0, true);
      view.setInt8(PARAM_VALUE_OFFSET, value | 0);
      break;
    case MavParamType.UINT16:
      view.setUint32(PARAM_VALUE_OFFSET, 0, true);
      view.setUint16(PARAM_VALUE_OFFSET, value & 0xffff, true);
      break;
    case MavParamType.INT16:
      view.setUint32(PARAM_VALUE_OFFSET, 0, true);
      view.setInt16(PARAM_VALUE_OFFSET, value | 0, true);
      break;
    case MavParamType.UINT32:
      view.setUint32(PARAM_VALUE_OFFSET, value >>> 0, true);
      break;
    case MavParamType.INT32:
      view.setInt32(PARAM_VALUE_OFFSET, value | 0, true);
      break;
  }
  return payload;
}
