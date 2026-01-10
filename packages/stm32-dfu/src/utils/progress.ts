/**
 * Progress Tracking Utilities
 */

import type { FlashProgress, ProgressCallback, FlashPhase } from '../types.js';

/**
 * Progress tracker for multi-phase operations
 */
export class ProgressTracker {
  private phases: FlashPhase[];
  private phaseWeights: Record<FlashPhase, number>;
  private currentPhaseIndex: number = 0;
  private callback?: ProgressCallback;

  constructor(
    phases: FlashPhase[],
    weights?: Partial<Record<FlashPhase, number>>,
    callback?: ProgressCallback,
  ) {
    this.phases = phases;
    this.callback = callback;

    // Default weights (can be overridden)
    this.phaseWeights = {
      erase: 20,
      download: 60,
      verify: 15,
      manifest: 5,
      ...weights,
    };
  }

  /**
   * Set the progress callback
   */
  setCallback(callback: ProgressCallback): void {
    this.callback = callback;
  }

  /**
   * Get the current phase
   */
  get currentPhase(): FlashPhase {
    return this.phases[this.currentPhaseIndex] || 'download';
  }

  /**
   * Move to the next phase
   */
  nextPhase(): void {
    if (this.currentPhaseIndex < this.phases.length - 1) {
      this.currentPhaseIndex++;
    }
  }

  /**
   * Report progress within current phase
   */
  report(current: number, total: number, message?: string): void {
    if (!this.callback) return;

    const phasePercent = total > 0 ? (current / total) * 100 : 0;

    // Calculate overall percent based on phase weights
    let previousPhasesWeight = 0;
    for (let i = 0; i < this.currentPhaseIndex; i++) {
      previousPhasesWeight += this.phaseWeights[this.phases[i]!] || 0;
    }

    const currentPhaseWeight = this.phaseWeights[this.currentPhase] || 0;
    const totalWeight = this.phases.reduce(
      (sum, phase) => sum + (this.phaseWeights[phase] || 0),
      0,
    );

    const overallPercent = totalWeight > 0
      ? ((previousPhasesWeight + (currentPhaseWeight * phasePercent / 100)) / totalWeight) * 100
      : phasePercent;

    this.callback({
      phase: this.currentPhase,
      current,
      total,
      percent: Math.round(phasePercent),
      message,
    });
  }

  /**
   * Create a callback for a specific phase
   */
  createPhaseCallback(phase: FlashPhase): ProgressCallback {
    return (progress) => {
      if (!this.callback) return;

      // Find this phase in our phases list
      const phaseIndex = this.phases.indexOf(phase);
      if (phaseIndex >= 0) {
        this.currentPhaseIndex = phaseIndex;
      }

      this.callback(progress);
    };
  }
}

/**
 * Format bytes as human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format transfer speed
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Estimate remaining time
 */
export function estimateTimeRemaining(
  bytesCompleted: number,
  totalBytes: number,
  elapsedMs: number,
): number {
  if (bytesCompleted === 0 || elapsedMs === 0) {
    return 0;
  }

  const bytesRemaining = totalBytes - bytesCompleted;
  const bytesPerMs = bytesCompleted / elapsedMs;

  return bytesPerMs > 0 ? bytesRemaining / bytesPerMs : 0;
}

/**
 * Format time as mm:ss
 */
export function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${remainingSeconds}s`;
}
