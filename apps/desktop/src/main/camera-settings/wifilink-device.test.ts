import { describe, it, expect } from 'vitest';
import { buildReadScript, buildWriteScript, mismatchedFields, parseReadOutput, validateChanges } from './wifilink-device';

// What the read script prints on a stock V3.1 unit with an SD card.
const V31_OUTPUT = [
  'fw=#WiFiLink_V3.1',
  'wifilink=1',
  'wfbyaml=1',
  'sd=1',
  'y:majestic:.video0.size=1280x720',
  'y:majestic:.video0.fps=120',
  'y:majestic:.video0.codec=h265',
  'y:majestic:.video0.bitrate=4096',
  'y:majestic:.image.luminance=50',
  'y:majestic:.image.contrast=50',
  'y:majestic:.image.saturation=50',
  'y:majestic:.image.hue=50',
  'y:majestic:.image.mirror=false',
  'y:majestic:.image.flip=false',
  'y:majestic:.image.rotate=0',
  'y:majestic:.records.enabled=false',
  'y:wfb:.wireless.channel=161',
  'i:wireless:txpower=20',
  'y:wfb:.broadcast.mcs_index=1',
  'y:wfb:.broadcast.stbc=0',
  'y:wfb:.broadcast.ldpc=0',
  'y:wfb:.telemetry.router=msposd',
].join('\n');

const login = { username: 'root', password: '12345' };

describe('WiFiLink read', () => {
  it('reads every setting from the right file', () => {
    const script = buildReadScript();
    expect(script).toContain('g /etc/majestic.yaml .video0.bitrate');
    expect(script).toContain('g /etc/wfb.yaml .wireless.channel');
    expect(script).toContain('ini "$INI" wireless txpower');
    expect(script).not.toContain('.wireless.txpower');
  });

  it('parses a V3.1 unit into typed values', () => {
    const { isWifilink, snapshot } = parseReadOutput(V31_OUTPUT, '192.168.1.10');
    expect(isWifilink).toBe(true);
    expect(snapshot.device).toEqual({ host: '192.168.1.10', model: 'RunCam WiFiLink', firmware: 'V3.1', sdCard: true, readOnly: false });
    expect(snapshot.values['video.mode']).toBe('1280x720@120');
    expect(snapshot.values['video.bitrate']).toBe(4096);
    expect(snapshot.values['image.mirror']).toBe(false);
    expect(snapshot.values['radio.txpower']).toBe(20);
    expect(snapshot.values['telemetry.protocol']).toBe('msposd');
    expect(snapshot.unavailable).toEqual({});
  });

  it('locks power and recording without an SD card', () => {
    const { snapshot } = parseReadOutput(V31_OUTPUT.replace('sd=1', 'sd=0'), 'h');
    expect(Object.keys(snapshot.unavailable).sort()).toEqual(['radio.txpower', 'records.enabled']);
  });

  it('marks firmware without wfb.yaml read-only and refuses writes', () => {
    const { snapshot } = parseReadOutput(V31_OUTPUT.replace('wfbyaml=1', 'wfbyaml=0'), 'h');
    expect(snapshot.device.readOnly).toBe(true);
    expect(validateChanges({ 'video.bitrate': 8192 }, snapshot)).toMatch(/V3\.1/);
  });

  it('recognises a non-RunCam OpenIPC device', () => {
    expect(parseReadOutput(V31_OUTPUT.replace('wifilink=1', 'wifilink=0'), 'h').isWifilink).toBe(false);
  });
});

describe('WiFiLink write', () => {
  const { snapshot } = parseReadOutput(V31_OUTPUT, 'h');

  it('only accepts values RunCam documents', () => {
    expect(validateChanges({ 'video.bitrate': 8192 }, snapshot)).toBeNull();
    expect(validateChanges({ 'video.bitrate': 8000 }, snapshot)).toMatch(/not a value/);
    expect(validateChanges({ 'video.mode': '1920x1080@120' }, snapshot)).toMatch(/not a value/);
    expect(validateChanges({ 'radio.channel': 165 }, snapshot)).toBeNull();
    expect(validateChanges({ 'radio.channel': 169 }, snapshot)).toMatch(/not a value/);
    expect(validateChanges({ 'video.codec': "h265'; reboot" }, snapshot)).toMatch(/not a value/);
  });

  it('applies bitrate live and persists it in yaml and both ini files', () => {
    const s = buildWriteScript({ 'video.bitrate': 8192 }, login);
    expect(s).toContain('yaml-cli -i /etc/majestic.yaml -s .video0.bitrate 8192');
    expect(s).toContain("s/^bitrate[[:space:]]*=.*/bitrate=8192/' /mnt/mmcblk0p1/user.ini");
    expect(s).toContain("s/^bitrate[[:space:]]*=.*/bitrate=8192/' /etc/user_cus.ini");
    expect(s).toContain("api/v1/set?video0.bitrate=8192");
    expect(s).not.toMatch(/^killall -1 majestic \|\| true$/m);
    expect(s).not.toContain('wifibroadcast');
  });

  it('splits the video mode into size and fps', () => {
    const s = buildWriteScript({ 'video.mode': '1920x1080@90' }, login);
    expect(s).toContain('-s .video0.size 1920x1080');
    expect(s).toContain('-s .video0.fps 90');
    expect(s).toContain('s/^Size[[:space:]]*=.*/Size=1920x1080/');
    expect(s).toContain('killall -1 majestic || true');
  });

  it('leaves power to RunCam: SD file only, never wfb.yaml or the synced copy', () => {
    const s = buildWriteScript({ 'radio.txpower': 35 }, login);
    expect(s).toContain("s/^txpower[[:space:]]*=.*/txpower=35/' /mnt/mmcblk0p1/user.ini");
    expect(s).not.toContain('/etc/user_cus.ini');
    expect(s).not.toContain('yaml-cli');
    expect(s).toContain("nohup sh -c 'wifibroadcast stop; sleep 2; wifibroadcast start'");
  });

  it('quotes a password with a quote in it', () => {
    const s = buildWriteScript({ 'video.bitrate': 8192 }, { username: 'root', password: "it's" });
    expect(s).toContain(`-u 'root:it'\\''s'`);
  });

  it('reports values that read back differently', () => {
    expect(mismatchedFields({ 'video.bitrate': 8192, 'image.hue': 50 }, snapshot)).toEqual(['video.bitrate']);
  });
});
