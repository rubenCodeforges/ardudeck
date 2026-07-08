/**
 * MAVLink XML Definition Parser
 * Parses MAVLink message definition XML files
 */

import { XMLParser } from 'fast-xml-parser';
import { readFile } from 'fs/promises';
import path from 'path';

export interface MavlinkEnumEntry {
  value: number;
  name: string;
  description: string;
  params?: Array<{ index: number; description: string }>;
}

export interface MavlinkEnum {
  name: string;
  description: string;
  bitmask: boolean;
  entries: MavlinkEnumEntry[];
}

export interface MavlinkField {
  type: string;
  name: string;
  description: string;
  enum?: string;
  units?: string;
  display?: string;
  printFormat?: string;
  arraySize?: number;
  isExtension: boolean;
}

export interface MavlinkMessage {
  id: number;
  name: string;
  description: string;
  fields: MavlinkField[];
  hasExtensions: boolean;
}

export interface MavlinkDefinition {
  version: number;
  dialect: number;
  enums: MavlinkEnum[];
  messages: MavlinkMessage[];
  includes: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => ['entry', 'field', 'param', 'enum', 'message', 'include'].includes(name),
});

/**
 * Parse a MAVLink XML definition file
 */
export async function parseXmlFile(xmlPath: string): Promise<MavlinkDefinition> {
  const content = await readFile(xmlPath, 'utf-8');
  return parseXmlContent(content, path.dirname(xmlPath));
}

/**
 * Parse MAVLink XML content
 */
export function parseXmlContent(content: string, basePath: string = '.'): MavlinkDefinition {
  const result = parser.parse(content);
  const mavlink = result.mavlink;
  // fast-xml-parser drops element order, so the <extensions/> marker's position
  // is unrecoverable from the parsed tree. Recover it from the raw XML: any
  // field declared after the marker is a MAVLink2 extension and MUST be
  // excluded from the crcExtra seed and kept out of the size-sorted wire order.
  const extensionFields = extractExtensionFields(content);

  const definition: MavlinkDefinition = {
    version: parseInt(mavlink.version || '3', 10),
    dialect: parseInt(mavlink.dialect || '0', 10),
    enums: [],
    messages: [],
    includes: [],
  };

  // Parse includes
  if (mavlink.include) {
    definition.includes = mavlink.include.map((inc: string | { '#text': string }) =>
      typeof inc === 'string' ? inc : inc['#text']
    );
  }

  // Parse enums
  if (mavlink.enums?.enum) {
    for (const e of mavlink.enums.enum) {
      definition.enums.push(parseEnum(e));
    }
  }

  // Parse messages
  if (mavlink.messages?.message) {
    for (const m of mavlink.messages.message) {
      definition.messages.push(parseMessage(m, extensionFields.get(m['@_name'] || '')));
    }
  }

  return definition;
}

function parseEnum(e: any): MavlinkEnum {
  const entries: MavlinkEnumEntry[] = [];

  if (e.entry) {
    for (const entry of e.entry) {
      const params: Array<{ index: number; description: string }> = [];

      if (entry.param) {
        for (const p of entry.param) {
          params.push({
            index: parseInt(p['@_index'] || '0', 10),
            description: p['#text'] || '',
          });
        }
      }

      entries.push({
        value: parseInt(entry['@_value'] || '0', 10),
        name: entry['@_name'] || '',
        description: getDescription(entry),
        params: params.length > 0 ? params : undefined,
      });
    }
  }

  return {
    name: e['@_name'] || '',
    description: getDescription(e),
    bitmask: e['@_bitmask'] === 'true',
    entries,
  };
}

/** Extension field names per message, recovered from raw XML (see parseXmlContent). */
function extractExtensionFields(content: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const msgRe = /<message\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/message>/g;
  for (let m; (m = msgRe.exec(content)) !== null; ) {
    const body = m[2]!;
    const marker = body.match(/<extensions\s*\/>/);
    if (!marker || marker.index === undefined) continue;
    const names = new Set<string>();
    const fieldRe = /<field\b[^>]*\bname="([^"]+)"/g;
    for (let f; (f = fieldRe.exec(body.slice(marker.index + marker[0].length))) !== null; ) {
      names.add(f[1]!);
    }
    map.set(m[1]!, names);
  }
  return map;
}

function parseMessage(m: any, extensionFieldNames?: Set<string>): MavlinkMessage {
  const fields: MavlinkField[] = [];
  const hasExtensions = m.extensions !== undefined;

  if (m.field) {
    for (const f of m.field) {
      fields.push(parseField(f, extensionFieldNames?.has(f['@_name'] || '') ?? false));
    }
  }

  return {
    id: parseInt(m['@_id'] || '0', 10),
    name: m['@_name'] || '',
    description: getDescription(m),
    fields,
    hasExtensions,
  };
}

function parseField(f: any, isExtension: boolean): MavlinkField {
  const typeStr: string = f['@_type'] || 'uint8_t';

  // Check for array type (e.g., "uint8_t[32]" or "char[50]")
  const arrayMatch = typeStr.match(/^(\w+)\[(\d+)\]$/);

  return {
    type: arrayMatch?.[1] ?? typeStr,
    name: f['@_name'] || '',
    description: f['#text'] || getDescription(f),
    enum: f['@_enum'],
    units: f['@_units'],
    display: f['@_display'],
    printFormat: f['@_print_format'],
    arraySize: arrayMatch?.[2] ? parseInt(arrayMatch[2], 10) : undefined,
    isExtension,
  };
}

function getDescription(obj: any): string {
  if (typeof obj.description === 'string') {
    return obj.description;
  }
  if (obj.description?.['#text']) {
    return obj.description['#text'];
  }
  if (Array.isArray(obj.description)) {
    return obj.description[0]?.['#text'] || obj.description[0] || '';
  }
  return '';
}

/**
 * Calculate CRC extra byte for a message
 * This matches the pymavlink algorithm
 */
export function calculateCrcExtra(message: MavlinkMessage): number {
  // CRC extra is calculated from message name and sorted fields
  let crc = 0xffff;

  // Add message name + space
  const nameBytes = new TextEncoder().encode(message.name + ' ');
  for (const byte of nameBytes) {
    crc = crcAccumulate(byte, crc);
  }

  // Sort fields by type size (descending) for wire format
  const sortedFields = sortFieldsBySize(message.fields.filter(f => !f.isExtension));

  for (const field of sortedFields) {
    // Add field type. The XML alias uint8_t_mavlink_version seeds the CRC as
    // its wire type uint8_t (pymavlink does the same); feeding the alias name
    // produced a wrong crcExtra for HEARTBEAT.
    const crcType = field.type === 'uint8_t_mavlink_version' ? 'uint8_t' : field.type;
    const typeBytes = new TextEncoder().encode(crcType + ' ');
    for (const byte of typeBytes) {
      crc = crcAccumulate(byte, crc);
    }

    // Add field name
    const fieldNameBytes = new TextEncoder().encode(field.name + ' ');
    for (const byte of fieldNameBytes) {
      crc = crcAccumulate(byte, crc);
    }

    // Add array size if present
    if (field.arraySize !== undefined) {
      crc = crcAccumulate(field.arraySize, crc);
    }
  }

  return (crc & 0xff) ^ (crc >> 8);
}

function crcAccumulate(byte: number, crc: number): number {
  let ch = (byte ^ (crc & 0x00ff)) & 0xff;
  ch = (ch ^ ((ch << 4) & 0xff)) & 0xff;
  return ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
}

const TYPE_SIZES: Record<string, number> = {
  uint64_t: 8,
  int64_t: 8,
  double: 8,
  uint32_t: 4,
  int32_t: 4,
  float: 4,
  uint16_t: 2,
  int16_t: 2,
  uint8_t: 1,
  int8_t: 1,
  char: 1,
  uint8_t_mavlink_version: 1,
};

export function sortFieldsBySize(fields: MavlinkField[]): MavlinkField[] {
  return [...fields].sort((a, b) => {
    const sizeA = TYPE_SIZES[a.type] || 1;
    const sizeB = TYPE_SIZES[b.type] || 1;
    return sizeB - sizeA; // Descending order
  });
}

export function getFieldSize(field: MavlinkField): number {
  const baseSize = TYPE_SIZES[field.type] || 1;
  return field.arraySize ? baseSize * field.arraySize : baseSize;
}

export function getMessageSize(message: MavlinkMessage, includeExtensions = false): number {
  return message.fields
    .filter((f) => includeExtensions || !f.isExtension)
    .reduce((sum, f) => sum + getFieldSize(f), 0);
}
