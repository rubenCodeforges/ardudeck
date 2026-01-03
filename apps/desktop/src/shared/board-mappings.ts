/**
 * Mapping between Betaflight board targets and iNav board targets
 * Many boards are supported by both firmwares with same or similar names
 *
 * IMPORTANT: F3 boards (256KB flash) are NOT supported by modern iNav (7.x) or Betaflight (4.x)
 * Users with F3 boards need to upgrade to F4/F7/H7 hardware for mission planning
 */

// F3 boards that have NO iNav support at all
// Note: SPRacing F3, FrSky F3, Airhero F3 ARE supported by legacy iNav - not in this list
export const UNSUPPORTED_F3_BOARDS = [
  // Full board names - these have ZERO iNav support
  'SPEEDYBEEF3', 'SPEEDYBEEF3V2', 'SPEEDYBEEF3MINI',
  'OMNIBUSF3', 'LUXF3OSD', 'RCEXPLORERF3', 'AIRBOTF3',
  'BETAFLIGHTF3', 'CHEBUZZF3', 'COLIBRI_RACE', 'CRAZYBEEF3DR',
  'CRAZYBEEF3DX', 'CRAZYBEEF3FS', 'CRAZYBEEF3FR', 'DOGE', 'ELLE0',
  'EUSTM32F3', 'FURYF3', 'IMPULSERCF3', 'IRCFUSIONF3',
  'IRCSYNERGYF3', 'ISHAPEDF3', 'KISSFC', 'LUMBAF3', 'LUXV2_RACE',
  'MIDELICF3', 'MOTOLAB', 'MULTIFLITEPICO', 'NAZE', 'NUCLEOF303RE',
  'OMNIBUS', 'PIKOBLX', 'RACEWHOOP', 'RCEXPLORER', 'REVO', 'RMDO',
  'SINGULARITY', 'SIRINFPV', 'SKYZONEF330',
  'STM32F3DISCOVERY', 'TINYBEEF3', 'TINYFISH', 'X_RACERSPI',
  'ZCOREF3',
  // 4-char MSP board IDs (what the flight controller actually reports)
  'SBF3',                    // SpeedyBee F3 - no iNav
  'OBF3', 'OMF3',            // Omnibus F3 - no iNav
  'KIF3',                    // KISS F3 - no iNav
  'LUF3',                    // Lumenier F3 - no iNav
];

// F3 boards that ARE supported by legacy iNav
// FrSky/Airhero: iNav 2.6.1 (latest F3 support)
// SPRacing F3: iNav 2.0.0 (dropped in 2.1.0)
const INAV_SUPPORTED_F3_BOARDS = [
  'FRSKYF3', 'FRF3',
  'AIRHEROF3', 'AIRHEROF3_QUAD',
  'SPRACINGF3', 'SPRACINGF3EVO', 'SPRACINGF3MINI', 'SPRACINGF3NEO', 'SRF3',
];

/**
 * Check if a board is an unsupported F3 board (no modern firmware support)
 */
export function isUnsupportedF3Board(boardId: string): boolean {
  const upper = boardId.toUpperCase();
  // Check explicit list
  if (UNSUPPORTED_F3_BOARDS.includes(upper)) return true;
  // Check if name contains F3 (but not F3x5 which is F4/F7 typo)
  if (upper.includes('F3') && !upper.includes('F35') && !upper.includes('F30')) return true;
  return false;
}

/**
 * Check if an F3 board has legacy iNav support (2.6.1)
 * Only FrSky F3 and Airhero F3 were supported
 */
export function hasInavF3Support(boardId: string): boolean {
  const upper = boardId.toUpperCase();
  return INAV_SUPPORTED_F3_BOARDS.some(b => upper.includes(b) || upper === b);
}

// Betaflight target -> iNav target (or array of possible matches)
export const BETAFLIGHT_TO_INAV: Record<string, string | string[]> = {
  // Matek boards (most are identical)
  'MATEKF405': 'MATEKF405',
  'MATEKF405SE': 'MATEKF405SE',
  'MATEKF405STD': 'MATEKF405',
  'MATEKF411': 'MATEKF411',
  'MATEKF411SE': 'MATEKF411',
  'MATEKF722': 'MATEKF722',
  'MATEKF722SE': 'MATEKF722SE',
  'MATEKF722STD': 'MATEKF722',
  'MATEKH743': 'MATEKH743',
  'MATEKF765': 'MATEKF765',
  'MATEKF405WING': 'MATEKF405SE', // Wing variant maps to SE
  'MATEKF405TE': 'MATEKF405TE',
  'MATEKF765WING': 'MATEKF765',

  // Holybro Kakute boards
  'KAKUTEF4': 'KAKUTEF4',
  'KAKUTEF4V2': 'KAKUTEF4V2',
  'KAKUTEF7': 'KAKUTEF7',
  'KAKUTEF7MINI': 'KAKUTEF7MINIV3',
  'KAKUTEF7V2': 'KAKUTEF7',
  'KAKUTEH7': 'KAKUTEH7',
  'KAKUTEH7V2': 'KAKUTEH7V2',
  'KAKUTEH7MINI': 'KAKUTEH7MINI',

  // SpeedyBee boards
  'SPEEDYBEEF4': 'SPEEDYBEEF4',
  'SPEEDYBEEF405V3': 'SPEEDYBEEF405V3',
  'SPEEDYBEEF405V4': 'SPEEDYBEEF405V4',
  'SPEEDYBEEF405WING': 'SPEEDYBEEF405WING',
  'SPEEDYBEEF7': 'SPEEDYBEEF7',
  'SPEEDYBEEF7V2': 'SPEEDYBEEF7V2',
  'SPEEDYBEEF7V3': 'SPEEDYBEEF7V3',
  'SPEEDYBEEF405MINI': 'SPEEDYBEEF405MINI',
  'SPEEDYBEEF745AIO': 'SPEEDYBEEF745AIO',

  // SP Racing boards
  'SPRACINGF3': 'SPRACINGF3',
  'SPRACINGF3EVO': 'SPRACINGF3EVO',
  'SPRACINGF3MINI': 'SPRACINGF3MINI',
  'SPRACINGF4EVO': 'SPRACINGF4EVO',
  'SPRACINGF4NEO': 'SPRACINGF4NEO',
  'SPRACINGF7DUAL': 'SPRACINGF7DUAL',
  'SPRACINGH7': ['SPRACINGH7EXTREME', 'SPRACINGH7'],
  'SPRACINGH7EXTREME': 'SPRACINGH7EXTREME',
  'SPRACINGH7NANO': 'SPRACINGH7NANO',
  'SPRACINGH7RF': 'SPRACINGH7RF',

  // Omnibus boards
  'OMNIBUS': 'OMNIBUSF4',
  'OMNIBUSF4': 'OMNIBUSF4',
  'OMNIBUSF4SD': 'OMNIBUSF4',
  'OMNIBUSF4V3': 'OMNIBUSF4V3',
  'OMNIBUSF7': 'OMNIBUSF7',
  'OMNIBUSF7V2': 'OMNIBUSF7V2',
  'OMNIBUSF7NANOV7': 'OMNIBUSF7NANOV7',

  // Diatone Mamba boards
  'MAMBAF405US': 'MAMBAF405',
  'MAMBAF405': 'MAMBAF405',
  'MAMBAF722': 'MAMBAF722',
  'MAMBAF405_2022A': 'MAMBAF405_2022A',
  'MAMBAF405_2022B': 'MAMBAF405_2022B',
  'MAMBAH743': 'MAMBAH743',

  // iFlight boards
  'IFLIGHT_SUCCEX_E_F4': 'IFLIGHT_SUCCEX_E_F4',
  'IFLIGHT_F405_AIO': 'IFLIGHT_F405_AIO',
  'IFLIGHT_F745_AIO': 'IFLIGHT_F745_AIO',
  'IFLIGHT_BLITZ_F7_AIO': 'IFLIGHT_BLITZ_F7_AIO',

  // Foxeer boards
  'FOXEERF405': 'FOXEERF405',
  'FOXEERF722DUAL': 'FOXEERF722DUAL',
  'FOXEERF745AIO': 'FOXEERF745AIO',
  'FOXEERH743': 'FOXEERH743',

  // JHEMCU boards
  'JHEMCUF405': 'JHEMCUF405',
  'JHEMCUF745': 'JHEMCUF745',
  'JHEMCUH743HD': 'JHEMCUH743HD',

  // Flywoo boards
  'FLYWOOF405': 'FLYWOOF405',
  'FLYWOOF411': 'FLYWOOF411',
  'FLYWOOF745': 'FLYWOOF745',
  'FLYWOOF745NANO': 'FLYWOOF745NANO',
  'FLYWOOH743': 'FLYWOOH743',

  // BetaFPV boards (limited iNav support)
  'BETAFPVF405': 'BETAFPVF405',
  'BETAFPVF722': 'BETAFPVF722',

  // Aikon boards
  'AIKONF4': 'AIKONF4',
  'AIKONF7': 'AIKONF7',

  // Generic F4/F7/H7 fallbacks (try to match by MCU type)
  'STM32F405': 'GENERIC_F4',
  'STM32F411': 'GENERIC_F411',
  'STM32F722': 'GENERIC_F7',
  'STM32F745': 'GENERIC_F7',
  'STM32H743': 'GENERIC_H7',
};

/**
 * Get iNav board target(s) for a Betaflight board
 * Returns array of possible matches (most likely first)
 */
export function getInavBoardsForBetaflight(betaflightBoard: string): string[] {
  const upper = betaflightBoard.toUpperCase();
  const mapping = BETAFLIGHT_TO_INAV[upper];

  if (!mapping) {
    // No direct mapping - return the original as a guess (many boards have same name)
    return [upper];
  }

  return Array.isArray(mapping) ? mapping : [mapping];
}

/**
 * Find best matching board from available boards list
 */
export function findMatchingInavBoard(
  betaflightBoard: string,
  availableBoards: Array<{ id: string; name: string }>
): { id: string; name: string } | null {
  const candidates = getInavBoardsForBetaflight(betaflightBoard);

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();

    // Try exact match first
    const exactMatch = availableBoards.find(
      b => b.id.toLowerCase() === candidateLower || b.name.toLowerCase() === candidateLower
    );
    if (exactMatch) return exactMatch;

    // Try partial match (board name contains candidate)
    const partialMatch = availableBoards.find(
      b => b.id.toLowerCase().includes(candidateLower) ||
           b.name.toLowerCase().includes(candidateLower) ||
           candidateLower.includes(b.id.toLowerCase())
    );
    if (partialMatch) return partialMatch;
  }

  // Last resort: try matching the original board name directly
  const originalLower = betaflightBoard.toLowerCase();
  const directMatch = availableBoards.find(
    b => b.id.toLowerCase().includes(originalLower) ||
         b.name.toLowerCase().includes(originalLower) ||
         originalLower.includes(b.id.toLowerCase())
  );

  return directMatch || null;
}
