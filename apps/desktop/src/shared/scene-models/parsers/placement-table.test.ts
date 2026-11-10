import { describe, expect, it } from 'vitest';
import { parsePlacementTable } from './placement-table';

describe('parsePlacementTable json', () => {
  it('reads the #162 array shape', () => {
    const rows = parsePlacementTable(JSON.stringify([
      { file: 'hangar.glb', lat: 52.01, lng: 4.36, altMsl: 12.5, yawDeg: 90 },
    ]), 'json');
    expect(rows).toEqual([{
      file: 'hangar.glb',
      placement: { lat: 52.01, lng: 4.36, alt: 12.5, altitudeMode: 'amsl', yawDeg: 90, pitchDeg: 0, rollDeg: 0, scale: 1 },
    }]);
  });

  it('reads { models } with aliases and explicit modes', () => {
    const rows = parsePlacementTable(JSON.stringify({ models: [
      { File: 'a.glb', latitude: 1, lon: 2, altitude: 5, altitudeMode: 'agl', heading: 10, pitch: 3, roll: -4, scale: 2, name: 'A' },
      { file: 'b.glb', lat: 1, longitude: 2 },
      { file: 'c.glb', lat: '1.5', lng: '2,5', alt: 7, mode: 'clampToGround' },
    ] }), 'json');
    expect(rows[0]).toEqual({ file: 'a.glb', name: 'A', placement: { lat: 1, lng: 2, alt: 5, altitudeMode: 'agl', yawDeg: 10, pitchDeg: 3, rollDeg: -4, scale: 2 } });
    expect(rows[1]!.placement).toMatchObject({ alt: 0, altitudeMode: 'clamp' });
    expect(rows[2]!.placement).toMatchObject({ lat: 1.5, lng: 2.5, altitudeMode: 'clamp' });
  });

  it('skips invalid rows and keeps valid ones', () => {
    const rows = parsePlacementTable(JSON.stringify([
      { file: 'bad.glb', lat: 95, lng: 0 },
      { lat: 1, lng: 1 },
      { file: 'nan.glb', lat: 1, lng: 1, yawDeg: 'north' },
      { file: 'ok.glb', lat: -33.8, lng: 151.2 },
    ]), 'json');
    expect(rows.map((r) => r.file)).toEqual(['ok.glb']);
  });

  it('throws naming the row when nothing is valid', () => {
    expect(() => parsePlacementTable(JSON.stringify([{ file: 'x.glb', lat: 91, lng: 0 }]), 'json')).toThrow(/Row 1/);
    expect(() => parsePlacementTable('{ nope', 'json')).toThrow(/not valid JSON/);
    expect(() => parsePlacementTable('{"a":1}', 'json')).toThrow();
  });
});

describe('parsePlacementTable csv', () => {
  it('reads commas, quotes and aliases', () => {
    const csv = 'File,Name,Lat,Lon,Alt_MSL,Yaw\r\n"tower one.glb","Tower, north",52.1,4.3,30,45\r\n\r\nshed.glb,,52.2,4.4,,\r\n';
    const rows = parsePlacementTable(csv, 'csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ file: 'tower one.glb', name: 'Tower, north', placement: { lat: 52.1, lng: 4.3, alt: 30, altitudeMode: 'amsl', yawDeg: 45, pitchDeg: 0, rollDeg: 0, scale: 1 } });
    expect(rows[1]!.placement).toMatchObject({ altitudeMode: 'clamp', alt: 0 });
  });

  it('reads semicolons with decimal commas and escaped quotes', () => {
    const csv = '﻿filename;latitude;longitude;alt_agl;mode;yawDeg\n"say ""hi"".glb";52,5;4,25;3;agl;180\n';
    const rows = parsePlacementTable(csv, 'csv');
    expect(rows[0]).toMatchObject({ file: 'say "hi".glb', placement: { lat: 52.5, lng: 4.25, altitudeMode: 'agl', yawDeg: 180 } });
  });

  it('uses altAgl as an agl altitude', () => {
    const rows = parsePlacementTable('file,lat,lng,altAgl\nm.glb,1,2,4\n', 'csv');
    expect(rows[0]!.placement).toMatchObject({ alt: 4, altitudeMode: 'agl' });
  });

  it('throws on a table with only bad rows', () => {
    expect(() => parsePlacementTable('file,lat,lng\nm.glb,abc,2\n', 'csv')).toThrow(/Row 1/);
  });
});

describe('parsePlacementTable geojson', () => {
  it('reads Point features with the altitude from coordinates', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.36, 52.01, 15] }, properties: { file: 'a.glb', name: 'A', yawDeg: 30, scale: 0.5 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [4.37, 52.02] }, properties: { file: 'b.glb', altitudeMode: 'relativeToGround', alt: 2 } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { file: 'c.glb' } },
      ],
    };
    const rows = parsePlacementTable(JSON.stringify(fc), 'geojson');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ file: 'a.glb', name: 'A', placement: { lat: 52.01, lng: 4.36, alt: 15, altitudeMode: 'amsl', yawDeg: 30, pitchDeg: 0, rollDeg: 0, scale: 0.5 } });
    expect(rows[1]!.placement).toMatchObject({ lat: 52.02, lng: 4.37, alt: 2, altitudeMode: 'agl' });
  });

  it('rejects a non FeatureCollection', () => {
    expect(() => parsePlacementTable('[1,2]', 'geojson')).toThrow(/FeatureCollection/);
  });
});
