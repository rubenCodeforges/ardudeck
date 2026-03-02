/**
 * ArduPilot @PARAM/param.pck binary format parser.
 *
 * Format reference: MissionPlanner ExtLibs/ArduPilot/parampck.cs
 *
 * File structure:
 *   Header (6 bytes): magic(u16) + numParams(u16) + totalParams(u16)
 *   Entries (variable): type/flags(u8) + nameInfo(u8) + name(var) + value(var) [+ default(var)]
 *
 * Name compression: Each parameter name shares a common prefix with the previous
 * name. The `common_len` field tells how many leading bytes to reuse.
 */

import { MavParamType } from '../../shared/parameter-types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Magic number for param.pck without defaults */
const MAGIC_NO_DEFAULTS = 0x671b;

/** Magic number for param.pck with defaults */
const MAGIC_WITH_DEFAULTS = 0x671c;

/** Packed type values (NOT the same as MAV_PARAM_TYPE) */
const PACK_TYPE_NONE = 0;
const PACK_TYPE_INT8 = 1;
const PACK_TYPE_INT16 = 2;
const PACK_TYPE_INT32 = 3;
const PACK_TYPE_FLOAT = 4;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PackedParam {
  name: string;
  value: number;
  type: MavParamType;
  defaultValue?: number;
}

export interface ParamPackResult {
  params: PackedParam[];
  totalParams: number;
  withDefaults: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Byte size for a given packed type */
function typeSize(ptype: number): number {
  switch (ptype) {
    case PACK_TYPE_INT8: return 1;
    case PACK_TYPE_INT16: return 2;
    case PACK_TYPE_INT32: return 4;
    case PACK_TYPE_FLOAT: return 4;
    default: return 0;
  }
}

/** Read a value from the buffer based on packed type */
function readValue(view: DataView, offset: number, ptype: number): number {
  switch (ptype) {
    case PACK_TYPE_INT8: return view.getInt8(offset);
    case PACK_TYPE_INT16: return view.getInt16(offset, true);
    case PACK_TYPE_INT32: return view.getInt32(offset, true);
    case PACK_TYPE_FLOAT: return view.getFloat32(offset, true);
    default: return 0;
  }
}

/** Map packed type to MAV_PARAM_TYPE (ArduPilot always uses REAL32 over MAVLink) */
function packedTypeToMavType(ptype: number): MavParamType {
  switch (ptype) {
    case PACK_TYPE_INT8: return MavParamType.INT8;
    case PACK_TYPE_INT16: return MavParamType.INT16;
    case PACK_TYPE_INT32: return MavParamType.INT32;
    case PACK_TYPE_FLOAT: return MavParamType.REAL32;
    default: return MavParamType.REAL32;
  }
}

/** Convert native typed value to float32 (matching MAVLink PARAM_VALUE behavior).
 *  ArduPilot sends all parameter values as float32 over MAVLink regardless of native type. */
function toFloat32Value(value: number, ptype: number): number {
  // For float type, return as-is
  if (ptype === PACK_TYPE_FLOAT) return value;
  // For integer types, the value is already the correct integer
  // ArduPilot transmits the integer bit-pattern as a float32 over MAVLink,
  // but for the param store we want the actual numeric value
  return value;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse a @PARAM/param.pck binary file into parameter entries.
 * Returns null if the data is invalid or too short.
 */
export function parseParamPack(data: Uint8Array): ParamPackResult | null {
  if (data.length < 6) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Read header
  const magic = view.getUint16(0, true);
  const withDefaults = magic === MAGIC_WITH_DEFAULTS;

  if (magic !== MAGIC_NO_DEFAULTS && magic !== MAGIC_WITH_DEFAULTS) {
    return null;
  }

  const numParams = view.getUint16(2, true);
  const totalParams = view.getUint16(4, true);

  if (numParams === 0) {
    return { params: [], totalParams, withDefaults };
  }

  const params: PackedParam[] = [];
  let offset = 6;
  let lastName = '';

  while (offset < data.length && params.length < numParams) {
    // Skip zero padding bytes (used to prevent params spanning FTP chunk boundaries)
    while (offset < data.length && data[offset] === 0) {
      offset++;
    }
    if (offset >= data.length) break;

    // Byte 0: type (lower 4 bits) and flags (upper 4 bits)
    const byte0 = data[offset++]!;
    const ptype = byte0 & 0x0f;
    const flags = (byte0 >> 4) & 0x0f;
    const hasDefault = (flags & 0x01) !== 0;

    // Skip NONE type entries
    if (ptype === PACK_TYPE_NONE) continue;

    // Check we have at least the name info byte
    if (offset >= data.length) break;

    // Byte 1: name length info
    // Upper 4 bits = non-common chars minus 1 (actual new chars = field + 1)
    // Lower 4 bits = common prefix length (chars to reuse from previous name)
    const byte1 = data[offset++]!;
    const nameNewLen = ((byte1 >> 4) & 0x0f) + 1;
    const commonLen = byte1 & 0x0f;

    // Bounds check for name bytes
    if (offset + nameNewLen > data.length) break;

    // Reconstruct full parameter name
    const prefix = lastName.slice(0, commonLen);
    let suffix = '';
    for (let i = 0; i < nameNewLen; i++) {
      suffix += String.fromCharCode(data[offset + i]!);
    }
    offset += nameNewLen;

    const name = prefix + suffix;
    lastName = name;

    // Read value
    const valSize = typeSize(ptype);
    if (offset + valSize > data.length) break;
    const value = toFloat32Value(readValue(view, offset, ptype), ptype);
    offset += valSize;

    // Read default value if present
    let defaultValue: number | undefined;
    if (withDefaults && hasDefault) {
      if (offset + valSize > data.length) break;
      defaultValue = toFloat32Value(readValue(view, offset, ptype), ptype);
      offset += valSize;
    }

    params.push({
      name,
      value,
      type: packedTypeToMavType(ptype),
      defaultValue,
    });
  }

  return { params, totalParams, withDefaults };
}
