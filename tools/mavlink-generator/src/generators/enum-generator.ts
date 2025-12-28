/**
 * TypeScript Enum Generator
 * Generates TypeScript enums from MAVLink enum definitions
 */

import type { MavlinkEnum } from '../parsers/xml-parser.js';

/**
 * Convert MAVLink enum name to TypeScript-friendly name
 */
function toEnumName(name: string): string {
  // Already in SCREAMING_SNAKE_CASE, convert to PascalCase
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

/**
 * Generate TypeScript code for a single enum
 */
export function generateEnum(mavEnum: MavlinkEnum): string {
  const lines: string[] = [];
  const enumName = toEnumName(mavEnum.name);

  // JSDoc comment
  if (mavEnum.description) {
    lines.push('/**');
    lines.push(` * ${mavEnum.description.replace(/\n/g, '\n * ')}`);
    if (mavEnum.bitmask) {
      lines.push(' * @bitmask');
    }
    lines.push(' */');
  }

  // Enum declaration
  lines.push(`export enum ${enumName} {`);

  for (const entry of mavEnum.entries) {
    // Entry comment
    if (entry.description) {
      lines.push(`  /** ${entry.description.replace(/\n/g, ' ')} */`);
    }
    lines.push(`  ${entry.name} = ${entry.value},`);
  }

  lines.push('}');

  // Also export the original name as an alias for compatibility
  if (enumName !== mavEnum.name) {
    lines.push('');
    lines.push(`/** @deprecated Use ${enumName} instead */`);
    lines.push(`export const ${mavEnum.name} = ${enumName};`);
  }

  return lines.join('\n');
}

/**
 * Generate index file for all enums
 */
export function generateEnumIndex(enums: MavlinkEnum[]): string {
  const exports = enums.map((e) => {
    const fileName = toKebabCase(e.name);
    return `export * from './${fileName}.js';`;
  });

  return exports.join('\n');
}

/**
 * Get the filename for an enum
 */
export function getEnumFileName(mavEnum: MavlinkEnum): string {
  return `${toKebabCase(mavEnum.name)}.ts`;
}

function toKebabCase(name: string): string {
  return name.toLowerCase().replace(/_/g, '-');
}
