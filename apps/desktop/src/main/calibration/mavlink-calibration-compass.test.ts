import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initMavlinkCalibration,
  startMavlinkCalibration,
  cancelMavlinkCalibration,
  handleMagCalProgress,
  handleMagCalReport,
  handleCalibrationStatusText,
  type MavlinkCalibrationDeps,
} from './mavlink-calibration.js';
import type { CalibrationCompleteEvent } from '../../shared/calibration-types.js';

const MAV_CMD_DO_START_MAG_CAL = 42424;
const MAV_CMD_PREFLIGHT_CALIBRATION = 241;

function makeDeps() {
  const commands: Array<{ command: number; params: Record<string, number> }> = [];
  const progress: unknown[] = [];
  const complete: CalibrationCompleteEvent[] = [];
  const deps: MavlinkCalibrationDeps = {
    sendCommandLong: vi.fn(async (command, params) => {
      commands.push({ command, params });
      return true;
    }),
    sendCommandAck: vi.fn(async () => true),
    sendLog: vi.fn(),
    sendProgress: vi.fn((e) => progress.push(e)),
    sendComplete: vi.fn((e) => complete.push(e)),
  };
  return { deps, commands, progress, complete };
}

describe('compass calibration command', () => {
  let ctx: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    ctx = makeDeps();
    initMavlinkCalibration(ctx.deps);
  });

  afterEach(() => {
    cancelMavlinkCalibration();
    vi.clearAllTimers();
  });

  it('starts compass cal with DO_START_MAG_CAL, not the unsupported PREFLIGHT_CALIBRATION', async () => {
    await startMavlinkCalibration('compass');
    const sent = ctx.commands.at(-1)!;
    expect(sent.command).toBe(MAV_CMD_DO_START_MAG_CAL);
    expect(sent.command).not.toBe(MAV_CMD_PREFLIGHT_CALIBRATION);
    // mag_mask=0 (all compasses), autosave on success
    expect(sent.params.param1).toBe(0);
    expect(sent.params.param3).toBe(1);
    // retry a failed fit, as Mission Planner does (#159)
    expect(sent.params.param2).toBe(1);
  });

  it('completes only after every compass in the mask reports SUCCESS', async () => {
    await startMavlinkCalibration('compass');
    // Two compasses being calibrated (mask 0b11).
    handleMagCalReport(0, 0b11, 4 /* SUCCESS */, 8.2);
    expect(ctx.complete).toHaveLength(0); // still one outstanding
    handleMagCalReport(1, 0b11, 4 /* SUCCESS */, 9.1);
    expect(ctx.complete).toEqual([{
      type: 'compass',
      success: true,
      rebootRequired: true,
      data: { compassResults: [
        { compass: 0, fitness: 8.2, orientation: null },
        { compass: 1, fitness: 9.1, orientation: null },
      ] },
    }]);
  });

  it('keeps going when a compass reports FAILED: the firmware retries the fit (#159)', async () => {
    await startMavlinkCalibration('compass');
    handleMagCalReport(0, 0b1, 5 /* FAILED */, 0);
    expect(ctx.complete).toHaveLength(0);
    handleMagCalReport(0, 0b1, 4 /* SUCCESS */, 6.1);
    expect(ctx.complete).toHaveLength(1);
    expect(ctx.complete[0]!.success).toBe(true);
  });

  it('fails with the last reason when nothing converges before the time limit', async () => {
    vi.useFakeTimers();
    try {
      await startMavlinkCalibration('compass');
      handleCalibrationStatusText('Mag(1) calibration bad radius', 4);
      expect(ctx.complete).toHaveLength(0);
      vi.advanceTimersByTime(300_000);
      expect(ctx.complete).toHaveLength(1);
      expect(ctx.complete[0]!.success).toBe(false);
      expect(ctx.complete[0]!.error).toMatch(/radius|interference/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a converged compass when another one is still retrying at the time limit', async () => {
    vi.useFakeTimers();
    try {
      await startMavlinkCalibration('compass');
      handleMagCalReport(0, 0b11, 4 /* SUCCESS */, 5.0);
      handleMagCalReport(1, 0b11, 7 /* BAD_RADIUS */, 0);
      expect(ctx.complete).toHaveLength(0);
      vi.advanceTimersByTime(300_000);
      expect(ctx.complete).toHaveLength(1);
      expect(ctx.complete[0]!.success).toBe(true);
      expect(ctx.complete[0]!.error).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports live progress from MAG_CAL_PROGRESS', async () => {
    await startMavlinkCalibration('compass');
    handleMagCalProgress(0, 3 /* RUNNING */, 42);
    const last = ctx.progress.at(-1) as { type: string; progress: number };
    expect(last.type).toBe('compass');
    expect(last.progress).toBe(42);
  });

  // ArduPilot 4.6 does not send "compass cal complete"; it narrates completion
  // over STATUSTEXT. MAG_CAL_REPORT (192) was observed NOT to arrive on a
  // MatekH743, so STATUSTEXT is the reliable completion path.
  it('completes on the real ArduPilot "calibrated requires reboot" STATUSTEXT', async () => {
    await startMavlinkCalibration('compass');
    handleCalibrationStatusText('PreArm: Compass calibrated requires reboot', 4);
    expect(ctx.complete).toEqual([{
      type: 'compass', success: true, rebootRequired: true, data: { compassResults: [] },
    }]);
  });

  it('does not complete on the "calibration running" STATUSTEXT', async () => {
    await startMavlinkCalibration('compass');
    handleCalibrationStatusText('PreArm: Compass calibration running', 4);
    expect(ctx.complete).toHaveLength(0);
  });

  it('shows a "bad orientation" STATUSTEXT as a retry, not the end of the run', async () => {
    await startMavlinkCalibration('compass');
    handleCalibrationStatusText('Compass 1 calibration bad orientation', 4);
    expect(ctx.complete).toHaveLength(0);
    const last = ctx.progress.at(-1) as { statusText: string };
    expect(last.statusText).toMatch(/orientation/i);
  });

  it('captures per-compass fitness + orientation and reports it on completion', async () => {
    await startMavlinkCalibration('compass');
    // Real ArduPilot string carrying orientation (8=Roll180) and fitness (7.9).
    handleCalibrationStatusText('Mag(1) new orientation: 8 was 4 7.9', 6);
    handleCalibrationStatusText('PreArm: Compass calibrated requires reboot', 4);
    const done = ctx.complete[0]!;
    expect(done.success).toBe(true);
    expect(done.rebootRequired).toBe(true);
    expect(done.data?.compassResults).toEqual([{ compass: 1, fitness: 7.9, orientation: 8 }]);
  });
});
