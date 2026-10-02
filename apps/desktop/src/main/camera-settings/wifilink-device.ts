import type { CameraSettingValue, CameraSettingsDevice, CameraSettingsSnapshot } from '../../shared/camera-settings-types.js';
import {
  WIFILINK_FIELDS,
  isAllowedValue,
  splitVideoMode,
  wifilinkField,
  type WifilinkField,
} from '../../shared/wifilink-settings.js';
import { t } from '../../shared/i18n/index.js';

const FILES = { majestic: '/etc/majestic.yaml', wfb: '/etc/wfb.yaml' } as const;
const SD_INI = '/mnt/mmcblk0p1/user.ini';
// wifilink copies the SD file here; keeping it in step stops a needless re-apply at the next start.
const SYNCED_INI = '/etc/user_cus.ini';

const yamlKey = (file: string, key: string) => `y:${file}:${key}`;
const iniKey = (section: string, key: string) => `i:${section}:${key}`;

export function buildReadScript(): string {
  const lines = [
    `g() { yaml-cli -i "$1" -g "$2" 2>/dev/null; }`,
    `ini() { [ -f "$1" ] && awk -F= -v s="[$2]" -v k="$3" '{ gsub(/\\r/, "") } /^\\[/ { cur = $0 } { key = $1; gsub(/[ \\t]/, "", key) } cur == s && key == k { sub(/^[^=]*=/, ""); print; exit }' "$1"; }`,
    `echo "fw=$(head -n1 /etc/user.ini 2>/dev/null)"`,
    `echo "wifilink=$([ -x /usr/sbin/wifilink ] && echo 1 || echo 0)"`,
    `echo "wfbyaml=$([ -f ${FILES.wfb} ] && echo 1 || echo 0)"`,
    `echo "sd=$([ -f ${SD_INI} ] && echo 1 || echo 0)"`,
    `INI=${SD_INI}; [ -f "$INI" ] || INI=${SYNCED_INI}; [ -f "$INI" ] || INI=/etc/user.ini`,
  ];
  for (const field of WIFILINK_FIELDS) {
    for (const b of field.bindings) {
      if (b.yaml) lines.push(`echo "${yamlKey(b.yaml.file, b.yaml.key)}=$(g ${FILES[b.yaml.file]} ${b.yaml.key})"`);
      else lines.push(`echo "${iniKey(b.ini.section, b.ini.key)}=$(ini "$INI" ${b.ini.section} ${b.ini.key})"`);
    }
  }
  return lines.join('\n') + '\n';
}

function parsePairs(output: string): Map<string, string> {
  const pairs = new Map<string, string>();
  for (const raw of output.split(/\r?\n/)) {
    const eq = raw.indexOf('=');
    if (eq > 0) pairs.set(raw.slice(0, eq), raw.slice(eq + 1).trim().replace(/^["']|["']$/g, ''));
  }
  return pairs;
}

function typed(field: WifilinkField, raw: string): CameraSettingValue | null {
  if (raw === '') return null;
  const sample = field.values[0];
  if (typeof sample === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof sample === 'boolean') {
    if (/^(true|1)$/i.test(raw)) return true;
    if (/^(false|0)$/i.test(raw)) return false;
    return null;
  }
  return raw;
}

export interface ParsedRead {
  isWifilink: boolean;
  snapshot: CameraSettingsSnapshot;
}

export function parseReadOutput(output: string, host: string): ParsedRead {
  const p = parsePairs(output);
  const sdCard = p.get('sd') === '1';
  const firmware = /V\d+(\.\d+)*/i.exec(p.get('fw') ?? '')?.[0] ?? null;
  const device: CameraSettingsDevice = {
    host,
    model: 'RunCam WiFiLink',
    firmware,
    sdCard,
    readOnly: p.get('wfbyaml') !== '1',
  };

  const values: Record<string, CameraSettingValue> = {};
  const unavailable: Record<string, string> = {};
  for (const field of WIFILINK_FIELDS) {
    const raw = field.bindings.map((b) =>
      p.get(b.yaml ? yamlKey(b.yaml.file, b.yaml.key) : iniKey(b.ini.section, b.ini.key)) ?? '',
    );
    let value: CameraSettingValue | null;
    if (field.id === 'video.mode') {
      const [size, fps] = raw;
      value = size && fps ? `${size}@${Number(fps)}` : null;
    } else {
      value = typed(field, raw[0] ?? '');
    }
    if (value === null) unavailable[field.id] = t('main:cameraSettings.notReported');
    else values[field.id] = value;
  }

  if (!sdCard) {
    unavailable['radio.txpower'] = t('main:cameraSettings.txPowerNeedsSd');
    unavailable['records.enabled'] = t('main:cameraSettings.recordingNeedsSd');
  }
  return { isWifilink: p.get('wifilink') === '1', snapshot: { device, values, unavailable } };
}

export type ChangeSet = Record<string, CameraSettingValue>;

export function validateChanges(changes: ChangeSet, snapshot: CameraSettingsSnapshot): string | null {
  if (snapshot.device.readOnly) return t('main:cameraSettings.firmwareTooOld');
  for (const [id, value] of Object.entries(changes)) {
    const field = wifilinkField(id);
    if (!field) return t('main:cameraSettings.unknownSetting', { id });
    if (snapshot.unavailable[id]) return snapshot.unavailable[id]!;
    if (!isAllowedValue(field, value)) return t('main:cameraSettings.valueNotAccepted', { value: String(value), id });
  }
  return null;
}

const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

function iniSed(section: string, key: string, value: string, file: string): string {
  return `if [ -f ${file} ]; then sed -i '/^\\[${section}\\]/,/^\\[/ s/^${key}[[:space:]]*=.*/${key}=${value}/' ${file}; fi`;
}

/** Call validateChanges first: values are interpolated into the script. */
export function buildWriteScript(changes: ChangeSet, login: { username: string; password: string }): string {
  const out = ['set -e'];
  let majesticOther = false;
  let liveBitrate: number | null = null;
  let linkRestart = false;

  for (const [id, value] of Object.entries(changes)) {
    const field = wifilinkField(id)!;
    const parts: string[] =
      id === 'video.mode'
        ? (() => { const m = splitVideoMode(String(value))!; return [m.size, String(m.fps)]; })()
        : [String(value)];

    field.bindings.forEach((b, i) => {
      const v = parts[i] ?? parts[0]!;
      if (b.yaml) out.push(`yaml-cli -i ${FILES[b.yaml.file]} -s ${b.yaml.key} ${v}`);
      out.push(iniSed(b.ini.section, b.ini.key, v, SD_INI));
      // Power must differ from the synced copy so wifilink notices and applies it.
      if (field.id !== 'radio.txpower') out.push(iniSed(b.ini.section, b.ini.key, v, SYNCED_INI));
    });

    if (field.effect === 'live' && id === 'video.bitrate') liveBitrate = Number(value);
    else if (field.effect === 'video-reload') majesticOther = true;
    else if (field.effect === 'link-restart') linkRestart = true;
  }

  if (majesticOther) out.push('killall -1 majestic || true');
  else if (liveBitrate !== null) {
    const auth = shq(`${login.username}:${login.password}`);
    out.push(`curl -s -u ${auth} 'http://127.0.0.1/api/v1/set?video0.bitrate=${liveBitrate}' >/dev/null 2>&1 || killall -1 majestic || true`);
  }
  // Detached: the link restart outlives this SSH command.
  if (linkRestart) out.push(`nohup sh -c 'wifibroadcast stop; sleep 2; wifibroadcast start' >/dev/null 2>&1 &`);
  return out.join('\n') + '\n';
}

export function mismatchedFields(changes: ChangeSet, after: CameraSettingsSnapshot): string[] {
  return Object.entries(changes)
    .filter(([id, value]) => after.values[id] !== value)
    .map(([id]) => id);
}
