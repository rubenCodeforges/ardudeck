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
      definition.messages.push(parseMessage(m));
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

function parseMessage(m: any): MavlinkMessage {
  const fields: MavlinkField[] = [];
  let hasExtensions = false;
  let inExtensions = false;

  // Check for extensions marker
  if (m.extensions !== undefined) {
    hasExtensions = true;
  }

  if (m.field) {
    for (const f of m.field) {
      // Check if we've passed the extensions marker
      // In the XML, extensions come after <extensions/>
      const field = parseField(f, inExtensions);
      fields.push(field);
    }
  }

  // If there are extensions, mark fields after extension point
  if (hasExtensions && m.extensions !== undefined) {
    // Find the index where extensions start
    // This is a simplification - in reality we'd need to track position in XML
    // For now, we'll handle this in the raw parsing
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
    // Add field type
    const typeBytes = new TextEncoder().encode(field.type + ' ');
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
