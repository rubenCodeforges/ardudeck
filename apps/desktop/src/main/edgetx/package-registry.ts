/**
 * Curated catalog of installable EdgeTX SD-card packages.
 *
 * Each package downloads from its official GitHub repo at install time (no
 * redistribution inside ArduDeck) and maps one or more source paths from the
 * extracted archive onto the SD card root, chosen by radio screen variant.
 */

import type { RadioVariant, EdgeTxPackageInfo } from '../../shared/edgetx-types.js';
import { t } from '../../shared/i18n/index.js';

export type { RadioVariant };

export interface PackageSourceMapping {
  /**
   * Path inside the extracted archive (relative to the repo root folder)
   * whose CONTENTS are merged onto the SD card root.
   */
  archivePath: string;
}

/** Where a package's files come from. */
export type PackageSource =
  | { kind: 'github'; repo: string }
  /**
   * Shipped inside the app under resources/edgetx/<dir>. `version` is bumped
   * manually when the bundled payload changes so Update state works.
   */
  | { kind: 'bundled'; dir: string; version: string };

export interface EdgeTxPackage {
  id: string;
  name: string;
  description: string;
  homepage: string;
  license: string;
  source: PackageSource;
  /**
   * Mappings per variant id. The special key "common" applies to every
   * variant and is installed in addition to the variant mapping.
   */
  mappings: Record<string, PackageSourceMapping[]>;
  /** Variants this package supports */
  variants: RadioVariant[];
}

/**
 * Screen variants for EdgeTX color/BW radios, following the Yaapu repo's
 * folder taxonomy since it is the most complete radio-to-resolution map.
 */
export const RADIO_VARIANTS: RadioVariant[] = [
  { id: 'c480x320', label: '480x320 color', radios: 'TX15' }, // i18n-exempt
  { id: 'c480x272', label: '480x272 color', radios: 'TX16S / TX16S mkII, T16, T18, Horus X10S/X12S' }, // i18n-exempt
  { id: 'c800x480', label: '800x480 color', radios: 'TX16S mkIII' }, // i18n-exempt
  { id: 'c320x480', label: '320x480 portrait color', radios: 'Flysky NV14 / EL18' }, // i18n-exempt
  { id: 'bw128x64', label: '128x64 B&W', radios: 'Zorro, TX12, MT12, Boxer, Pocket, T-Lite/T-Pro, QX7, X9 Lite' }, // i18n-exempt
  { id: 'bw212x64', label: '212x64 B&W', radios: 'Taranis X9D/X9D+/X9E' }, // i18n-exempt
];

/**
 * Telemetry script name the monochrome payload installs (6 characters is
 * the EdgeTX limit) - install points every model's telemetry screen at it.
 */
export const ARDUDECK_BW_SCRIPT = 'ArduDk';

export const EDGETX_PACKAGES: EdgeTxPackage[] = [
  {
    id: 'yaapu-telemetry',
    name: 'Yaapu Telemetry', // i18n-exempt
    description:
      'Full ArduPilot telemetry widget: HUD, flight modes, GPS, battery, STATUSTEXT messages with voice alerts. Works over ELRS 4.x MAVLink and CRSF passthrough.', // i18n-exempt
    homepage: 'https://github.com/yaapu/FrskyTelemetryScript',
    license: 'GPL-3.0',
    source: { kind: 'github', repo: 'yaapu/FrskyTelemetryScript' },
    mappings: {
      common: [{ archivePath: 'OTX_ETX/color_common/SD' }],
      c480x320: [{ archivePath: 'OTX_ETX/c480x320/SD' }],
      c480x272: [{ archivePath: 'OTX_ETX/c480x272/SD' }],
      c800x480: [{ archivePath: 'OTX_ETX/c800x480/SD' }],
      c320x480: [{ archivePath: 'OTX_ETX/c320x480/SD' }],
      bw128x64: [
        { archivePath: 'OTX_ETX/bw_common/SD' },
        { archivePath: 'OTX_ETX/bw128x64/SD' },
      ],
    },
    variants: RADIO_VARIANTS,
  },
  {
    id: 'ardudeck-hud',
    name: 'ArduDeck HUD',
    description:
      'Glanceable ArduDeck-styled flight screen: big honest numbers, armed/mode bar, live STATUSTEXT ticker, and a diagnostic ladder that tells you exactly why telemetry is missing instead of "no telemetry". Config is generated from your connected vehicle. All color radios; layouts rescale to the screen. B&W radios get a dense telemetry script, installed and wired to a telemetry screen for you.', // i18n-exempt
    homepage: 'https://ardudeck.com',
    license: 'GPL-3.0',
    source: { kind: 'bundled', dir: 'ardudeck-hud', version: '0.5.1' },
    // One payload for every color class: the widget rescales layouts to
    // LCD_W/LCD_H at load (hud.cfg carries the authored screen=WxH).
    // B&W radios have no widget API: they get a telemetry SCRIPT (SDBW)
    // plus the color payload for the shared voice pack + hud.cfg path.
    mappings: {
      c480x320: [{ archivePath: 'SD' }],
      c480x272: [{ archivePath: 'SD' }],
      c800x480: [{ archivePath: 'SD' }],
      c320x480: [{ archivePath: 'SD' }],
      bw128x64: [{ archivePath: 'SD' }, { archivePath: 'SDBW' }],
      bw212x64: [{ archivePath: 'SD' }, { archivePath: 'SDBW' }],
    },
    variants: RADIO_VARIANTS,
  },
];

export function getPackage(id: string): EdgeTxPackage | undefined {
  return EDGETX_PACKAGES.find((p) => p.id === id);
}

/** Renderer-safe catalog view without mapping internals. */
export function catalogInfo(): EdgeTxPackageInfo[] {
  return EDGETX_PACKAGES.map(({ id, name, description, homepage, license, variants }) => ({
    id, name, homepage, license,
    description: t(`main:edgetxPackages.descriptions.${id}`, { defaultValue: description }),
    variants: variants.map((v) => ({ ...v, label: t(`main:edgetxPackages.variants.${v.id}`, { defaultValue: v.label }) })),
  }));
}

/**
 * BW variants must not install the color_common mapping; resolve the actual
 * archive paths to install for a package+variant pair.
 */
export function resolveMappings(pkg: EdgeTxPackage, variantId: string): PackageSourceMapping[] {
  const variant = pkg.mappings[variantId];
  if (!variant) return [];
  const isBw = variantId.startsWith('bw');
  const common = isBw ? [] : (pkg.mappings['common'] ?? []);
  return [...common, ...variant];
}
