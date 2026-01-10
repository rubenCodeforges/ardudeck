/**
 * CLI Parameters Library
 *
 * A collection of parsed CLI parameter dumps from various firmware versions.
 * Used for autocomplete, validation, and parameter discovery.
 *
 * To add new params:
 * 1. Connect to a board, enter CLI, run `dump`
 * 2. Click "Save JSON" in CLI toolbar
 * 3. Move the JSON file here and import it below
 */

// =============================================================================
// Types
// =============================================================================

export interface CliParamDefinition {
  value: string;
  section: string; // 'master' | 'profile' | 'battery_profile'
}

export interface CliParamsFile {
  variant: string; // 'INAV' | 'BTFL' | 'CLFL'
  version: string; // '9.0.0'
  exportDate: string;
  parameterCount: number;
  parameters: Record<string, CliParamDefinition>;
}

// =============================================================================
// Parameter Library
// =============================================================================

// Import param files here as they're added
// import inav900 from './inav-9.0.0-params.json';
// import btfl450 from './betaflight-4.5.0-params.json';

const paramLibrary: CliParamsFile[] = [
  // Add imported param files here:
  // inav900,
  // btfl450,
];

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Find the best matching param file for a given firmware variant and version
 */
export function findParamFile(variant: string, version: string): CliParamsFile | null {
  // Exact match first
  const exact = paramLibrary.find(
    (p) => p.variant.toUpperCase() === variant.toUpperCase() && p.version === version
  );
  if (exact) return exact;

  // Same variant, closest version (prefer older)
  const sameVariant = paramLibrary
    .filter((p) => p.variant.toUpperCase() === variant.toUpperCase())
    .sort((a, b) => compareVersions(b.version, a.version));

  // Find closest version that's <= target
  for (const p of sameVariant) {
    if (compareVersions(p.version, version) <= 0) {
      return p;
    }
  }

  // Fallback to any same variant
  return sameVariant[0] || null;
}

/**
 * Get all parameter names for a firmware variant/version
 */
export function getParamNames(variant: string, version: string): string[] {
  const file = findParamFile(variant, version);
  if (!file) return [];
  return Object.keys(file.parameters).sort();
}

/**
 * Check if a parameter exists for a firmware variant/version
 */
export function hasParam(variant: string, version: string, paramName: string): boolean {
  const file = findParamFile(variant, version);
  if (!file) return false;
  return paramName in file.parameters;
}

/**
 * Get default value for a parameter
 */
export function getParamDefault(
  variant: string,
  version: string,
  paramName: string
): string | null {
  const file = findParamFile(variant, version);
  if (!file) return null;
  return file.parameters[paramName]?.value ?? null;
}

/**
 * Get all available firmware versions in the library
 */
export function getAvailableVersions(): Array<{ variant: string; version: string }> {
  return paramLibrary.map((p) => ({ variant: p.variant, version: p.version }));
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compare semver versions: returns -1 if a < b, 0 if equal, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}
