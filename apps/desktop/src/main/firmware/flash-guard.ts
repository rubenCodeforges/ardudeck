/**
 * Flash Operation Guard
 * BSOD FIX: Prevents concurrent flash operations that could stress USB/serial drivers
 *
 * This module provides a simple mutex to ensure only one flash operation
 * runs at a time, preventing driver conflicts and potential BSOD.
 */

let isFlashing = false;
let flashStartTime: number | null = null;
let flashType: 'serial' | 'dfu' | 'ardupilot' | null = null;

/**
 * Acquire the flash lock
 * @param type The type of flash operation ('serial' or 'dfu')
 * @returns true if lock acquired, false if already locked
 */
export function acquireFlashLock(type: 'serial' | 'dfu' | 'ardupilot'): boolean {
  if (isFlashing) {
    console.warn(`[FlashGuard] Flash operation already in progress (${flashType}), rejecting new ${type} request`);
    return false;
  }
  isFlashing = true;
  flashStartTime = Date.now();
  flashType = type;
  return true;
}

/**
 * Release the flash lock
 */
export function releaseFlashLock(): void {
  if (isFlashing && flashStartTime) {
    const duration = Date.now() - flashStartTime;
  }
  isFlashing = false;
  flashStartTime = null;
  flashType = null;
}

/**
 * Check if a flash operation is in progress
 * @returns true if flashing
 */
export function isFlashInProgress(): boolean {
  return isFlashing;
}

/**
 * Get current flash operation type
 * @returns 'serial', 'dfu', or null
 */
export function getFlashType(): 'serial' | 'dfu' | 'ardupilot' | null {
  return flashType;
}

/**
 * Get flash operation duration in milliseconds
 * @returns duration or null if not flashing
 */
export function getFlashDuration(): number | null {
  if (!isFlashing || !flashStartTime) {
    return null;
  }
  return Date.now() - flashStartTime;
}

/**
 * Force release the flash lock (use with caution, only for error recovery)
 */
export function forceReleaseFlashLock(): void {
  console.warn('[FlashGuard] Force releasing flash lock');
  isFlashing = false;
  flashStartTime = null;
  flashType = null;
}
