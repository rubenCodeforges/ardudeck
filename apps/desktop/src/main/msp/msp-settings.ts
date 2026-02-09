/**
 * MSP Generic Settings API
 *
 * Allows reading/writing any CLI setting via MSP without entering CLI mode.
 * Uses iNav MSP2 COMMON_SETTING commands.
 */

import { MSP2 } from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import { sendMspV2RequestWithPayload } from './msp-transport.js';

/**
 * Setting metadata returned from MSP2_COMMON_SETTING_INFO
 */
export interface SettingInfo {
  name: string;
  type: 'uint8_t' | 'int8_t' | 'uint16_t' | 'int16_t' | 'uint32_t' | 'float' | 'string';
  mode: number;
  min: number;
  max: number;
  index: number;
  table?: string[]; // Lookup table for enum settings
}

/**
 * Clear the settings cache (call on disconnect)
 */
export function clearSettingsCache(): void {
  ctx.settingsCache.clear();
}

/**
 * Encode a setting name as null-terminated string for MSP request
 */
export function encodeSettingName(name: string): Uint8Array {
  const data = new Uint8Array(name.length + 1);
  for (let i = 0; i < name.length; i++) {
    data[i] = name.charCodeAt(i);
  }
  data[name.length] = 0; // Null terminator
  return data;
}

/**
 * Encode a setting reference by index for MSP request
 */
export function encodeSettingIndex(index: number): Uint8Array {
  const data = new Uint8Array(3);
  data[0] = 0; // Use index mode
  data[1] = index & 0xFF;
  data[2] = (index >> 8) & 0xFF;
  return data;
}

/**
 * Get setting metadata (type, min, max, enum values)
 * Uses MSP2_COMMON_SETTING_INFO (0x1007)
 */
export async function getSettingInfo(name: string): Promise<SettingInfo | null> {
  // Check cache first
  const cached = ctx.settingsCache.get(name);
  if (cached) return cached;

  if (!ctx.currentTransport?.isOpen) return null;

  const SETTING_TYPES: Record<number, SettingInfo['type']> = {
    0: 'uint8_t',
    1: 'int8_t',
    2: 'uint16_t',
    3: 'int16_t',
    4: 'uint32_t',
    5: 'float',
    6: 'string',
  };
  const MODE_LOOKUP = 1 << 6; // 64

  try {
    const payload = encodeSettingName(name);
    const response = await sendMspV2RequestWithPayload(MSP2.COMMON_SETTING_INFO, payload, 2000);

    // Parse response
    let offset = 0;

    // Read name (null-terminated string) - discard
    while (offset < response.length && response[offset] !== 0) offset++;
    offset++; // Skip null terminator

    // PG ID (uint16) - discard
    offset += 2;

    // Type (uint8)
    const typeNum = response[offset++]!;
    const type = SETTING_TYPES[typeNum];
    if (!type) {
      console.warn(`[MSP] Unknown setting type ${typeNum} for ${name}`);
      return null;
    }

    // Section (uint8) - discard
    offset++;

    // Mode (uint8)
    const mode = response[offset++]!;

    // Min (int32)
    const minView = new DataView(response.buffer, response.byteOffset + offset, 4);
    const min = minView.getInt32(0, true);
    offset += 4;

    // Max (uint32)
    const maxView = new DataView(response.buffer, response.byteOffset + offset, 4);
    const max = maxView.getUint32(0, true);
    offset += 4;

    // Index (uint16)
    const indexView = new DataView(response.buffer, response.byteOffset + offset, 2);
    const index = indexView.getUint16(0, true);
    offset += 2;

    // Profile info (2 bytes) - discard
    offset += 2;

    // Lookup table for enum settings
    let table: string[] | undefined;
    if (mode === MODE_LOOKUP) {
      table = [];
      for (let i = min; i <= max; i++) {
        let str = '';
        while (offset < response.length && response[offset] !== 0) {
          str += String.fromCharCode(response[offset++]!);
        }
        offset++; // Skip null terminator
        table.push(str);
      }
    }

    const info: SettingInfo = { name, type, mode, min, max, index, table };
    ctx.settingsCache.set(name, info);
    return info;
  } catch (error) {
    console.error(`[MSP] getSettingInfo(${name}) failed:`, error);
    return null;
  }
}

/**
 * Get a CLI setting value by name
 * Uses MSP2_COMMON_SETTING (0x1003)
 */
export async function getSetting(name: string): Promise<{ value: string | number; info: SettingInfo } | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  const info = await getSettingInfo(name);
  if (!info) return null;

  try {
    const payload = encodeSettingIndex(info.index);
    const response = await sendMspV2RequestWithPayload(MSP2.COMMON_SETTING, payload, 2000);

    let value: string | number;
    const view = new DataView(response.buffer, response.byteOffset, response.length);

    switch (info.type) {
      case 'uint8_t':
        value = view.getUint8(0);
        break;
      case 'int8_t':
        value = view.getInt8(0);
        break;
      case 'uint16_t':
        value = view.getUint16(0, true);
        break;
      case 'int16_t':
        value = view.getInt16(0, true);
        break;
      case 'uint32_t':
        value = view.getUint32(0, true);
        break;
      case 'float': {
        const fi32 = view.getUint32(0, true);
        const buf = new ArrayBuffer(4);
        new Uint32Array(buf)[0] = fi32;
        value = new Float32Array(buf)[0]!;
        break;
      }
      case 'string': {
        let str = '';
        for (let i = 0; i < response.length && response[i] !== 0; i++) {
          str += String.fromCharCode(response[i]!);
        }
        value = str;
        break;
      }
      default:
        console.error(`[MSP] Unknown type ${info.type} for ${name}`);
        return null;
    }

    // Convert numeric enum value to string if we have a lookup table
    if (info.table && typeof value === 'number') {
      const tableValue = info.table[value - info.min];
      if (tableValue) {
        return { value: tableValue, info };
      }
    }

    return { value, info };
  } catch (error) {
    console.error(`[MSP] getSetting(${name}) failed:`, error);
    return null;
  }
}

/**
 * Set a CLI setting value by name
 * Uses MSP2_COMMON_SET_SETTING (0x1004)
 */
export async function setSetting(name: string, value: string | number): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  const info = await getSettingInfo(name);
  if (!info) {
    console.error(`[MSP] setSetting: Unknown setting ${name}`);
    return false;
  }

  try {
    // Convert string enum value to numeric index if we have a lookup table
    let numericValue = value;
    if (info.table && typeof value === 'string') {
      const idx = info.table.indexOf(value);
      if (idx >= 0) {
        numericValue = idx + info.min;
      } else {
        console.error(`[MSP] Invalid enum value "${value}" for ${name}. Valid: ${info.table.join(', ')}`);
        return false;
      }
    }

    // Build payload: index (3 bytes) + value
    const indexPart = encodeSettingIndex(info.index);
    let valuePart: Uint8Array;

    switch (info.type) {
      case 'uint8_t':
      case 'int8_t':
        valuePart = new Uint8Array(1);
        valuePart[0] = Number(numericValue) & 0xFF;
        break;
      case 'uint16_t':
      case 'int16_t':
        valuePart = new Uint8Array(2);
        valuePart[0] = Number(numericValue) & 0xFF;
        valuePart[1] = (Number(numericValue) >> 8) & 0xFF;
        break;
      case 'uint32_t': {
        valuePart = new Uint8Array(4);
        const uval = Number(numericValue);
        valuePart[0] = uval & 0xFF;
        valuePart[1] = (uval >> 8) & 0xFF;
        valuePart[2] = (uval >> 16) & 0xFF;
        valuePart[3] = (uval >> 24) & 0xFF;
        break;
      }
      case 'float': {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = Number(numericValue);
        valuePart = new Uint8Array(buf);
        break;
      }
      case 'string': {
        const strVal = String(value);
        valuePart = new Uint8Array(strVal.length);
        for (let i = 0; i < strVal.length; i++) {
          valuePart[i] = strVal.charCodeAt(i);
        }
        break;
      }
      default:
        console.error(`[MSP] Unknown type ${info.type} for ${name}`);
        return false;
    }

    // Combine index and value
    const payload = new Uint8Array(indexPart.length + valuePart.length);
    payload.set(indexPart, 0);
    payload.set(valuePart, indexPart.length);

    await sendMspV2RequestWithPayload(MSP2.COMMON_SET_SETTING, payload, 2000);
    return true;
  } catch (error) {
    console.error(`[MSP] setSetting(${name}, ${value}) failed:`, error);
    return false;
  }
}

/**
 * Get multiple settings at once (convenience wrapper)
 */
export async function getSettings(names: string[]): Promise<Record<string, string | number | null>> {
  const result: Record<string, string | number | null> = {};
  for (const name of names) {
    const setting = await getSetting(name);
    result[name] = setting?.value ?? null;
  }
  return result;
}

/**
 * Set multiple settings at once (convenience wrapper)
 */
export async function setSettings(settings: Record<string, string | number>): Promise<boolean> {
  for (const [name, value] of Object.entries(settings)) {
    const success = await setSetting(name, value);
    if (!success) return false;
  }
  return true;
}
