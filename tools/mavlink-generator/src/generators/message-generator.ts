/**
 * TypeScript Message Generator
 * Generates TypeScript message types and serializers from MAVLink message definitions
 */

import type { MavlinkMessage, MavlinkField } from '../parsers/xml-parser.js';
import { sortFieldsBySize, calculateCrcExtra, getFieldSize, getMessageSize } from '../parsers/xml-parser.js';

const TYPE_MAP: Record<string, string> = {
  uint8_t: 'number',
  int8_t: 'number',
  uint16_t: 'number',
  int16_t: 'number',
  uint32_t: 'number',
  int32_t: 'number',
  uint64_t: 'bigint',
  int64_t: 'bigint',
  float: 'number',
  double: 'number',
  char: 'string',
  uint8_t_mavlink_version: 'number',
};

const TYPE_SIZES: Record<string, number> = {
  uint8_t: 1,
  int8_t: 1,
  uint16_t: 2,
  int16_t: 2,
  uint32_t: 4,
  int32_t: 4,
  uint64_t: 8,
  int64_t: 8,
  float: 4,
  double: 8,
  char: 1,
  uint8_t_mavlink_version: 1,
};

/**
 * Convert message name to TypeScript interface name
 */
function toInterfaceName(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert field name to camelCase
 */
function toCamelCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Generate TypeScript code for a single message
 */
export function generateMessage(message: MavlinkMessage): string {
  const lines: string[] = [];
  const interfaceName = toInterfaceName(message.name);
  const crcExtra = calculateCrcExtra(message);
  const minLength = getMessageSize(message, false);
  const maxLength = getMessageSize(message, true);

  // JSDoc comment
  lines.push('/**');
  lines.push(` * ${message.description || message.name}`);
  lines.push(` * Message ID: ${message.id}`);
  lines.push(` * CRC Extra: ${crcExtra}`);
  lines.push(' */');

  // Interface
  lines.push(`export interface ${interfaceName} {`);
  for (const field of message.fields) {
    const tsType = getTypeScriptType(field);
    if (field.description) {
      lines.push(`  /** ${field.description.replace(/\n/g, ' ')}${field.units ? ` (${field.units})` : ''} */`);
    }
    lines.push(`  ${toCamelCase(field.name)}: ${tsType};`);
  }
  lines.push('}');
  lines.push('');

  // Constants
  lines.push(`export const ${message.name}_ID = ${message.id};`);
  lines.push(`export const ${message.name}_CRC_EXTRA = ${crcExtra};`);
  lines.push(`export const ${message.name}_MIN_LENGTH = ${minLength};`);
  lines.push(`export const ${message.name}_MAX_LENGTH = ${maxLength};`);
  lines.push('');

  // Serializer
  lines.push(generateSerializer(message, interfaceName));
  lines.push('');

  // Deserializer
  lines.push(generateDeserializer(message, interfaceName));

  return lines.join('\n');
}

function getTypeScriptType(field: MavlinkField): string {
  let tsType = TYPE_MAP[field.type] || 'unknown';

  if (field.arraySize !== undefined) {
    if (field.type === 'char') {
      return 'string';
    }
    return `${tsType}[]`;
  }

  return tsType;
}

function generateSerializer(message: MavlinkMessage, interfaceName: string): string {
  const lines: string[] = [];
  const sortedFields = sortFieldsBySize(message.fields.filter((f) => !f.isExtension));
  const totalSize = sortedFields.reduce((sum, f) => sum + getFieldSize(f), 0);

  lines.push(`export function serialize${interfaceName}(msg: ${interfaceName}): Uint8Array {`);
  lines.push(`  const buffer = new Uint8Array(${totalSize});`);
  lines.push(`  const view = new DataView(buffer.buffer);`);
  lines.push('');

  let offset = 0;
  for (const field of sortedFields) {
    const camelName = toCamelCase(field.name);
    const size = TYPE_SIZES[field.type] || 1;

    if (field.arraySize !== undefined) {
      if (field.type === 'char') {
        lines.push(`  // String: ${field.name}`);
        lines.push(`  const ${camelName}Bytes = new TextEncoder().encode(msg.${camelName} || '');`);
        lines.push(`  buffer.set(${camelName}Bytes.slice(0, ${field.arraySize}), ${offset});`);
      } else {
        lines.push(`  // Array: ${field.name}`);
        lines.push(`  for (let i = 0; i < ${field.arraySize}; i++) {`);
        lines.push(`    ${getSetterCode(field.type, offset, `msg.${camelName}[i] ?? 0`, 'i')}`);
        lines.push(`  }`);
      }
      offset += size * field.arraySize;
    } else if (field.type === 'char') {
      // Single char field - treat as string of length 1
      lines.push(`  // Char: ${field.name}`);
      lines.push(`  buffer[${offset}] = (msg.${camelName} || '').charCodeAt(0) || 0;`);
      offset += size;
    } else {
      lines.push(`  ${getSetterCode(field.type, offset, `msg.${camelName}`)}`);
      offset += size;
    }
  }

  lines.push('');
  lines.push('  return buffer;');
  lines.push('}');

  return lines.join('\n');
}

function generateDeserializer(message: MavlinkMessage, interfaceName: string): string {
  const lines: string[] = [];
  const sortedFields = sortFieldsBySize(message.fields.filter((f) => !f.isExtension));

  lines.push(`export function deserialize${interfaceName}(payload: Uint8Array): ${interfaceName} {`);
  lines.push('  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);');
  lines.push('');
  lines.push('  return {');

  let offset = 0;
  for (const field of sortedFields) {
    const camelName = toCamelCase(field.name);
    const size = TYPE_SIZES[field.type] || 1;

    if (field.arraySize !== undefined) {
      if (field.type === 'char') {
        lines.push(`    ${camelName}: new TextDecoder().decode(payload.slice(${offset}, ${offset + field.arraySize})).replace(/\\0.*$/, ''),`);
      } else {
        lines.push(`    ${camelName}: Array.from({ length: ${field.arraySize} }, (_, i) => ${getGetterCode(field.type, offset, 'i')}),`);
      }
      offset += size * field.arraySize;
    } else if (field.type === 'char') {
      // Single char field - decode as string of length 1
      lines.push(`    ${camelName}: String.fromCharCode(payload[${offset}] || 0),`);
      offset += size;
    } else {
      lines.push(`    ${camelName}: ${getGetterCode(field.type, offset)},`);
      offset += size;
    }
  }

  lines.push('  };');
  lines.push('}');

  return lines.join('\n');
}

function getSetterCode(type: string, baseOffset: number, value: string, indexVar?: string): string {
  const offset = indexVar ? `${baseOffset} + ${indexVar} * ${TYPE_SIZES[type]}` : String(baseOffset);

  switch (type) {
    case 'uint8_t':
    case 'uint8_t_mavlink_version':
      return `buffer[${offset}] = ${value} & 0xff;`;
    case 'int8_t':
      return `view.setInt8(${offset}, ${value});`;
    case 'uint16_t':
      return `view.setUint16(${offset}, ${value}, true);`;
    case 'int16_t':
      return `view.setInt16(${offset}, ${value}, true);`;
    case 'uint32_t':
      return `view.setUint32(${offset}, ${value}, true);`;
    case 'int32_t':
      return `view.setInt32(${offset}, ${value}, true);`;
    case 'uint64_t':
      return `view.setBigUint64(${offset}, BigInt(${value}), true);`;
    case 'int64_t':
      return `view.setBigInt64(${offset}, BigInt(${value}), true);`;
    case 'float':
      return `view.setFloat32(${offset}, ${value}, true);`;
    case 'double':
      return `view.setFloat64(${offset}, ${value}, true);`;
    default:
      return `buffer[${offset}] = ${value} & 0xff;`;
  }
}

function getGetterCode(type: string, baseOffset: number, indexVar?: string): string {
  const offset = indexVar ? `${baseOffset} + ${indexVar} * ${TYPE_SIZES[type]}` : String(baseOffset);

  switch (type) {
    case 'uint8_t':
    case 'uint8_t_mavlink_version':
      return `payload[${offset}]`;
    case 'int8_t':
      return `view.getInt8(${offset})`;
    case 'uint16_t':
      return `view.getUint16(${offset}, true)`;
    case 'int16_t':
      return `view.getInt16(${offset}, true)`;
    case 'uint32_t':
      return `view.getUint32(${offset}, true)`;
    case 'int32_t':
      return `view.getInt32(${offset}, true)`;
    case 'uint64_t':
      return `view.getBigUint64(${offset}, true)`;
    case 'int64_t':
      return `view.getBigInt64(${offset}, true)`;
    case 'float':
      return `view.getFloat32(${offset}, true)`;
    case 'double':
      return `view.getFloat64(${offset}, true)`;
    default:
      return `payload[${offset}]`;
  }
}

/**
 * Get the filename for a message
 */
export function getMessageFileName(message: MavlinkMessage): string {
  return `${message.name.toLowerCase().replace(/_/g, '-')}.ts`;
}

/**
 * Generate index file for all messages
 */
export function generateMessageIndex(messages: MavlinkMessage[]): string {
  const exports = messages.map((m) => {
    const fileName = m.name.toLowerCase().replace(/_/g, '-');
    return `export * from './${fileName}.js';`;
  });

  return exports.join('\n');
}
