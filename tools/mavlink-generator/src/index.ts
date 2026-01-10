#!/usr/bin/env node
/**
 * MAVLink XML to TypeScript Code Generator
 * Generates TypeScript types from MAVLink XML definitions
 */

import { readdir, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { parseXmlFile, type MavlinkDefinition, type MavlinkEnum, type MavlinkMessage } from './parsers/xml-parser.js';
import { generateEnum, generateEnumIndex, getEnumFileName } from './generators/enum-generator.js';
import { generateMessage, generateMessageIndex, getMessageFileName } from './generators/message-generator.js';
import { generateRegistry, generateMainIndex } from './generators/registry-generator.js';

interface GeneratorOptions {
  /** Input directory containing XML files */
  inputDir: string;
  /** Output directory for generated TypeScript */
  outputDir: string;
  /** Specific dialects to include (empty = all) */
  dialects?: string[];
}

/**
 * Load all MAVLink definitions from a directory
 */
async function loadDefinitions(inputDir: string, dialects?: string[]): Promise<MavlinkDefinition[]> {
  const files = await readdir(inputDir);
  const xmlFiles = files.filter((f) => f.endsWith('.xml'));

  // Filter by dialects if specified
  const targetFiles = dialects && dialects.length > 0
    ? xmlFiles.filter((f) => dialects.some((d) => f.includes(d)))
    : xmlFiles;

  console.log(`Found ${targetFiles.length} XML files to process`);

  const definitions: MavlinkDefinition[] = [];

  for (const file of targetFiles) {
    const filePath = path.join(inputDir, file);
    console.log(`  Parsing ${file}...`);
    try {
      const def = await parseXmlFile(filePath);
      definitions.push(def);
    } catch (error) {
      console.error(`  Error parsing ${file}: ${(error as Error).message}`);
    }
  }

  return definitions;
}

/**
 * Merge multiple definitions, handling includes and deduplication
 */
function mergeDefinitions(definitions: MavlinkDefinition[]): {
  enums: MavlinkEnum[];
  messages: MavlinkMessage[];
} {
  const enumMap = new Map<string, MavlinkEnum>();
  const messageMap = new Map<number, MavlinkMessage>();

  for (const def of definitions) {
    for (const e of def.enums) {
      // Later definitions override earlier ones
      enumMap.set(e.name, e);
    }

    for (const m of def.messages) {
      messageMap.set(m.id, m);
    }
  }

  return {
    enums: Array.from(enumMap.values()),
    messages: Array.from(messageMap.values()).sort((a, b) => a.id - b.id),
  };
}

/**
 * Generate TypeScript code
 */
async function generate(options: GeneratorOptions): Promise<void> {
  const { inputDir, outputDir } = options;

  console.log('MAVLink TypeScript Generator');
  console.log('============================');
  console.log(`Input:  ${inputDir}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  // Load definitions
  console.log('Loading XML definitions...');
  const definitions = await loadDefinitions(inputDir, options.dialects);

  if (definitions.length === 0) {
    console.error('No definitions found!');
    process.exit(1);
  }

  // Merge definitions
  console.log('Merging definitions...');
  const { enums, messages } = mergeDefinitions(definitions);
  console.log(`  ${enums.length} enums`);
  console.log(`  ${messages.length} messages`);
  console.log('');

  // Create output directories
  const enumsDir = path.join(outputDir, 'enums');
  const messagesDir = path.join(outputDir, 'messages');
  await mkdir(enumsDir, { recursive: true });
  await mkdir(messagesDir, { recursive: true });

  // Generate enums
  console.log('Generating enums...');
  for (const e of enums) {
    const code = generateEnum(e);
    const fileName = getEnumFileName(e);
    await writeFile(path.join(enumsDir, fileName), code);
  }
  await writeFile(path.join(enumsDir, 'index.ts'), generateEnumIndex(enums));
  console.log(`  Generated ${enums.length} enum files`);

  // Generate messages
  console.log('Generating messages...');
  for (const m of messages) {
    const code = generateMessage(m);
    const fileName = getMessageFileName(m);
    await writeFile(path.join(messagesDir, fileName), code);
  }
  await writeFile(path.join(messagesDir, 'index.ts'), generateMessageIndex(messages));
  console.log(`  Generated ${messages.length} message files`);

  // Generate registry
  console.log('Generating message registry...');
  const registryCode = generateRegistry(messages);
  await writeFile(path.join(outputDir, 'message-registry.ts'), registryCode);

  // Generate main index
  const indexCode = generateMainIndex(enums.length > 0, messages.length > 0);
  await writeFile(path.join(outputDir, 'index.ts'), indexCode);

  console.log('');
  console.log('Generation complete!');
}

// CLI
async function main() {
  const args = process.argv.slice(2);

  // Default paths
  let inputDir = path.resolve('./MissionPlanner/ExtLibs/Mavlink/message_definitions');
  let outputDir = path.resolve('./packages/mavlink-ts/src/generated');

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      const next = args[++i];
      if (next) inputDir = path.resolve(next);
    } else if (arg === '--output' || arg === '-o') {
      const next = args[++i];
      if (next) outputDir = path.resolve(next);
    } else if (arg === '--help' || arg === '-h') {
      console.log('MAVLink TypeScript Generator');
      console.log('');
      console.log('Usage: mavlink-generator [options]');
      console.log('');
      console.log('Options:');
      console.log('  -i, --input <dir>   Input directory with XML files');
      console.log('  -o, --output <dir>  Output directory for TypeScript');
      console.log('  -h, --help          Show this help');
      process.exit(0);
    }
  }

  try {
    await generate({ inputDir, outputDir });
  } catch (error) {
    console.error('Error:', (error as Error).message);
    process.exit(1);
  }
}

main();
