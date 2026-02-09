/**
 * OSD Element Size Definitions
 *
 * Sizes are now sourced from the element registry.
 * This file provides backward-compatible exports.
 */

import {
  type OsdElementId,
  type ElementSize,
  ELEMENT_REGISTRY,
  getElementSizeFromRegistry,
} from './element-registry';

/**
 * Size of each OSD element in character units
 * Built from the element registry
 */
export const OSD_ELEMENT_SIZES: Record<string, ElementSize> = {};
for (const def of ELEMENT_REGISTRY) {
  OSD_ELEMENT_SIZES[def.id] = def.size;
}

/**
 * Get element size with fallback
 */
export function getElementSize(id: OsdElementId): ElementSize {
  return getElementSizeFromRegistry(id);
}
