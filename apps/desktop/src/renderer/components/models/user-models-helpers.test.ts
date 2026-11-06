import { describe, it, expect } from 'vitest';
import {
  isModelFileName, carriesFiles, filterModelFiles, applyPlacementField, normalizeYaw,
  bearingDeg, handleOffsetPx, bearingFromOffsetPx, summarizeImport, fileBaseName,
} from './user-models-helpers';
import type { UserModelPlacement } from '../../../shared/scene-models/user-models';

const base: UserModelPlacement = {
  lat: 25.03, lng: 121.56, alt: 10, altitudeMode: 'agl', yawDeg: 0, pitchDeg: 0, rollDeg: 0, scale: 1,
};

describe('drop filtering', () => {
  it('accepts the model extensions case-insensitively', () => {
    for (const n of ['a.glb', 'B.GLTF', 'site.kmz', 'x.kml', 'tileset.json', 'city.cityjson', 'scan.las', 'SCAN.LAZ', 'cloud.ply']) {
      expect(isModelFileName(n)).toBe(true);
    }
  });

  it('rejects other files', () => {
    for (const n of ['photo.jpg', 'mission.waypoints', 'glb', 'notes.txt']) {
      expect(isModelFileName(n)).toBe(false);
    }
  });

  it('keeps only model files from a mixed drop', () => {
    const files = [{ name: 'a.glb' }, { name: 'b.png' }, { name: 'c.cityjson' }];
    expect(filterModelFiles(files).map((f) => f.name)).toEqual(['a.glb', 'c.cityjson']);
    expect(filterModelFiles(null)).toEqual([]);
  });

  it('only treats drags that carry files as file drops', () => {
    expect(carriesFiles(['Files'])).toBe(true);
    expect(carriesFiles(['text/plain'])).toBe(false);
    expect(carriesFiles(['application/x-fleet-vehicle', 'text/plain'])).toBe(false);
    expect(carriesFiles(undefined)).toBe(false);
  });
});

describe('placement editing', () => {
  it('applies an in-range value', () => {
    expect(applyPlacementField(base, 'alt', 42)?.alt).toBe(42);
    expect(applyPlacementField(base, 'scale', 0.5)?.scale).toBe(0.5);
  });

  it('refuses out-of-range and non-finite values', () => {
    expect(applyPlacementField(base, 'lat', 91)).toBeNull();
    expect(applyPlacementField(base, 'lng', -181)).toBeNull();
    expect(applyPlacementField(base, 'scale', 0)).toBeNull();
    expect(applyPlacementField(base, 'alt', Number.NaN)).toBeNull();
  });

  it('normalises yaw into 0..360', () => {
    expect(applyPlacementField(base, 'yawDeg', -90)?.yawDeg).toBe(270);
    expect(applyPlacementField(base, 'yawDeg', 360)?.yawDeg).toBe(0);
    expect(normalizeYaw(725.04)).toBe(5);
  });

  it('does not mutate the source placement', () => {
    applyPlacementField(base, 'alt', 99);
    expect(base.alt).toBe(10);
  });
});

describe('rotate handle geometry', () => {
  it('bearing between points', () => {
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBe(0);
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBe(90);
    expect(bearingDeg({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBe(180);
  });

  it('screen offset round-trips through the bearing', () => {
    for (const yaw of [0, 45, 90, 180, 270, 315]) {
      const o = handleOffsetPx(yaw, 60);
      expect(bearingFromOffsetPx(o.x, o.y)).toBeCloseTo(yaw, 5);
    }
  });

  it('north is up on screen', () => {
    const o = handleOffsetPx(0, 60);
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(-60);
  });
});

describe('summarizeImport', () => {
  it('is a success when everything landed with a position', () => {
    const s = summarizeImport({ imported: [{ id: 'a' } as never], failed: [], needsPlacement: [] });
    expect(s).toMatchObject({ imported: 1, failed: 0, needsPlacement: 0, tone: 'success', focusId: null });
  });

  it('warns and focuses the first model that needs a position', () => {
    const s = summarizeImport({ imported: [{ id: 'a' } as never, { id: 'b' } as never], failed: [], needsPlacement: ['b'] });
    expect(s.tone).toBe('warning');
    expect(s.focusId).toBe('b');
  });

  it('is an error when nothing imported', () => {
    const s = summarizeImport({ imported: [], failed: [{ file: '/x/a.glb', error: 'bad' }], needsPlacement: [] });
    expect(s.tone).toBe('error');
  });

  it('warns on a partial failure', () => {
    const s = summarizeImport({ imported: [{ id: 'a' } as never], failed: [{ file: 'b', error: 'bad' }], needsPlacement: [] });
    expect(s.tone).toBe('warning');
  });
});

describe('fileBaseName', () => {
  it('handles both separators', () => {
    expect(fileBaseName('/a/b/c.glb')).toBe('c.glb');
    expect(fileBaseName('C:\\x\\y.kmz')).toBe('y.kmz');
  });
});
