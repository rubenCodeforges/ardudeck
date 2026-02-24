/**
 * Firmware Manifest Fetcher
 * Fetches real board lists and versions from firmware servers
 */

import * as https from 'https';
import * as path from 'path';
import { app } from 'electron';
import {
  FIRMWARE_SERVERS,
  VEHICLE_TO_FIRMWARE,
  type FirmwareSource,
  type FirmwareVehicleType,
  type FirmwareVersion,
  type FirmwareManifest,
} from '../../shared/firmware-types.js';

/**
 * Estimate binary firmware size from Intel HEX file size
 * HEX format is ~2.3x larger than binary due to ASCII encoding + overhead
 * Each 16 bytes of data becomes ~45 chars in HEX format
 */
function hexToBinarySize(hexSize: number): number {
  return Math.round(hexSize / 2.3);
}

/**
 * Which vehicle types each firmware source supports
 */
const SUPPORTED_VEHICLES: Record<FirmwareSource, FirmwareVehicleType[]> = {
  ardupilot: ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'],
  px4: ['copter', 'plane', 'vtol', 'rover'],
  betaflight: ['copter'],
  inav: ['copter', 'plane'],
  custom: ['copter', 'plane', 'vtol', 'rover', 'boat', 'sub'],
};

/**
 * Check if a firmware source supports a vehicle type
 */
export function isVehicleSupported(source: FirmwareSource, vehicleType: FirmwareVehicleType): boolean {
  return SUPPORTED_VEHICLES[source]?.includes(vehicleType) ?? false;
}

/**
 * Parsed board info from manifest
 */
export interface BoardInfo {
  id: string;           // Platform name for URL (e.g., "CubeOrange")
  name: string;         // Display name
  category: string;     // Board category (Pixhawk, Cube, SpeedyBee, Matek, etc.)
  isPopular?: boolean;  // Show in popular section
}

/**
 * Version group (e.g., "4.5.x")
 */
export interface VersionGroup {
  major: string;        // e.g., "4.5"
  label: string;        // e.g., "4.5.x (Latest Stable)"
  versions: FirmwareVersion[];
  isLatest: boolean;
}

// Cache for manifest data
let manifestCache: {
  data: any;
  fetchedAt: number;
  boards: Map<string, BoardInfo[]>;  // vehicleType -> boards
} | null = null;

// Cache for GitHub release asset sizes
const githubAssetSizeCache: Map<string, number> = new Map();

const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Fetch file size from GitHub releases API
 * @param owner GitHub repo owner (e.g., "iNavFlight")
 * @param repo GitHub repo name (e.g., "inav")
 * @param tag Release tag (e.g., "7.1.2" or "2.6.1")
 * @param assetPattern Pattern to match asset name (e.g., "SPEEDYBEEF3")
 */
async function fetchGitHubAssetSize(owner: string, repo: string, tag: string, assetPattern: string): Promise<number | undefined> {
  const cacheKey = `${owner}/${repo}/${tag}/${assetPattern}`;
  if (githubAssetSizeCache.has(cacheKey)) {
    return githubAssetSizeCache.get(cacheKey);
  }

  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`;

    https.get(url, { headers: { 'User-Agent': 'ArduDeck-GCS' } }, (res) => {
      if (res.statusCode !== 200) {
        resolve(undefined);
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const pattern = assetPattern.toLowerCase();
          const asset = release.assets?.find((a: any) =>
            a.name.toLowerCase().includes(pattern) &&
            (a.name.endsWith('.hex') || a.name.endsWith('.bin'))
          );
          if (asset?.size) {
            githubAssetSizeCache.set(cacheKey, asset.size);
            resolve(asset.size);
          } else {
            resolve(undefined);
          }
        } catch {
          resolve(undefined);
        }
      });
    }).on('error', () => resolve(undefined));
  });
}

/**
 * Fetch the ArduPilot manifest.json
 */
async function fetchArduPilotManifest(): Promise<any> {
  // Return cached if fresh
  if (manifestCache && Date.now() - manifestCache.fetchedAt < CACHE_DURATION) {
    return manifestCache.data;
  }

  return new Promise((resolve, reject) => {
    const url = FIRMWARE_SERVERS.ardupilot.manifest;

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const manifest = JSON.parse(data);
          manifestCache = {
            data: manifest,
            fetchedAt: Date.now(),
            boards: new Map(),
          };
          resolve(manifest);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Get boards for a vehicle type
 * Uses static list for instant loading - no network required
 * The manifest is only fetched when selecting versions for a specific board
 */
export async function getArduPilotBoards(_vehicleType: FirmwareVehicleType): Promise<BoardInfo[]> {
  // Return static board list instantly - same boards work for all vehicle types
  // The actual firmware availability is checked when fetching versions
  return getStaticBoards();
}

/**
 * Categorize board by platform name
 */
function categorizeboard(platform: string): string {
  const p = platform.toLowerCase();

  if (p.includes('cube')) return 'Cube';
  if (p.includes('pixhawk') || p.includes('fmuv') || p.includes('px4')) return 'Pixhawk';
  if (p.includes('kakute') || p.includes('durandal')) return 'Holybro';
  if (p.includes('speedybee')) return 'SpeedyBee';
  if (p.includes('matek')) return 'Matek';
  if (p.includes('omnibus')) return 'Omnibus';
  if (p.includes('mamba')) return 'Mamba';
  if (p.includes('flywoo')) return 'Flywoo';
  if (p.includes('iflight')) return 'iFlight';
  if (p.includes('radiolink')) return 'Radiolink';
  if (p.includes('skyviper')) return 'SkyViper';
  if (p.includes('sitl')) return 'Simulator';

  return 'Other';
}

/**
 * Format board name for display
 */
function formatBoardName(platform: string): string {
  // Handle common patterns
  let name = platform
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // CamelCase to spaces
    .replace(/-/g, ' ')
    .replace(/_/g, ' ');

  // Capitalize first letter of each word
  name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return name;
}

/**
 * Static board list - comprehensive list of all known ArduPilot boards
 * This avoids the need to fetch the 10MB manifest just for board names
 * Versions are fetched on-demand when a board is selected
 */
const STATIC_BOARDS: BoardInfo[] = [
  // Legacy AVR boards
  { id: 'apm1', name: 'APM 1.x', category: 'Legacy (AVR)' },
  { id: 'apm2', name: 'APM 2.x / 2.5 / 2.6', category: 'Legacy (AVR)' },

  // Cube series (CubeOrange is popular)
  { id: 'CubeOrange', name: 'Cube Orange', category: 'Cube', isPopular: true },
  { id: 'CubeOrangePlus', name: 'Cube Orange+', category: 'Cube', isPopular: true },
  { id: 'CubeBlack', name: 'Cube Black', category: 'Cube' },
  { id: 'CubeOrange-bdshot', name: 'Cube Orange (BDShot)', category: 'Cube' },
  { id: 'CubePurple', name: 'Cube Purple', category: 'Cube' },
  { id: 'CubeYellow', name: 'Cube Yellow', category: 'Cube' },
  { id: 'CubeGreen-solo', name: 'Cube Green (Solo)', category: 'Cube' },
  { id: 'CubeRedPrimary', name: 'Cube Red Primary', category: 'Cube' },
  { id: 'CubeRedSecondary', name: 'Cube Red Secondary', category: 'Cube' },

  // Pixhawk series (Pixhawk 4 and 6X are popular)
  { id: 'Pixhawk6X', name: 'Pixhawk 6X', category: 'Pixhawk', isPopular: true },
  { id: 'Pixhawk6C', name: 'Pixhawk 6C', category: 'Pixhawk', isPopular: true },
  { id: 'Pixhawk4', name: 'Pixhawk 4', category: 'Pixhawk', isPopular: true },
  { id: 'Pixhawk1', name: 'Pixhawk 1', category: 'Pixhawk' },
  { id: 'Pixhawk1-1M', name: 'Pixhawk 1 (1MB)', category: 'Pixhawk' },
  { id: 'Pixhawk4-bdshot', name: 'Pixhawk 4 (BDShot)', category: 'Pixhawk' },
  { id: 'Pixhawk5X', name: 'Pixhawk 5X', category: 'Pixhawk' },
  { id: 'Pixhawk6X-bdshot', name: 'Pixhawk 6X (BDShot)', category: 'Pixhawk' },
  { id: 'PH4-mini', name: 'Pixhawk 4 Mini', category: 'Pixhawk' },
  { id: 'Pix32v5', name: 'Pix32 v5', category: 'Pixhawk' },
  { id: 'fmuv2', name: 'FMUv2 (Pixhawk 1)', category: 'Pixhawk' },
  { id: 'fmuv3', name: 'FMUv3 (Pixhawk 2)', category: 'Pixhawk' },
  { id: 'fmuv5', name: 'FMUv5 (Pixhawk 4)', category: 'Pixhawk' },

  // Holybro (Kakute H7 is popular)
  { id: 'KakuteH7', name: 'Kakute H7', category: 'Holybro', isPopular: true },
  { id: 'Durandal', name: 'Durandal', category: 'Holybro' },
  { id: 'Durandal-bdshot', name: 'Durandal (BDShot)', category: 'Holybro' },
  { id: 'KakuteF4', name: 'Kakute F4', category: 'Holybro' },
  { id: 'KakuteF7', name: 'Kakute F7', category: 'Holybro' },
  { id: 'KakuteF7Mini', name: 'Kakute F7 Mini', category: 'Holybro' },
  { id: 'KakuteH7-bdshot', name: 'Kakute H7 (BDShot)', category: 'Holybro' },
  { id: 'KakuteH7Mini', name: 'Kakute H7 Mini', category: 'Holybro' },
  { id: 'KakuteH7v2', name: 'Kakute H7 v2', category: 'Holybro' },
  { id: 'KakuteH7-Wing', name: 'Kakute H7 Wing', category: 'Holybro' },

  // SpeedyBee (F405 Wing is popular)
  { id: 'SpeedyBeeF405Wing', name: 'SpeedyBee F405 Wing', category: 'SpeedyBee', isPopular: true },
  { id: 'speedybeef4', name: 'SpeedyBee F4', category: 'SpeedyBee' },
  { id: 'speedybeef4v3', name: 'SpeedyBee F4 v3', category: 'SpeedyBee' },
  { id: 'SpeedyBeeF405Mini', name: 'SpeedyBee F405 Mini', category: 'SpeedyBee' },
  { id: 'SpeedyBeeF405WING', name: 'SpeedyBee F405 Wing (alt)', category: 'SpeedyBee' },
  { id: 'SpeedyBeeF405WINGV2', name: 'SpeedyBee F405 Wing V2', category: 'SpeedyBee' },
  { id: 'SpeedyBeeF7V3', name: 'SpeedyBee F7 v3', category: 'SpeedyBee' },

  // Matek (H743 is popular)
  { id: 'MatekH743', name: 'Matek H743-SLIM/WING', category: 'Matek', isPopular: true },
  { id: 'MatekF405-Wing', name: 'Matek F405-Wing', category: 'Matek', isPopular: true },
  { id: 'MatekF405', name: 'Matek F405-STD', category: 'Matek' },
  { id: 'MatekF405-bdshot', name: 'Matek F405 (BDShot)', category: 'Matek' },
  { id: 'MatekF405-Wing-bdshot', name: 'Matek F405-Wing (BDShot)', category: 'Matek' },
  { id: 'MatekF405-TE', name: 'Matek F405-TE', category: 'Matek' },
  { id: 'MatekF765-Wing', name: 'Matek F765-Wing', category: 'Matek' },
  { id: 'MatekH743-bdshot', name: 'Matek H743 (BDShot)', category: 'Matek' },
  { id: 'MatekH743SE', name: 'Matek H743 SE', category: 'Matek' },
  { id: 'MatekH743-periph', name: 'Matek H743 Periph', category: 'Matek' },
  { id: 'MatekH743v3', name: 'Matek H743 v3', category: 'Matek' },
  { id: 'MatekH7A3', name: 'Matek H7A3', category: 'Matek' },
  { id: 'MatekL431', name: 'Matek L431 (Wing Periph)', category: 'Matek' },

  // mRo
  { id: 'mRoPixracer', name: 'mRo Pixracer', category: 'mRo' },
  { id: 'mRoX21', name: 'mRo X2.1', category: 'mRo' },
  { id: 'mRoX21-777', name: 'mRo X2.1-777', category: 'mRo' },
  { id: 'mRoControlZeroF7', name: 'mRo Control Zero F7', category: 'mRo' },
  { id: 'mRoControlZeroH7', name: 'mRo Control Zero H7', category: 'mRo' },
  { id: 'mRoNexus', name: 'mRo Nexus', category: 'mRo' },

  // iFlight
  { id: 'BeastF7', name: 'iFlight Beast F7', category: 'iFlight' },
  { id: 'BeastF7v2', name: 'iFlight Beast F7 v2', category: 'iFlight' },
  { id: 'BeastH7', name: 'iFlight Beast H7', category: 'iFlight' },
  { id: 'BeastH7v2', name: 'iFlight Beast H7 v2', category: 'iFlight' },

  // Omnibus
  { id: 'omnibusf4', name: 'Omnibus F4', category: 'Omnibus' },
  { id: 'omnibusf4pro', name: 'Omnibus F4 Pro', category: 'Omnibus' },
  { id: 'omnibusf4v6', name: 'Omnibus F4 v6', category: 'Omnibus' },
  { id: 'OmnibusNanoV6', name: 'Omnibus Nano v6', category: 'Omnibus' },

  // CUAV
  { id: 'CUAV-Nora', name: 'CUAV Nora', category: 'CUAV' },
  { id: 'CUAV-X7', name: 'CUAV X7/X7Pro', category: 'CUAV' },
  { id: 'CUAVv5', name: 'CUAV v5', category: 'CUAV' },
  { id: 'CUAVv5Nano', name: 'CUAV v5 Nano', category: 'CUAV' },

  // Flywoo
  { id: 'FlywooF405HD-AIOv2', name: 'Flywoo F405 HD AIO v2', category: 'Flywoo' },
  { id: 'FlywooF745', name: 'Flywoo F745', category: 'Flywoo' },
  { id: 'FlywooF745Nano', name: 'Flywoo F745 Nano', category: 'Flywoo' },

  // Foxeer
  { id: 'Foxeerf405v2', name: 'Foxeer F405 v2', category: 'Foxeer' },
  { id: 'FoxeerH743v1', name: 'Foxeer H743 v1', category: 'Foxeer' },

  // Radiolink
  { id: 'MiniPix', name: 'Radiolink MiniPix', category: 'Radiolink' },
  { id: 'Pixhawk', name: 'Radiolink Pixhawk', category: 'Radiolink' },

  // Raspberry Pi / Linux
  { id: 'Navio', name: 'Navio+', category: 'Linux' },
  { id: 'Navio2', name: 'Navio2', category: 'Linux' },
  { id: 'edge', name: 'Emlid Edge', category: 'Linux' },
  { id: 'bebop', name: 'Parrot Bebop', category: 'Linux' },
  { id: 'Navigator', name: 'Blue Robotics Navigator', category: 'Linux' },
  { id: 'Pico', name: 'Raspberry Pi Pico', category: 'Linux' },
  { id: 'linux', name: 'Generic Linux', category: 'Linux' },

  // Simulator
  { id: 'SITL', name: 'SITL (Software Simulator)', category: 'Simulator' },

  // Others
  { id: 'Here4FC', name: 'Here4 FC', category: 'Other' },
  { id: 'F35Lightning', name: 'F35 Lightning', category: 'Other' },
  { id: 'revo-mini', name: 'Revolution Mini', category: 'Other' },
  { id: 'sparky2', name: 'Sparky2', category: 'Other' },
  { id: 'AIRLink', name: 'Sky-Drones AIRLink', category: 'Other' },
  { id: 'SkystarsH7HD', name: 'Skystars H7 HD', category: 'Other' },
  { id: 'MambaF405v2', name: 'Mamba F405 v2', category: 'Other' },
  { id: 'MambaH743v4', name: 'Mamba H743 v4', category: 'Other' },
];

/**
 * Get static board list (instant, no network)
 */
function getStaticBoards(): BoardInfo[] {
  return STATIC_BOARDS;
}

/**
 * Static Betaflight board list (offline fallback)
 */
const BETAFLIGHT_BOARDS_FALLBACK: BoardInfo[] = [
  { id: 'SPEEDYBEEF405', name: 'SpeedyBee F405', category: 'SpeedyBee', isPopular: true },
  { id: 'SPEEDYBEEF405V3', name: 'SpeedyBee F405 v3', category: 'SpeedyBee', isPopular: true },
  { id: 'SPEEDYBEEF405V4', name: 'SpeedyBee F405 v4', category: 'SpeedyBee' },
  { id: 'SPEEDYBEEF405WING', name: 'SpeedyBee F405 Wing', category: 'SpeedyBee' },
  { id: 'SPEEDYBEEF7', name: 'SpeedyBee F7', category: 'SpeedyBee' },
  { id: 'SPEEDYBEEF7V3', name: 'SpeedyBee F7 v3', category: 'SpeedyBee' },
  { id: 'SPEEDYBEEF7MINI', name: 'SpeedyBee F7 Mini', category: 'SpeedyBee' },
  { id: 'SPRACINGF3', name: 'SPRacing F3', category: 'SPRacing' },
  { id: 'SPRACINGF3EVO', name: 'SPRacing F3 EVO', category: 'SPRacing' },
  { id: 'SPRACINGF3MINI', name: 'SPRacing F3 Mini', category: 'SPRacing' },
  { id: 'SPRACINGF4EVO', name: 'SPRacing F4 EVO', category: 'SPRacing' },
  { id: 'SPRACINGF4NEO', name: 'SPRacing F4 Neo', category: 'SPRacing' },
  { id: 'SPRACINGF7DUAL', name: 'SPRacing F7 Dual', category: 'SPRacing' },
  { id: 'SPRACINGH7EXTREME', name: 'SPRacing H7 Extreme', category: 'SPRacing', isPopular: true },
  { id: 'SPRACINGH7RF', name: 'SPRacing H7 RF', category: 'SPRacing' },
  { id: 'KAKUTEF4', name: 'Kakute F4', category: 'Holybro' },
  { id: 'KAKUTEF4V2', name: 'Kakute F4 v2', category: 'Holybro' },
  { id: 'KAKUTEF7', name: 'Kakute F7', category: 'Holybro', isPopular: true },
  { id: 'KAKUTEF7MINI', name: 'Kakute F7 Mini', category: 'Holybro' },
  { id: 'KAKUTEH7', name: 'Kakute H7', category: 'Holybro', isPopular: true },
  { id: 'KAKUTEH7MINI', name: 'Kakute H7 Mini', category: 'Holybro' },
  { id: 'KAKUTEH7V2', name: 'Kakute H7 v2', category: 'Holybro' },
  { id: 'MATEKF405', name: 'Matek F405', category: 'Matek', isPopular: true },
  { id: 'MATEKF405SE', name: 'Matek F405 SE', category: 'Matek' },
  { id: 'MATEKF405STD', name: 'Matek F405 STD', category: 'Matek' },
  { id: 'MATEKF405TE', name: 'Matek F405 TE', category: 'Matek' },
  { id: 'MATEKF411', name: 'Matek F411', category: 'Matek' },
  { id: 'MATEKF722', name: 'Matek F722', category: 'Matek' },
  { id: 'MATEKF722SE', name: 'Matek F722 SE', category: 'Matek' },
  { id: 'MATEKH743', name: 'Matek H743', category: 'Matek', isPopular: true },
  { id: 'OMNIBUS', name: 'Omnibus', category: 'Omnibus' },
  { id: 'OMNIBUSF4', name: 'Omnibus F4', category: 'Omnibus' },
  { id: 'OMNIBUSF4SD', name: 'Omnibus F4 SD', category: 'Omnibus' },
  { id: 'OMNIBUSF4V6', name: 'Omnibus F4 v6', category: 'Omnibus' },
  { id: 'OMNIBUSF7', name: 'Omnibus F7', category: 'Omnibus' },
  { id: 'IFLIGHT_BLITZ_F7_AIO', name: 'iFlight Blitz F7 AIO', category: 'iFlight', isPopular: true },
  { id: 'IFLIGHT_BLITZ_F722', name: 'iFlight Blitz F722', category: 'iFlight' },
  { id: 'IFLIGHT_SUCCEX_E_F4', name: 'iFlight SucceX-E F4', category: 'iFlight' },
  { id: 'IFLIGHT_SUCCEX_E_F7', name: 'iFlight SucceX-E F7', category: 'iFlight' },
  { id: 'IFLIGHT_F405_AIO', name: 'iFlight F405 AIO', category: 'iFlight' },
  { id: 'MAMBAF405', name: 'Mamba F405', category: 'Diatone' },
  { id: 'MAMBAF405US', name: 'Mamba F405 US', category: 'Diatone' },
  { id: 'MAMBAF405MK2', name: 'Mamba F405 MK2', category: 'Diatone' },
  { id: 'MAMBAF722', name: 'Mamba F722', category: 'Diatone' },
  { id: 'MAMBAF722S', name: 'Mamba F722 S', category: 'Diatone' },
  { id: 'MAMBAH743', name: 'Mamba H743', category: 'Diatone', isPopular: true },
  { id: 'FLYWOOF405', name: 'Flywoo F405', category: 'Flywoo' },
  { id: 'FLYWOOF405HD', name: 'Flywoo F405 HD', category: 'Flywoo' },
  { id: 'FLYWOOF745', name: 'Flywoo F745', category: 'Flywoo' },
  { id: 'FLYWOOF745NANO', name: 'Flywoo F745 Nano', category: 'Flywoo' },
  { id: 'FLYWOOH743', name: 'Flywoo H743', category: 'Flywoo' },
  { id: 'GEPRCF405', name: 'GEPRC F405', category: 'GEPRC' },
  { id: 'GEPRCF722', name: 'GEPRC F722', category: 'GEPRC' },
  { id: 'GEPRCF722_BT_HD', name: 'GEPRC F722 BT HD', category: 'GEPRC' },
  { id: 'BETAFPVF405', name: 'BetaFPV F405', category: 'BetaFPV' },
  { id: 'BETAFPVF722', name: 'BetaFPV F722', category: 'BetaFPV' },
  { id: 'BETAFLIGHTF4', name: 'Betaflight F4', category: 'BetaFPV' },
  { id: 'RUSHCORE7', name: 'Rush Core 7', category: 'Rush' },
  { id: 'RUSHBLADEF7', name: 'Rush Blade F7', category: 'Rush' },
  { id: 'AIKONF4', name: 'Aikon F4', category: 'Aikon' },
  { id: 'AIKONF7', name: 'Aikon F7', category: 'Aikon' },
  { id: 'COLIBRI_RACE', name: 'TBS Colibri Race', category: 'TBS' },
  { id: 'STM32F405', name: 'Generic STM32F405', category: 'Generic' },
  { id: 'STM32F411', name: 'Generic STM32F411', category: 'Generic' },
  { id: 'STM32F7X2', name: 'Generic STM32F7x2', category: 'Generic' },
  { id: 'STM32H743', name: 'Generic STM32H743', category: 'Generic' },
];

/**
 * Static iNav board list (offline fallback)
 */
const INAV_BOARDS_FALLBACK: BoardInfo[] = [
  { id: 'SPEEDYBEEF405V3', name: 'SpeedyBee F405 v3', category: 'SpeedyBee', isPopular: true },
  { id: 'SPEEDYBEEF405WING', name: 'SpeedyBee F405 Wing', category: 'SpeedyBee', isPopular: true },
  { id: 'SPEEDYBEEF7V3', name: 'SpeedyBee F7 v3', category: 'SpeedyBee' },
  { id: 'MATEKF405SE', name: 'Matek F405 SE', category: 'Matek', isPopular: true },
  { id: 'MATEKF405WING', name: 'Matek F405 Wing', category: 'Matek', isPopular: true },
  { id: 'MATEKF405TE', name: 'Matek F405 TE', category: 'Matek' },
  { id: 'MATEKF722SE', name: 'Matek F722 SE', category: 'Matek' },
  { id: 'MATEKF722WING', name: 'Matek F722 Wing', category: 'Matek' },
  { id: 'MATEKH743', name: 'Matek H743', category: 'Matek', isPopular: true },
  { id: 'MATEKH743WING', name: 'Matek H743 Wing', category: 'Matek' },
  { id: 'KAKUTEF7', name: 'Kakute F7', category: 'Holybro' },
  { id: 'KAKUTEF7MINI', name: 'Kakute F7 Mini', category: 'Holybro' },
  { id: 'KAKUTEH7', name: 'Kakute H7', category: 'Holybro' },
  { id: 'KAKUTEH7MINI', name: 'Kakute H7 Mini', category: 'Holybro' },
  { id: 'OMNIBUSF4', name: 'Omnibus F4', category: 'Omnibus' },
  { id: 'OMNIBUSF4PRO', name: 'Omnibus F4 Pro', category: 'Omnibus' },
  { id: 'OMNIBUSF7', name: 'Omnibus F7', category: 'Omnibus' },
  { id: 'MAMBAF405', name: 'Mamba F405', category: 'Diatone' },
  { id: 'MAMBAF722', name: 'Mamba F722', category: 'Diatone' },
  { id: 'MAMBAH743', name: 'Mamba H743', category: 'Diatone' },
  { id: 'IFLIGHT_BLITZ_F7_AIO', name: 'iFlight Blitz F7 AIO', category: 'iFlight' },
  { id: 'FLYWOOF405', name: 'Flywoo F405', category: 'Flywoo' },
  { id: 'FLYWOOF745', name: 'Flywoo F745', category: 'Flywoo' },
  { id: 'GENERIC', name: 'Generic Flight Controller', category: 'Generic' },
  { id: 'FRSKYF3', name: 'FrSky F3', category: 'F3 Boards' },
  { id: 'AIRHEROF3', name: 'Airhero F3', category: 'F3 Boards' },
  { id: 'AIRHEROF3_QUAD', name: 'Airhero F3 Quad', category: 'F3 Boards' },
  { id: 'SPRACINGF3', name: 'SPRacing F3', category: 'F3 Boards (Legacy)' },
  { id: 'SPRACINGF3EVO', name: 'SPRacing F3 EVO', category: 'F3 Boards (Legacy)' },
  { id: 'SPRACINGF3MINI', name: 'SPRacing F3 Mini', category: 'F3 Boards (Legacy)' },
  { id: 'SPRACINGF3NEO', name: 'SPRacing F3 Neo', category: 'F3 Boards (Legacy)' },
];

// ─── Betaflight Build API (build.betaflight.com) ────────────────────────────

const BF_BUILD_API = 'https://build.betaflight.com';

/** Manufacturer code → display name */
const BF_MANUFACTURERS: Record<string, string> = {
  'SPBE': 'SpeedyBee', 'HBRO': 'Holybro', 'MTKS': 'Matek',
  'DIAT': 'Diatone', 'GEPR': 'GEPRC', 'IFRC': 'iFlight',
  'RUSH': 'Rush', 'FLWO': 'Flywoo', 'BFPV': 'BetaFPV',
  'AIRB': 'Airbot', 'AIKO': 'Aikon', 'FOXE': 'Foxeer',
  'HGLR': 'HGLRC', 'JHEF': 'JHE', 'LMNR': 'Luminier',
  'FOSS': 'Open Source', 'CUST': 'Custom', 'SKST': 'Skystars',
  'TURC': 'TuneRC', 'BEFH': 'BetaFPV', 'TMTR': 'T-Motor',
  'AXIS': 'AxisFlying', 'TCMM': 'TCMM',
};

/** Known target name prefixes for pretty-printing */
const BF_TARGET_PREFIXES = [
  'SPEEDYBEE', 'KAKUTE', 'MATEK', 'MAMBA', 'GEPRC', 'IFLIGHT',
  'FLYWOO', 'BETAFPV', 'OMNIBUS', 'SPRACING', 'FOXEER', 'HGLRC',
  'RUSHBLADE', 'RUSHCORE', 'AIKON', 'SKYSTARS', 'ATOMRC',
] as const;

/**
 * Format a BF target name for display.
 * "SPEEDYBEEF405V4" → "SpeedyBee F405 V4"
 */
function formatBfTargetName(target: string): string {
  let rest = target;
  let prefix = '';

  for (const p of BF_TARGET_PREFIXES) {
    if (target.startsWith(p)) {
      prefix = p;
      rest = target.slice(p.length);
      break;
    }
  }

  if (!prefix) return target;

  // Insert spaces before chip designators (F4, F7, H7, etc.)
  const formatted = rest.replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2');

  // Map prefix to display name
  const displayPrefix: Record<string, string> = {
    'SPEEDYBEE': 'SpeedyBee', 'KAKUTE': 'Kakute', 'MATEK': 'Matek',
    'MAMBA': 'Mamba', 'GEPRC': 'GEPRC', 'IFLIGHT': 'iFlight',
    'FLYWOO': 'Flywoo', 'BETAFPV': 'BetaFPV', 'OMNIBUS': 'Omnibus',
    'SPRACING': 'SPRacing', 'FOXEER': 'Foxeer', 'HGLRC': 'HGLRC',
    'RUSHBLADE': 'Rush Blade', 'RUSHCORE': 'Rush Core', 'AIKON': 'Aikon',
    'SKYSTARS': 'Skystars', 'ATOMRC': 'AtomRC',
  };

  return `${displayPrefix[prefix] ?? prefix} ${formatted}`.trim();
}

/**
 * Map BF manufacturer code to category name
 */
function mapBfManufacturer(code: string): string {
  return BF_MANUFACTURERS[code] ?? 'Other';
}

/** Cache: Betaflight target list */
let bfTargetsCache: { data: BoardInfo[]; fetchedAt: number } | null = null;

/** Cache: Betaflight releases per target */
const bfVersionsCache = new Map<string, { data: FirmwareVersion[]; fetchedAt: number }>();

/**
 * Fetch JSON from a URL using Node https (GET)
 */
function fetchJson<T = any>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    https.get(parsedUrl, { headers: { 'User-Agent': 'ArduDeck-GCS' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * POST JSON to a URL and return parsed response
 */
function postJson<T = any>(url: string, body: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const payload = JSON.stringify(body);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'User-Agent': 'ArduDeck-GCS',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} POST ${url}: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve a Betaflight firmware download URL.
 * For non-cloud builds: returns direct hex URL.
 * For cloud builds: triggers build, polls for completion, returns download URL.
 */
export async function resolveBetaflightDownloadUrl(downloadUrl: string): Promise<string> {
  // Extract release and target from URL pattern: /api/builds/{release}/{target}/hex
  const match = downloadUrl.match(/\/api\/builds\/([^/]+)\/([^/]+)\/hex$/);
  if (!match) return downloadUrl;

  const release = match[1]!;
  const target = match[2]!;

  // Check build info to see if it's cloud-built
  const buildInfo: { cloudBuild: boolean; url: string } =
    await fetchJson(`${BF_BUILD_API}/api/builds/${release}/${target}`);

  if (!buildInfo.cloudBuild) {
    // Non-cloud: direct hex download via the url field from response
    return `${BF_BUILD_API}${buildInfo.url}`;
  }

  // Cloud build: trigger a default build with CLOUD_BUILD option
  // (matches BF configurator's core build mode with no custom options)
  console.log(`[manifest-fetcher] Triggering BF cloud build for ${target} @ ${release}...`);
  const buildResponse: { key?: string; url?: string; file?: string; status?: string } = await postJson(
    `${BF_BUILD_API}/api/builds`,
    { target, release, options: ['CLOUD_BUILD'] }
  );

  if (!buildResponse.key) {
    throw new Error(`BF cloud build returned no key for ${target} @ ${release}`);
  }

  // If the server already has this build cached, status will be "success" immediately
  if (buildResponse.status === 'success' && buildResponse.url) {
    console.log(`[manifest-fetcher] BF cloud build cached, ready to download: ${buildResponse.file}`);
    return `${BF_BUILD_API}${buildResponse.url}`;
  }

  // Poll build status until complete (max 120 seconds)
  const buildKey = buildResponse.key;
  const buildUrl = buildResponse.url; // firmware download path (relative)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);
    const status: { status?: string; timeOut?: number } =
      await fetchJson(`${BF_BUILD_API}/api/builds/${buildKey}/status`);

    if (status.status === 'success') {
      console.log(`[manifest-fetcher] BF cloud build complete for ${target} @ ${release}`);
      // Download from the url provided in the original build response
      if (buildUrl) {
        return `${BF_BUILD_API}${buildUrl}`;
      }
      // Fallback: try the key-based hex endpoint
      return `${BF_BUILD_API}/api/builds/${buildKey}/hex`;
    }

    if (status.status === 'error' || status.status === 'failed') {
      throw new Error(`BF cloud build failed for ${target} @ ${release}`);
    }

    // Still queued/building...
    if (i % 5 === 0) {
      console.log(`[manifest-fetcher] BF cloud build in progress (${i * 2}s)...`);
    }
  }

  throw new Error(`BF cloud build timed out for ${target} @ ${release}`);
}

/**
 * Fetch all Betaflight targets from the build API.
 * Returns ~370 boards. Cached for 1 hour. Falls back to static list offline.
 */
export async function getBetaflightBoards(): Promise<BoardInfo[]> {
  if (bfTargetsCache && Date.now() - bfTargetsCache.fetchedAt < CACHE_DURATION) {
    return bfTargetsCache.data;
  }
  try {
    const targets: Array<{ target: string; manufacturer: string; mcu: string }> =
      await fetchJson(`${BF_BUILD_API}/api/targets`);

    const boards: BoardInfo[] = targets.map((t) => ({
      id: t.target,
      name: formatBfTargetName(t.target),
      category: mapBfManufacturer(t.manufacturer),
    }));

    // Sort alphabetically by name
    boards.sort((a, b) => a.name.localeCompare(b.name));
    bfTargetsCache = { data: boards, fetchedAt: Date.now() };
    console.log(`[manifest-fetcher] Fetched ${boards.length} Betaflight targets from build API`);
    return boards;
  } catch (err) {
    console.warn('[manifest-fetcher] BF targets API failed, using fallback:', err);
    return BETAFLIGHT_BOARDS_FALLBACK;
  }
}

/**
 * Fetch available Betaflight firmware versions for a specific target.
 * Uses the build.betaflight.com per-target API.
 * For non-cloud builds: direct hex download at /api/builds/{release}/{target}/hex
 * For cloud builds: hex download at /api/builds/{release}/{target}/hex (default config)
 */
export async function getBetaflightVersions(boardId: string): Promise<FirmwareVersion[]> {
  const cached = bfVersionsCache.get(boardId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const info: {
      target: string;
      manufacturer: string;
      releases: Array<{
        release: string;
        type: string;
        date: string;
        cloudBuild: boolean;
        withdrawn?: boolean;
      }>;
    } = await fetchJson(`${BF_BUILD_API}/api/targets/${boardId}`);

    const versions: FirmwareVersion[] = [];

    for (const rel of info.releases) {
      if (rel.withdrawn) continue;
      // Only include Stable releases (skip RC and Unstable)
      if (rel.type !== 'Stable') continue;

      // For both cloud and non-cloud builds, the build API serves hex at this path
      const downloadUrl = `${BF_BUILD_API}/api/builds/${rel.release}/${boardId}/hex`;

      versions.push({
        version: rel.release,
        releaseType: 'stable',
        releaseDate: rel.date ?? '',
        downloadUrl,
        boardId,
        vehicleType: 'Copter',
      });
    }

    // Sort newest first
    versions.sort((a, b) => compareVersions(b.version, a.version));

    bfVersionsCache.set(boardId, { data: versions, fetchedAt: Date.now() });
    console.log(`[manifest-fetcher] Fetched ${versions.length} BF versions for ${boardId}`);
    return versions;
  } catch (err) {
    console.warn(`[manifest-fetcher] BF versions API failed for ${boardId}, using curated fallback:`, err);
    return getBetaflightCuratedVersions(boardId);
  }
}

// ─── iNav GitHub Releases ───────────────────────────────────────────────────

/** Cache: iNav GitHub releases (with assets) */
let inavReleasesCache: { data: InavRelease[]; fetchedAt: number } | null = null;

interface InavAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface InavRelease {
  tag_name: string;
  name: string;
  published_at: string;
  prerelease: boolean;
  assets: InavAsset[];
}

/**
 * Fetch iNav releases from GitHub. Cached for 1 hour.
 */
async function fetchInavReleases(): Promise<InavRelease[]> {
  if (inavReleasesCache && Date.now() - inavReleasesCache.fetchedAt < CACHE_DURATION) {
    return inavReleasesCache.data;
  }
  const releases: InavRelease[] = await fetchJson(
    'https://api.github.com/repos/iNavFlight/inav/releases?per_page=10'
  );
  // Filter to stable only
  const stable = releases.filter((r) => !r.prerelease);
  inavReleasesCache = { data: stable, fetchedAt: Date.now() };
  console.log(`[manifest-fetcher] Fetched ${stable.length} stable iNav releases from GitHub`);
  return stable;
}

/** Regex to extract target name from iNav hex asset filename */
const INAV_HEX_REGEX = /^inav_[\d.]+(?:[-_]RC\d+)?_(.+)\.hex$/i;

/**
 * Fetch all iNav boards by parsing hex asset filenames across releases.
 * Returns ~220 unique boards. Cached via fetchInavReleases(). Falls back to static list offline.
 */
export async function getInavBoards(): Promise<BoardInfo[]> {
  try {
    const releases = await fetchInavReleases();
    const targetSet = new Set<string>();

    for (const release of releases) {
      for (const asset of release.assets) {
        const match = INAV_HEX_REGEX.exec(asset.name);
        if (match?.[1]) {
          targetSet.add(match[1]);
        }
      }
    }

    const boards: BoardInfo[] = Array.from(targetSet).map((target) => ({
      id: target,
      name: formatBfTargetName(target), // reuse — same naming convention
      category: categorizeInavBoard(target),
    }));

    boards.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[manifest-fetcher] Parsed ${boards.length} unique iNav targets from releases`);
    return boards;
  } catch (err) {
    console.warn('[manifest-fetcher] iNav releases API failed, using fallback:', err);
    return INAV_BOARDS_FALLBACK;
  }
}

/**
 * Categorize an iNav board target into a display group
 */
function categorizeInavBoard(target: string): string {
  const t = target.toUpperCase();
  if (t.startsWith('SPEEDYBEE')) return 'SpeedyBee';
  if (t.startsWith('MATEK')) return 'Matek';
  if (t.startsWith('KAKUTE')) return 'Holybro';
  if (t.startsWith('MAMBA')) return 'Diatone';
  if (t.startsWith('OMNIBUS')) return 'Omnibus';
  if (t.startsWith('IFLIGHT') || t.startsWith('BLITZ') || t.startsWith('SUCCEX')) return 'iFlight';
  if (t.startsWith('FLYWOO')) return 'Flywoo';
  if (t.startsWith('GEPRC')) return 'GEPRC';
  if (t.startsWith('FOXEER')) return 'Foxeer';
  if (t.startsWith('HGLRC')) return 'HGLRC';
  if (t.startsWith('ATOMRC')) return 'AtomRC';
  if (t.startsWith('BETAFPV')) return 'BetaFPV';
  if (t.startsWith('SPRACING')) return 'SPRacing';
  if (t.includes('F3') && (t.startsWith('FRSKY') || t.startsWith('AIRHERO') || t.startsWith('SPRACING'))) return 'F3 Boards';
  return 'Other';
}

/**
 * Get iNav firmware versions for a specific board from cached GitHub releases.
 * Matches assets by target name and returns versions with direct download URLs.
 */
export async function getInavVersions(vehicleType: FirmwareVehicleType, boardId: string): Promise<FirmwareVersion[]> {
  try {
    const releases = await fetchInavReleases();
    const versions: FirmwareVersion[] = [];

    for (const release of releases) {
      // Find matching hex asset for this board
      const asset = release.assets.find((a) => {
        const match = INAV_HEX_REGEX.exec(a.name);
        return match?.[1] === boardId;
      });

      if (asset) {
        versions.push({
          version: release.tag_name,
          releaseType: 'stable',
          releaseDate: release.published_at?.split('T')[0] ?? '',
          downloadUrl: asset.browser_download_url,
          boardId,
          vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
          fileSize: hexToBinarySize(asset.size),
        });
      }
    }

    // Sort newest first
    versions.sort((a, b) => compareVersions(b.version, a.version));

    if (versions.length > 0) {
      console.log(`[manifest-fetcher] Found ${versions.length} iNav versions for ${boardId}`);
      return versions;
    }

    // No matching assets found — fall back to curated
    return getInavCuratedVersions(vehicleType, boardId);
  } catch {
    return getInavCuratedVersions(vehicleType, boardId);
  }
}

/**
 * Legacy AVR boards - these are not in the modern manifest
 * Last supported versions from ~2015-2016
 * Firmware is bundled with the app in resources/firmware/legacy/
 */
const LEGACY_AVR_BOARDS = ['apm1', 'apm2'];

/**
 * Get path to bundled legacy firmware
 */
function getLegacyFirmwarePath(boardId: string, firmwareType: string): string {
  // In dev: resources/firmware/legacy/apm2/ArduCopter.hex
  // In prod: resources/firmware/legacy/apm2/ArduCopter.hex (packed in asar or extraResources)
  const resourcesPath = app.isPackaged
    ? path.join(app.getAppPath() + '.unpacked', 'resources', 'firmware', 'legacy', boardId)
    : path.join(app.getAppPath(), 'resources', 'firmware', 'legacy', boardId);

  return path.join(resourcesPath, `${firmwareType}.hex`);
}

function getLegacyAvrVersions(vehicleType: FirmwareVehicleType, boardId: string): VersionGroup[] {
  const firmwareType = VEHICLE_TO_FIRMWARE[vehicleType]; // 'Copter', 'Plane', 'Rover', 'Sub'

  // Map firmware type to filename (as stored in resources/firmware/legacy/)
  const firmwareFilenames: Record<string, string> = {
    Copter: 'ArduCopter',
    Plane: 'ArduPlane',
    Rover: 'APMrover2',
    // Sub and AntennaTracker not supported on AVR
  };

  const filename = firmwareFilenames[firmwareType];
  if (!filename) {
    return [{
      major: 'legacy',
      label: 'Not supported on AVR',
      versions: [],
      isLatest: false,
    }];
  }

  // Last supported versions for AVR boards (keyed by firmwareType from VEHICLE_TO_FIRMWARE)
  const legacyVersions: Record<string, Record<string, string>> = {
    Copter: {
      apm2: '3.2.1',
      apm1: '3.2.1',
    },
    Plane: {
      apm2: '3.4.0',
      apm1: '3.4.0',
    },
    Rover: {
      apm2: '2.5.1',
      apm1: '2.5.1',
    },
  };

  const version = legacyVersions[firmwareType]?.[boardId];
  if (!version) {
    return [{
      major: 'legacy',
      label: 'No firmware available',
      versions: [],
      isLatest: false,
    }];
  }

  // Point to bundled local file
  const localPath = getLegacyFirmwarePath(boardId, filename);

  const fwVersions: FirmwareVersion[] = [{
    version,
    releaseType: 'stable' as const,
    releaseDate: '2015',
    downloadUrl: localPath, // Local file path instead of URL
    boardId,
    vehicleType: firmwareType,
  }];

  const major = version.split('.').slice(0, 2).join('.');
  return [{
    major,
    label: `${major}.x (Legacy AVR - Bundled)`,
    versions: fwVersions,
    isLatest: true,
  }];
}

/**
 * Get firmware versions grouped by major version
 */
export async function getArduPilotVersions(
  vehicleType: FirmwareVehicleType,
  boardId: string
): Promise<VersionGroup[]> {
  // Handle legacy AVR boards separately - they're not in the manifest
  if (LEGACY_AVR_BOARDS.includes(boardId)) {
    return getLegacyAvrVersions(vehicleType, boardId);
  }

  const firmwareType = VEHICLE_TO_FIRMWARE[vehicleType];
  const firmwareNameLower = firmwareType.toLowerCase();

  try {
    const manifest = await fetchArduPilotManifest();
    const entries = manifest.firmware || [];


    // Filter entries for this board and vehicle type
    const versionMap = new Map<string, FirmwareVersion[]>();

    // Also try case-insensitive match for board ID
    const boardIdLower = boardId.toLowerCase();

    for (const entry of entries) {
      if (entry.vehicletype !== firmwareType) continue;
      // Try exact match first, then case-insensitive
      const platformMatch = entry.platform === boardId || entry.platform?.toLowerCase() === boardIdLower;
      if (!platformMatch) continue;
      if (entry.format !== 'apj') continue;

      const version = entry['mav-firmware-version'];
      const releaseType = entry['mav-firmware-version-type']?.toLowerCase() || 'stable';

      if (!version) continue;

      // Parse major.minor from version (e.g., "4.5.7" -> "4.5")
      const parts = version.split('.');
      if (parts.length < 2) continue;
      const major = `${parts[0]}.${parts[1]}`;

      const fwVersion: FirmwareVersion = {
        version,
        releaseType: releaseType === 'official' ? 'stable' : releaseType as any,
        releaseDate: '',
        downloadUrl: entry.url || `${FIRMWARE_SERVERS.ardupilot.base}/${firmwareType}/${releaseType === 'official' ? 'stable' : releaseType}-${version}/${boardId}/ardu${firmwareNameLower}.apj`,
        boardId,
        vehicleType: firmwareType,
        gitHash: entry['git-sha'],
      };

      if (!versionMap.has(major)) {
        versionMap.set(major, []);
      }
      versionMap.get(major)!.push(fwVersion);
    }

    // Deduplicate versions within each group (keep first entry per version string)
    for (const [key, versions] of versionMap.entries()) {
      const seen = new Set<string>();
      const deduped = versions.filter(v => {
        if (seen.has(v.version)) return false;
        seen.add(v.version);
        return true;
      });
      versionMap.set(key, deduped);
    }

    // Sort versions within each group (newest first)
    for (const versions of versionMap.values()) {
      versions.sort((a, b) => compareVersions(b.version, a.version));
    }

    // Convert to VersionGroup array and sort (newest major first)
    const groups = Array.from(versionMap.entries())
      .map(([major, versions]) => ({
        major,
        label: major + '.x',
        versions,
        isLatest: false,
      }))
      .sort((a, b) => compareVersions(b.major, a.major));


    // If no versions found, use fallback
    if (groups.length === 0) {
      return getFallbackVersionGroups(vehicleType, boardId);
    }

    // Mark the latest stable
    const latestStable = groups.find(g => g.versions.some(v => v.releaseType === 'stable'));
    if (latestStable) {
      latestStable.isLatest = true;
      latestStable.label = `${latestStable.major}.x (Latest Stable)`;
    }

    return groups;
  } catch (error) {
    console.error('[manifest-fetcher] Failed to fetch versions:', error);
    // Return fallback versions
    return getFallbackVersionGroups(vehicleType, boardId);
  }
}

/**
 * Compare version strings (e.g., "4.5.7" vs "4.4.4")
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal !== bVal) return aVal - bVal;
  }
  return 0;
}

/**
 * Fallback version groups if manifest fetch fails
 */
function getFallbackVersionGroups(vehicleType: FirmwareVehicleType, boardId: string): VersionGroup[] {
  const firmwareType = VEHICLE_TO_FIRMWARE[vehicleType];
  const firmwareNameLower = firmwareType.toLowerCase();
  const baseUrl = FIRMWARE_SERVERS.ardupilot.base;

  const createVersion = (ver: string, type: 'stable' | 'beta' | 'dev'): FirmwareVersion => ({
    version: ver,
    releaseType: type,
    releaseDate: '',
    downloadUrl: `${baseUrl}/${firmwareType}/${type === 'stable' ? 'stable' : type}-${ver}/${boardId}/ardu${firmwareNameLower}.apj`,
    boardId,
    vehicleType: firmwareType,
  });

  return [
    {
      major: '4.5',
      label: '4.5.x (Latest Stable)',
      isLatest: true,
      versions: [
        createVersion('4.5.7', 'stable'),
        createVersion('4.5.6', 'stable'),
        createVersion('4.5.5', 'stable'),
      ],
    },
    {
      major: '4.4',
      label: '4.4.x',
      isLatest: false,
      versions: [
        createVersion('4.4.4', 'stable'),
        createVersion('4.4.3', 'stable'),
      ],
    },
    {
      major: '4.3',
      label: '4.3.x',
      isLatest: false,
      versions: [
        createVersion('4.3.8', 'stable'),
        createVersion('4.3.7', 'stable'),
      ],
    },
  ];
}

/**
 * Fetch firmware versions for a source/vehicle/board combination
 * Returns flat list for backward compatibility
 */
export async function fetchFirmwareVersions(
  source: FirmwareSource,
  vehicleType: FirmwareVehicleType,
  boardId: string
): Promise<FirmwareManifest> {
  // Check if this source supports the vehicle type
  if (!isVehicleSupported(source, vehicleType)) {
    const sourceNames: Record<FirmwareSource, string> = {
      ardupilot: 'ArduPilot',
      px4: 'PX4',
      betaflight: 'Betaflight',
      inav: 'iNav',
      custom: 'Custom',
    };
    const vehicleNames: Record<FirmwareVehicleType, string> = {
      copter: 'multicopters',
      plane: 'fixed-wing aircraft',
      vtol: 'VTOL aircraft',
      rover: 'rovers',
      boat: 'boats',
      sub: 'submarines',
    };
    return {
      source,
      fetchedAt: Date.now(),
      versions: [],
      error: `${sourceNames[source]} does not support ${vehicleNames[vehicleType]}`,
    };
  }

  let versions: FirmwareVersion[] = [];

  if (source === 'ardupilot') {
    const groups = await getArduPilotVersions(vehicleType, boardId);
    // Flatten all versions
    versions = groups.flatMap(g => g.versions);
  } else if (source === 'px4') {
    versions = getPx4CuratedVersions(vehicleType, boardId);
  } else if (source === 'betaflight') {
    versions = await getBetaflightVersions(boardId);
  } else if (source === 'inav') {
    versions = await getInavVersions(vehicleType, boardId);
  }

  return {
    source,
    fetchedAt: Date.now(),
    versions,
  };
}

/**
 * Curated PX4 firmware versions
 */
function getPx4CuratedVersions(vehicleType: FirmwareVehicleType, boardId: string): FirmwareVersion[] {
  let fmuVersion = 'v5';
  const boardIdLower = boardId.toLowerCase();

  if (boardIdLower.includes('v6x') || boardIdLower.includes('pixhawk6x')) {
    fmuVersion = 'v6x';
  } else if (boardIdLower.includes('v6c') || boardIdLower.includes('pixhawk6c')) {
    fmuVersion = 'v6c';
  } else if (boardIdLower.includes('cube')) {
    fmuVersion = 'v5';
  } else if (boardIdLower.includes('v3') || boardIdLower.includes('pixhawk1')) {
    fmuVersion = 'v3';
  }

  const baseUrl = 'https://github.com/PX4/PX4-Autopilot/releases/download';

  return [
    {
      version: '1.14.3',
      releaseType: 'stable',
      releaseDate: '',
      downloadUrl: `${baseUrl}/v1.14.3/px4_fmu-${fmuVersion}_default.px4`,
      boardId: `fmu-${fmuVersion}`,
      vehicleType: vehicleType,
    },
    {
      version: '1.14.2',
      releaseType: 'stable',
      releaseDate: '',
      downloadUrl: `${baseUrl}/v1.14.2/px4_fmu-${fmuVersion}_default.px4`,
      boardId: `fmu-${fmuVersion}`,
      vehicleType: vehicleType,
    },
    {
      version: '1.13.3',
      releaseType: 'stable',
      releaseDate: '',
      downloadUrl: `${baseUrl}/v1.13.3/px4_fmu-${fmuVersion}_default.px4`,
      boardId: `fmu-${fmuVersion}`,
      vehicleType: vehicleType,
    },
  ];
}

/**
 * Curated Betaflight firmware versions
 * Note: F3 boards are not supported in Betaflight 4.x (dropped after 3.5.7)
 */
function getBetaflightCuratedVersions(boardId: string): FirmwareVersion[] {
  const boardIdUpper = boardId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Betaflight uses 'v' prefix for release tags (e.g., v4.5.1, v3.5.7)
  const baseUrl = 'https://github.com/betaflight/betaflight/releases/download';

  // Check if this is an F3 board (deprecated - last support was 3.5.7)
  const isF3Board = boardIdUpper.includes('F3') ||
                    boardIdUpper === 'SPRACINGF3' ||
                    boardIdUpper === 'SPRACINGF3EVO' ||
                    boardIdUpper === 'SPRACINGF3MINI';

  if (isF3Board) {
    // F3 boards only work with Betaflight 3.5.x and earlier
    // Betaflight 3.x tags don't have 'v' prefix (3.5.7 not v3.5.7)
    return [
      {
        version: '3.5.7',
        releaseType: 'stable',
        releaseDate: '2019-03-15',
        releaseNotes: 'Last version supporting F3 boards (256KB flash max)',
        downloadUrl: `${baseUrl}/3.5.7/betaflight_3.5.7_${boardIdUpper}.hex`,
        boardId: boardIdUpper,
        vehicleType: 'Copter',
        fileSize: hexToBinarySize(530000), // ~230KB binary
      },
      {
        version: '3.5.6',
        releaseType: 'stable',
        releaseDate: '2019-02-01',
        downloadUrl: `${baseUrl}/3.5.6/betaflight_3.5.6_${boardIdUpper}.hex`,
        boardId: boardIdUpper,
        vehicleType: 'Copter',
        fileSize: hexToBinarySize(530000), // ~230KB binary
      },
    ];
  }

  // Use the board ID directly - Betaflight uses uppercase board names
  // Map common variations to correct target names
  let targetBoard = boardIdUpper;

  // Handle specific board name mappings
  if (boardIdUpper.includes('SPRACING')) {
    // SPRacing H7/F7/F4 boards
    if (boardIdUpper.includes('H7EXTREME')) targetBoard = 'SPRACINGH7EXTREME';
    else if (boardIdUpper.includes('H7RF')) targetBoard = 'SPRACINGH7RF';
    else if (boardIdUpper.includes('F7DUAL')) targetBoard = 'SPRACINGF7DUAL';
    else if (boardIdUpper.includes('F4EVO')) targetBoard = 'SPRACINGF4EVO';
    else if (boardIdUpper.includes('F4NEO')) targetBoard = 'SPRACINGF4NEO';
    else targetBoard = boardIdUpper;
  } else if (boardIdUpper.includes('SPEEDYBEE')) {
    if (boardIdUpper.includes('F7V3')) targetBoard = 'SPEEDYBEEF7V3';
    else if (boardIdUpper.includes('F7MINI')) targetBoard = 'SPEEDYBEEF7MINI';
    else if (boardIdUpper.includes('F7')) targetBoard = 'SPEEDYBEEF7';
    else if (boardIdUpper.includes('F405V4')) targetBoard = 'SPEEDYBEEF405V4';
    else if (boardIdUpper.includes('F405V3')) targetBoard = 'SPEEDYBEEF405V3';
    else if (boardIdUpper.includes('F405WING')) targetBoard = 'SPEEDYBEEF405WING';
    else targetBoard = 'SPEEDYBEEF405';
  } else if (boardIdUpper.includes('MATEK')) {
    if (boardIdUpper.includes('H743')) targetBoard = 'MATEKH743';
    else if (boardIdUpper.includes('F722SE')) targetBoard = 'MATEKF722SE';
    else if (boardIdUpper.includes('F722')) targetBoard = 'MATEKF722';
    else if (boardIdUpper.includes('F411')) targetBoard = 'MATEKF411';
    else if (boardIdUpper.includes('F405SE')) targetBoard = 'MATEKF405SE';
    else if (boardIdUpper.includes('F405TE')) targetBoard = 'MATEKF405TE';
    else targetBoard = 'MATEKF405';
  } else if (boardIdUpper.includes('KAKUTE')) {
    if (boardIdUpper.includes('H7V2')) targetBoard = 'KAKUTEH7V2';
    else if (boardIdUpper.includes('H7MINI')) targetBoard = 'KAKUTEH7MINI';
    else if (boardIdUpper.includes('H7')) targetBoard = 'KAKUTEH7';
    else if (boardIdUpper.includes('F7MINI')) targetBoard = 'KAKUTEF7MINI';
    else if (boardIdUpper.includes('F7')) targetBoard = 'KAKUTEF7';
    else if (boardIdUpper.includes('F4V2')) targetBoard = 'KAKUTEF4V2';
    else targetBoard = 'KAKUTEF4';
  } else if (boardIdUpper.includes('MAMBA')) {
    if (boardIdUpper.includes('H743')) targetBoard = 'MAMBAH743';
    else if (boardIdUpper.includes('F722S')) targetBoard = 'MAMBAF722S';
    else if (boardIdUpper.includes('F722')) targetBoard = 'MAMBAF722';
    else if (boardIdUpper.includes('F405MK2')) targetBoard = 'MAMBAF405MK2';
    else if (boardIdUpper.includes('F405US')) targetBoard = 'MAMBAF405US';
    else targetBoard = 'MAMBAF405';
  } else if (boardIdUpper.includes('OMNIBUS')) {
    if (boardIdUpper.includes('F7')) targetBoard = 'OMNIBUSF7';
    else if (boardIdUpper.includes('F4SD')) targetBoard = 'OMNIBUSF4SD';
    else if (boardIdUpper.includes('F4V6')) targetBoard = 'OMNIBUSF4V6';
    else targetBoard = 'OMNIBUSF4';
  } else if (boardIdUpper.includes('IFLIGHT') || boardIdUpper.includes('BLITZ') || boardIdUpper.includes('SUCCEX')) {
    if (boardIdUpper.includes('BLITZF7')) targetBoard = 'IFLIGHT_BLITZ_F7_AIO';
    else if (boardIdUpper.includes('BLITZF722')) targetBoard = 'IFLIGHT_BLITZ_F722';
    else if (boardIdUpper.includes('SUCCEXEF7')) targetBoard = 'IFLIGHT_SUCCEX_E_F7';
    else if (boardIdUpper.includes('SUCCEXEF4')) targetBoard = 'IFLIGHT_SUCCEX_E_F4';
    else targetBoard = 'IFLIGHT_F405_AIO';
  } else if (boardIdUpper.includes('FLYWOO')) {
    if (boardIdUpper.includes('H743')) targetBoard = 'FLYWOOH743';
    else if (boardIdUpper.includes('F745NANO')) targetBoard = 'FLYWOOF745NANO';
    else if (boardIdUpper.includes('F745')) targetBoard = 'FLYWOOF745';
    else if (boardIdUpper.includes('F405HD')) targetBoard = 'FLYWOOF405HD';
    else targetBoard = 'FLYWOOF405';
  }

  // Betaflight 4.x uses Unified Targets - firmware files are by MCU, not board
  // Map board to MCU type for download URL
  let mcuTarget = 'STM32F405'; // Default
  if (targetBoard.includes('H7')) mcuTarget = 'STM32H743';
  else if (targetBoard.includes('G4')) mcuTarget = 'STM32G47x';
  else if (targetBoard.includes('F7')) mcuTarget = 'STM32F7X2';
  else if (targetBoard.includes('F411')) mcuTarget = 'STM32F411';
  else if (targetBoard.includes('F405') || targetBoard.includes('F4')) mcuTarget = 'STM32F405';

  // Betaflight 4.x tags don't have 'v' prefix
  return [
    {
      version: '4.5.1',
      releaseType: 'stable',
      releaseDate: '2024-06-01',
      downloadUrl: `${baseUrl}/4.5.1/betaflight_4.5.1_${mcuTarget}.hex`,
      boardId: targetBoard,
      vehicleType: 'Copter',
      releaseNotes: `Unified target for ${mcuTarget}`,
    },
    {
      version: '4.4.3',
      releaseType: 'stable',
      releaseDate: '2024-01-15',
      downloadUrl: `${baseUrl}/4.4.3/betaflight_4.4.3_${mcuTarget}.hex`,
      boardId: targetBoard,
      vehicleType: 'Copter',
    },
    {
      version: '4.3.2',
      releaseType: 'stable',
      releaseDate: '2023-06-01',
      downloadUrl: `${baseUrl}/4.3.2/betaflight_4.3.2_${mcuTarget}.hex`,
      boardId: targetBoard,
      vehicleType: 'Copter',
    },
  ];
}

/**
 * Curated iNav firmware versions
 */
function getInavCuratedVersions(vehicleType: FirmwareVehicleType, boardId: string): FirmwareVersion[] {
  let targetBoard = 'SPEEDYBEEF405V3';
  const boardIdUpper = boardId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const baseUrl = 'https://github.com/iNavFlight/inav/releases/download';

  // Check if this is one of the F3 boards that iNav supports
  // SPRacing F3 boards: last supported in iNav 2.0.0 (dropped in 2.1.0)
  // FrSky/Airhero F3 boards: last supported in iNav 2.6.1
  const isSPRacingF3 = boardIdUpper.includes('SPRACINGF3') ||
                       (boardIdUpper.includes('SPRACING') && boardIdUpper.includes('F3'));

  if (isSPRacingF3) {
    // Map to correct SPRacing F3 target name
    let f3Target = 'SPRACINGF3';
    if (boardIdUpper.includes('EVO')) {
      f3Target = 'SPRACINGF3EVO';
    } else if (boardIdUpper.includes('MINI')) {
      f3Target = 'SPRACINGF3MINI';
    } else if (boardIdUpper.includes('NEO')) {
      f3Target = 'SPRACINGF3NEO';
    }

    // Return iNav 2.0.0 - last version with SPRacing F3 support
    return [
      {
        version: '2.0.0',
        releaseType: 'stable',
        releaseDate: '2018-08-20',
        releaseNotes: 'Last iNav version supporting SPRacing F3 boards',
        downloadUrl: `${baseUrl}/2.0.0/inav_2.0.0_${f3Target}.hex`,
        boardId: f3Target,
        vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
        fileSize: hexToBinarySize(628000), // ~273KB binary
      },
    ];
  }

  // FrSky/Airhero F3 boards: supported until iNav 2.6.1
  const inavF3Targets = ['FRSKYF3', 'AIRHEROF3', 'AIRHEROF3_QUAD'];
  const isInavF3Board = inavF3Targets.includes(boardIdUpper) ||
                        boardIdUpper.includes('AIRHERO') ||
                        (boardIdUpper.includes('FRSKY') && boardIdUpper.includes('F3'));

  if (isInavF3Board) {
    // Map to correct iNav F3 target name
    let f3Target = boardIdUpper;
    if (boardIdUpper.includes('AIRHERO')) {
      f3Target = boardIdUpper.includes('QUAD') ? 'AIRHEROF3_QUAD' : 'AIRHEROF3';
    } else if (boardIdUpper.includes('FRSKY')) {
      f3Target = 'FRSKYF3';
    }

    // Return legacy iNav versions for F3 boards
    return [
      {
        version: '2.6.1',
        releaseType: 'stable',
        releaseDate: '2020-12-27',
        releaseNotes: 'Last version supporting FrSky/Airhero F3 boards',
        downloadUrl: `${baseUrl}/2.6.1/inav_2.6.1_${f3Target}.hex`,
        boardId: f3Target,
        vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
        fileSize: hexToBinarySize(715000), // ~311KB binary
      },
      {
        version: '2.5.2',
        releaseType: 'stable',
        releaseDate: '2020-06-20',
        downloadUrl: `${baseUrl}/2.5.2/inav_2.5.2_${f3Target}.hex`,
        boardId: f3Target,
        vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
        fileSize: hexToBinarySize(700000), // ~304KB binary
      },
    ];
  }

  // Modern boards (F4/F7/H7)
  if (boardIdUpper.includes('SPEEDYBEE')) {
    targetBoard = 'SPEEDYBEEF405V3';
  } else if (boardIdUpper.includes('MATEK')) {
    targetBoard = boardIdUpper.includes('H7') ? 'MATEKH743' : 'MATEKF405SE';
  }

  return [
    {
      version: '7.1.2',
      releaseType: 'stable',
      releaseDate: '2024-03-15',
      downloadUrl: `${baseUrl}/7.1.2/inav_7.1.2_${targetBoard}.hex`,
      boardId: targetBoard,
      vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
      fileSize: hexToBinarySize(1200000), // ~522KB binary
    },
    {
      version: '7.0.1',
      releaseType: 'stable',
      releaseDate: '2023-12-01',
      downloadUrl: `${baseUrl}/7.0.1/inav_7.0.1_${targetBoard}.hex`,
      boardId: targetBoard,
      vehicleType: vehicleType === 'plane' ? 'Plane' : 'Copter',
      fileSize: hexToBinarySize(1170000), // ~509KB binary
    },
  ];
}

/**
 * Clear manifest cache (ArduPilot, Betaflight, iNav)
 */
export function clearManifestCache(): void {
  manifestCache = null;
  bfTargetsCache = null;
  bfVersionsCache.clear();
  inavReleasesCache = null;
}
