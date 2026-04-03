import { describe, it, expect } from 'vitest';
import { decodeField, fieldSize } from '../field-types.js';

describe('fieldSize', () => {
  it('returns correct sizes for all type chars', () => {
    expect(fieldSize('b')).toBe(1);
    expect(fieldSize('B')).toBe(1);
    expect(fieldSize('h')).toBe(2);
    expect(fieldSize('H')).toBe(2);
    expect(fieldSize('i')).toBe(4);
    expect(fieldSize('I')).toBe(4);
    expect(fieldSize('f')).toBe(4);
    expect(fieldSize('d')).toBe(8);
    expect(fieldSize('q')).toBe(8);
    expect(fieldSize('Q')).toBe(8);
    expect(fieldSize('n')).toBe(4);
    expect(fieldSize('N')).toBe(16);
    expect(fieldSize('Z')).toBe(64);
    expect(fieldSize('c')).toBe(2);
    expect(fieldSize('C')).toBe(2);
    expect(fieldSize('e')).toBe(4);
    expect(fieldSize('E')).toBe(4);
    expect(fieldSize('L')).toBe(4);
    expect(fieldSize('M')).toBe(1);
    expect(fieldSize('a')).toBe(64);
  });
});

describe('decodeField', () => {
  it('decodes int8 (b)', () => {
    const buf = new Uint8Array([0xFE]);
    expect(decodeField('b', new DataView(buf.buffer), 0)).toBe(-2);
  });

  it('decodes uint8 (B)', () => {
    const buf = new Uint8Array([0xFE]);
    expect(decodeField('B', new DataView(buf.buffer), 0)).toBe(254);
  });

  it('decodes float (f)', () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, 3.14, true);
    const result = decodeField('f', new DataView(buf), 0) as number;
    expect(result).toBeCloseTo(3.14, 2);
  });

  it('decodes centi int16 (c)', () => {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, 1234, true);
    expect(decodeField('c', new DataView(buf), 0)).toBeCloseTo(12.34, 2);
  });

  it('decodes lat/lon int32 (L)', () => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, -1234567890, true);
    const result = decodeField('L', new DataView(buf), 0) as number;
    expect(result).toBeCloseTo(-123.456789, 5);
  });

  it('decodes char[4] (n)', () => {
    const buf = new Uint8Array([0x47, 0x50, 0x53, 0x00]); // "GPS\0"
    expect(decodeField('n', new DataView(buf.buffer), 0)).toBe('GPS');
  });

  it('decodes char[16] (N)', () => {
    const buf = new Uint8Array(16);
    const text = 'ArduCopter';
    for (let i = 0; i < text.length; i++) buf[i] = text.charCodeAt(i);
    expect(decodeField('N', new DataView(buf.buffer), 0)).toBe('ArduCopter');
  });

  it('decodes uint64 (Q)', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, 1000000, true);
    view.setUint32(4, 0, true);
    expect(decodeField('Q', view, 0)).toBe(1000000);
  });

  it('decodes int64 (q)', () => {
    const buf = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint32(0, 0xFFFFFFFF, true);
    view.setUint32(4, 0xFFFFFFFF, true);
    expect(decodeField('q', view, 0)).toBe(-1);
  });
});
