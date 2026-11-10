import { describe, expect, it } from 'vitest';
import { flashRoute, fullEraseMode } from './flash-route';

const apBoard = { flasher: 'ardupilot' as const, detectionMethod: 'mavlink' as const, port: '/dev/tty.usbmodem1', usbVid: 0x1209 };

describe('flashRoute', () => {
  it('ArduPilot boards on a port use the ArduPilot bootloader', () => {
    expect(flashRoute(apBoard, '/c/arducopter.apj')).toBe('ardupilot');
  });
  it('an .apj on an MSP board is not routed to the ArduPilot bootloader', () => {
    expect(flashRoute({ flasher: 'dfu', detectionMethod: 'msp', port: '/dev/x', usbVid: 0x0483 }, '/c/arducopter.apj')).toBe('dfu');
  });
  it('USB-serial bridges and boards already in the ROM bootloader use serial', () => {
    expect(flashRoute({ flasher: 'serial', detectionMethod: 'msp', port: '/dev/x', usbVid: 0x10c4 }, '/c/fw.hex')).toBe('serial');
    expect(flashRoute({ flasher: 'serial', detectionMethod: 'bootloader', port: '/dev/x', usbVid: 0x9999 }, '/c/fw.hex')).toBe('serial');
  });
  it('portless ArduPilot boards fall back to DFU', () => {
    expect(flashRoute({ ...apBoard, port: undefined }, '/c/arducopter.apj')).toBe('dfu');
  });
});

describe('fullEraseMode', () => {
  it('is unavailable over the ArduPilot bootloader and always on for ROM serial', () => {
    expect(fullEraseMode('ardupilot', '/c/arducopter.apj')).toBe('unavailable');
    expect(fullEraseMode('serial', '/c/fw.hex')).toBe('always');
  });
  it('allows DFU only with an image that brings its own bootloader', () => {
    expect(fullEraseMode('dfu', '/c/arducopter_with_bl.hex')).toBe('optional');
    expect(fullEraseMode('dfu', '/c/arducopter.apj')).toBe('needs-bl-image');
    expect(fullEraseMode('dfu', '/c/arducopter.hex')).toBe('needs-bl-image');
  });
});
