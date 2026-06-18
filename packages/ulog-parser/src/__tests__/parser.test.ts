import { describe, it, expect } from 'vitest';
import { createUlogParser, parseUlog } from '../parser.js';
import {
  header,
  format,
  addLogged,
  data,
  info,
  param,
  loggedString,
  concat,
  u64,
  f32,
  i32,
  ascii,
} from './build-ulog.js';

// A reusable single-subscription log: format + subscription + 3 data records
// + a param + an info string + a logged string.
function buildBasicLog(): Uint8Array {
  return concat([
    header(),
    format('sensor_test:uint64_t timestamp;float value;float[3] vec;'),
    addLogged(0, 0, 'sensor_test'),
    info('char[10] sys_name', ascii('PX4')),
    param('int32_t SYS_AUTOSTART', i32(4001)),
    data(0, concat([u64(1000), f32(1.5), f32(10), f32(20), f32(30)])),
    data(0, concat([u64(5000), f32(2.5), f32(11), f32(21), f32(31)])),
    data(0, concat([u64(9000), f32(3.5), f32(12), f32(22), f32(32)])),
    loggedString(6, 2000, 'armed'),
  ]);
}

describe('parseUlog basic', () => {
  const log = parseUlog(buildBasicLog());

  it('reports ulog format', () => {
    expect(log.format).toBe('ulog');
  });

  it('exposes sensor_test as a message type', () => {
    expect(log.messageTypes).toContain('sensor_test');
  });

  it('flattens scalar and array fields', () => {
    const msgs = log.messages.get('sensor_test')!;
    expect(msgs).toHaveLength(3);
    const first = msgs[0]!;
    expect(first.fields['value']).toBeCloseTo(1.5, 5);
    expect(first.fields['vec[0]']).toBeCloseTo(10, 5);
    expect(first.fields['vec[1]']).toBeCloseTo(20, 5);
    expect(first.fields['vec[2]']).toBeCloseTo(30, 5);
    expect(first.fields['vec']).toBeUndefined();
    expect(first.fields['timestamp']).toBe(1000);
  });

  it('does not emit the timestamp as a regular field but uses it for timeUs', () => {
    const msgs = log.messages.get('sensor_test')!;
    expect(msgs[0]!.timeUs).toBe(1000);
    expect(msgs[2]!.timeUs).toBe(9000);
  });

  it('computes timeRange across data records', () => {
    expect(log.timeRange.startUs).toBe(1000);
    expect(log.timeRange.endUs).toBe(9000);
  });

  it('synthesizes PARM records with Name and Value', () => {
    const parm = log.messages.get('PARM')!;
    expect(parm).toHaveLength(1);
    expect(parm[0]!.fields['Name']).toBe('SYS_AUTOSTART');
    expect(parm[0]!.fields['Value']).toBe(4001);
  });

  it('populates firmwareString from sys_name info', () => {
    expect(log.metadata.firmwareString).toContain('PX4');
  });

  it('captures logged strings under LOGGED_STRING', () => {
    const logged = log.messages.get('LOGGED_STRING')!;
    expect(logged).toHaveLength(1);
    expect(logged[0]!.fields['Level']).toBe(6);
    expect(logged[0]!.fields['Message']).toBe('armed');
    expect(logged[0]!.timeUs).toBe(2000);
  });

  it('builds an FMTMessage per subscription with flattened field names', () => {
    const fmt = log.formats.get(0)!;
    expect(fmt.name).toBe('sensor_test');
    expect(fmt.format).toBe('');
    expect(fmt.fields).toEqual(['timestamp', 'value', 'vec[0]', 'vec[1]', 'vec[2]']);
    expect(fmt.length).toBe(8 + 4 + 12);
  });

  it('emits empty unitLabels and multValues', () => {
    expect(log.unitLabels.size).toBe(0);
    expect(log.multValues.size).toBe(0);
  });
});

describe('multi_id instances', () => {
  it('suffixes instance >0 with _N', () => {
    const buf = concat([
      header(),
      format('sensor_gyro:uint64_t timestamp;float x;'),
      addLogged(0, 0, 'sensor_gyro'),
      addLogged(1, 1, 'sensor_gyro'),
      data(0, concat([u64(100), f32(1)])),
      data(1, concat([u64(200), f32(2)])),
    ]);
    const log = parseUlog(buf);
    expect(log.messageTypes).toContain('sensor_gyro');
    expect(log.messageTypes).toContain('sensor_gyro_1');
    expect(log.messages.get('sensor_gyro')![0]!.fields['x']).toBeCloseTo(1, 5);
    expect(log.messages.get('sensor_gyro_1')![0]!.fields['x']).toBeCloseTo(2, 5);
  });
});

describe('nested message types', () => {
  it('expands one level of nested struct fields with a dotted prefix', () => {
    // vehicle_status embeds a nested struct "timesync" before scalar fields.
    const buf = concat([
      header(),
      format('timesync:uint64_t ts;float offset;'),
      format('vehicle_status:uint64_t timestamp;timesync sync;float voltage;'),
      addLogged(0, 0, 'vehicle_status'),
      data(
        0,
        concat([u64(100), u64(7), f32(0.25), f32(12.6)]),
      ),
    ]);
    const log = parseUlog(buf);
    const msg = log.messages.get('vehicle_status')![0]!;
    expect(msg.fields['sync.ts']).toBe(7);
    expect(msg.fields['sync.offset']).toBeCloseTo(0.25, 5);
    expect(msg.fields['voltage']).toBeCloseTo(12.6, 5);
    expect(msg.timeUs).toBe(100);
    const fmt = log.formats.get(0)!;
    expect(fmt.fields).toEqual(['timestamp', 'sync.ts', 'sync.offset', 'voltage']);
    expect(fmt.length).toBe(8 + 12 + 4);
  });
});

describe('padding fields', () => {
  it('skips _padding fields but keeps following fields aligned', () => {
    const buf = concat([
      header(),
      format('with_pad:uint64_t timestamp;uint8_t flag;uint8_t[3] _padding0;float value;'),
      addLogged(0, 0, 'with_pad'),
      data(0, concat([u64(50), new Uint8Array([1, 0xff, 0xff, 0xff]), f32(9.9)])),
    ]);
    const log = parseUlog(buf);
    const msg = log.messages.get('with_pad')![0]!;
    expect(msg.fields['flag']).toBe(1);
    expect(msg.fields['_padding0']).toBeUndefined();
    expect(msg.fields['_padding0[0]']).toBeUndefined();
    expect(msg.fields['value']).toBeCloseTo(9.9, 5);
    expect(log.formats.get(0)!.fields).toEqual(['timestamp', 'flag', 'value']);
  });
});

describe('chunk boundaries', () => {
  it('produces identical results when fed split mid-message', () => {
    const buf = buildBasicLog();
    const whole = parseUlog(buf);

    // Split at an awkward offset partway through the data section.
    const splitAt = 40;
    const parser = createUlogParser();
    parser.feed(buf.subarray(0, splitAt));
    parser.feed(buf.subarray(splitAt));
    const streamed = parser.finalize();

    expect(streamed.messageTypes).toEqual(whole.messageTypes);
    expect(streamed.messages.get('sensor_test')!.map((m) => m.timeUs)).toEqual(
      whole.messages.get('sensor_test')!.map((m) => m.timeUs),
    );
    expect(streamed.timeRange).toEqual(whole.timeRange);
    expect(streamed.messages.get('PARM')!.length).toBe(
      whole.messages.get('PARM')!.length,
    );
  });

  it('waits for a full 16-byte header before parsing', () => {
    const buf = buildBasicLog();
    const parser = createUlogParser();
    const out = parser.feed(buf.subarray(0, 8));
    expect(out).toHaveLength(0);
    parser.feed(buf.subarray(8));
    const log = parser.finalize();
    expect(log.messageTypes).toContain('sensor_test');
  });
});

describe('header validation', () => {
  it('returns an empty log for bad magic', () => {
    const bad = new Uint8Array(32);
    bad.set(ascii('NOPE'), 0);
    const log = parseUlog(bad);
    expect(log.format).toBe('ulog');
    expect(log.messageTypes).toHaveLength(0);
    expect(log.messages.size).toBe(0);
    expect(log.timeRange).toEqual({ startUs: 0, endUs: 0 });
  });
});

describe('feed return value', () => {
  it('returns only data messages, not definitions or params', () => {
    const parser = createUlogParser();
    const returned = parser.feed(buildBasicLog());
    // 3 data records; F/A/I/P/L are not data messages.
    expect(returned).toHaveLength(3);
    expect(returned.every((m) => m.type === 'sensor_test')).toBe(true);
  });
});
