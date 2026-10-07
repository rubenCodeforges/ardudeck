/**
 * ArduDeck script bundle - inlines the Lua source at build time and computes
 * the manifest the installer + UI both reference. The SHA256 over the actual
 * source bytes is what we show in the preview, so users can verify the code
 * they see is exactly what we'll write to the FC.
 */

// Vite ?raw import: bundles the file contents as a string at build time.
// Works in main + preload bundles since electron-vite uses Vite under the hood.
import luaSource from '../lua-scripts/ardudeck_commands.lua?raw';
import { buildScriptBundle, type ScriptBundle } from './installer-service';
import { USER_CMD, SUB_CMD, type ScriptManifest } from '../../shared/script-installer-types';
import { i18n, t } from '../../shared/i18n/index.js';

const FILENAME = 'ardudeck_commands.lua';
const VERSION = '1.2.0';

let cached: ScriptBundle | null = null;
let cachedLanguage: string | null = null;

/** Build the script bundle from the inlined source. Cached after first call. */
export function getScriptBundle(): ScriptBundle {
  if (cached && cachedLanguage === i18n.language) return cached;

  // Manifest mirrors what's documented in the .lua header. Keep these in sync
  // when bumping the script version.
  const partialManifest: Omit<ScriptManifest, 'sha256' | 'sizeBytes'> = {
    filename: FILENAME,
    version: VERSION,
    requirements: [
      {
        param: 'SCR_ENABLE',
        why: t('main:scriptBundle.scrEnableWhy'),
        exact: 1,
        rebootIfChanged: true,
      },
      {
        param: 'SCR_HEAP_SIZE',
        why: t('main:scriptBundle.heapWhy'),
        min: 65536,
        rebootIfChanged: true,
      },
    ],
    commands: [
      {
        name: 'ORBIT',
        label: t('main:scriptBundle.orbitLabel'),
        description: t('main:scriptBundle.orbitDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.ORBIT,
        paramSchema:
          'param1=radius (m, signed; +CW, -CCW)  param2=speed (m/s, 0=default)  param3=revolutions (0=infinite)  param4=sub_id (0)  x=lat*1e7  y=lon*1e7  z=altitude (m, relative)',
      },
      {
        name: 'SPIRAL',
        label: t('main:scriptBundle.spiralLabel'),
        description: t('main:scriptBundle.spiralDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.SPIRAL,
        paramSchema:
          'param1=radius (m, signed; +CW, -CCW)  param2=speed (m/s, 0=default)  param3=climb_rate (m/s)  param4=sub_id (1)  x=lat*1e7  y=lon*1e7  z=target_altitude (m, relative)',
      },
      {
        name: 'WATCHTOWER',
        label: t('main:scriptBundle.watchtowerLabel'),
        description: t('main:scriptBundle.watchtowerDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.WATCHTOWER,
        paramSchema:
          'param1=yaw_rate (deg/s, signed; +CW, -CCW; default 30)  param4=sub_id (3)  x=lat*1e7  y=lon*1e7  z=altitude (m, relative)',
      },
      {
        name: 'CLIMB_RTL',
        label: t('main:scriptBundle.climbRtlLabel'),
        description: t('main:scriptBundle.climbRtlDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.CLIMB_RTL,
        paramSchema:
          'z=safe_altitude (m, relative; vehicle uses its own current lat/lon as climb anchor)  param4=sub_id (4)',
      },
      {
        name: 'REVEAL',
        label: t('main:scriptBundle.revealLabel'),
        description: t('main:scriptBundle.revealDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.REVEAL,
        paramSchema:
          'param1=pullback_distance (m)  param2=climb_amount (m, signed)  param3=speed (m/s, 0=3 default)  param4=sub_id (5)  x=lat*1e7  y=lon*1e7  z=target_alt (m, informational)',
      },
      {
        name: 'STRAFE',
        label: t('main:scriptBundle.strafeLabel'),
        description: t('main:scriptBundle.strafeDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.STRAFE,
        paramSchema:
          'param1=offset_distance (m, perpendicular clearance)  param2=strafe_length (m, total)  param3=speed (m/s, 0=3 default)  param4=sub_id (6)  x=lat*1e7  y=lon*1e7  z=altitude (m, relative)',
      },
      {
        name: 'LAND_AT',
        label: t('main:scriptBundle.landAtLabel'),
        description: t('main:scriptBundle.landAtDescription'),
        trigger: USER_CMD.AD,
        subId: SUB_CMD.LAND_AT,
        paramSchema:
          'x=lat*1e7  y=lon*1e7  z=approach_altitude (m, relative; 0 = current alt)  param4=sub_id (7)',
      },
    ],
    heartbeat: { name: 'AD_HB', intervalSec: 1 },
  };

  cached = buildScriptBundle(luaSource, partialManifest);
  cachedLanguage = i18n.language;
  return cached;
}
