import { describe, it, expect } from 'vitest';
import {
  assessAccelCalibration,
  assessCompassFitness,
  verifyCalibrationPersisted,
} from '../calibration-quality';

describe('assessCompassFitness', () => {
  it('passes a tight fit', () => {
    expect(assessCompassFitness(2.1).verdict).toBe('good');
  });

  it('does not pass a mediocre fit just because the FC accepted it', () => {
    // 4.2 is well inside ArduPilot's COMPASS_CAL_FIT of 16, so the FC reports
    // SUCCESS, but it is not a calibration to fly on.
    expect(assessCompassFitness(4.2).verdict).toBe('marginal');
  });

  it('flags a fit the FC accepted but that will drift', () => {
    // The crash case: the flight controller reports SUCCESS at fitness 14, the
    // wizard says done, and the heading is wrong in the air.
    const result = assessCompassFitness(14);
    expect(result.verdict).toBe('marginal');
    expect(result.summary).toContain('Accepted but weak');
    expect(result.advice).toBeDefined();
  });

  it('fails past the configured limit', () => {
    expect(assessCompassFitness(20).verdict).toBe('bad');
  });

  it('honours a stricter COMPASS_CAL_FIT', () => {
    expect(assessCompassFitness(6, 4).verdict).toBe('bad');
  });

  it('says unknown rather than good when nothing was reported', () => {
    expect(assessCompassFitness(Number.NaN).verdict).toBe('unknown');
  });
});

describe('assessAccelCalibration', () => {
  it('passes a clean calibration', () => {
    expect(assessAccelCalibration({
      offsets: { x: 0.2, y: -0.3, z: 0.4 },
      scales: { x: 1.01, y: 0.99, z: 1.0 },
    }).verdict).toBe('good');
  });

  it('calls factory defaults never-calibrated, not perfect', () => {
    // Zero offsets and unity scales look ideal to a naive check. They mean the
    // accelerometer has never been calibrated at all.
    const result = assessAccelCalibration({
      offsets: { x: 0, y: 0, z: 0 },
      scales: { x: 1, y: 1, z: 1 },
    });
    expect(result.verdict).toBe('bad');
    expect(result.summary).toContain('never been calibrated');
  });

  it('warns before the vehicle refuses to arm', () => {
    expect(assessAccelCalibration({
      offsets: { x: 1.4, y: 0.8, z: 0.6 },
      scales: { x: 1.0, y: 1.0, z: 1.0 },
    }).verdict).toBe('marginal');
  });

  it('fails an offset past the arming limit', () => {
    expect(assessAccelCalibration({
      offsets: { x: 3.0, y: 2.0, z: 0.5 },
      scales: { x: 1.0, y: 1.0, z: 1.0 },
    }).verdict).toBe('bad');
  });

  it('fails a scale past the arming limit', () => {
    expect(assessAccelCalibration({
      offsets: { x: 0.1, y: 0.1, z: 0.1 },
      scales: { x: 1.3, y: 1.0, z: 1.0 },
    }).verdict).toBe('bad');
  });

  it('says unknown when nothing was read', () => {
    expect(assessAccelCalibration({}).verdict).toBe('unknown');
  });
});

describe('verifyCalibrationPersisted', () => {
  const written = { INS_ACCOFFS_X: 0.42, INS_ACCOFFS_Y: -0.11, INS_ACCSCAL_X: 1.002 };

  it('verifies values that came back intact', () => {
    const result = verifyCalibrationPersisted(written, { ...written });
    expect(result.state).toBe('verified');
    expect(result.mismatched).toEqual([]);
  });

  it('tolerates float32 round-tripping', () => {
    expect(verifyCalibrationPersisted(written, {
      INS_ACCOFFS_X: 0.4200001,
      INS_ACCOFFS_Y: -0.10999998,
      INS_ACCSCAL_X: 1.0020001,
    }).state).toBe('verified');
  });

  it('catches a calibration the reboot threw away', () => {
    // This is the failure the operator could not see: the FC came back up with
    // its old values and the app said nothing.
    const result = verifyCalibrationPersisted(written, {
      INS_ACCOFFS_X: 0,
      INS_ACCOFFS_Y: -0.11,
      INS_ACCSCAL_X: 1.002,
    });
    expect(result.state).toBe('not-persisted');
    expect(result.mismatched).toEqual(['INS_ACCOFFS_X']);
  });

  it('reports unverified, never verified, when nothing could be read back', () => {
    const result = verifyCalibrationPersisted(written, {});
    expect(result.state).toBe('unverified');
  });

  it('leaves a partly read-back record unverified instead of condemning it (#159)', () => {
    // A dropped PARAM_VALUE on a lossy telemetry link is not proof the reboot lost the value.
    const result = verifyCalibrationPersisted(written, {
      INS_ACCOFFS_X: 0.42,
      INS_ACCOFFS_Y: -0.11,
    });
    expect(result.state).toBe('unverified');
    expect(result.mismatched).toContain('INS_ACCSCAL_X');
  });

  it('still flags a real loss when other values are missing', () => {
    const result = verifyCalibrationPersisted(written, {
      INS_ACCOFFS_X: 0,
      INS_ACCOFFS_Y: -0.11,
    });
    expect(result.state).toBe('not-persisted');
    expect(result.mismatched).toEqual(['INS_ACCOFFS_X']);
  });
});
