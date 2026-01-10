/**
 * ArduPilot Board Type IDs
 * Extracted from: https://github.com/ArduPilot/ardupilot/blob/master/Tools/AP_Bootloader/board_types.txt
 *
 * The board_version field in AUTOPILOT_VERSION message contains this ID in the first 16 bits.
 */

export interface BoardTypeInfo {
  name: string;           // ArduPilot board name (matches manifest)
  displayName: string;    // Human-friendly name
  manufacturer?: string;  // Board manufacturer
}

/**
 * Board ID to board info mapping
 * Used to identify boards from MAVLink AUTOPILOT_VERSION boardVersion field
 */
export const BOARD_TYPE_IDS: Record<number, BoardTypeInfo> = {
  // PX4/Pixhawk Series
  9: { name: 'fmuv3', displayName: 'Pixhawk 2.4.8 / Pixhawk 1', manufacturer: '3DR' },
  11: { name: 'Pixhawk4', displayName: 'Pixhawk 4', manufacturer: 'Holybro' },
  13: { name: 'Pixhawk4-Pro', displayName: 'Pixhawk 4 Pro', manufacturer: 'Holybro' },
  50: { name: 'Pixhawk5', displayName: 'Pixhawk 5', manufacturer: 'Holybro' },
  52: { name: 'Pixhawk6', displayName: 'Pixhawk 6', manufacturer: 'Holybro' },
  53: { name: 'Pixhawk6X', displayName: 'Pixhawk 6X', manufacturer: 'Holybro' },
  56: { name: 'Pixhawk6C', displayName: 'Pixhawk 6C', manufacturer: 'Holybro' },

  // Cube Series
  120: { name: 'CubeYellow', displayName: 'Cube Yellow', manufacturer: 'Hex/ProfiCNC' },
  140: { name: 'CubeOrange', displayName: 'Cube Orange', manufacturer: 'Hex/ProfiCNC' },
  1063: { name: 'CubeOrangePlus', displayName: 'Cube Orange+', manufacturer: 'Hex/ProfiCNC' },
  1003: { name: 'CubeBlack+', displayName: 'Cube Black+', manufacturer: 'Hex/ProfiCNC' },
  1033: { name: 'CubeOrange-joey', displayName: 'Cube Orange Joey', manufacturer: 'Hex/ProfiCNC' },

  // Matek
  125: { name: 'MatekF405', displayName: 'Matek F405', manufacturer: 'Matek' },
  127: { name: 'MatekF405-Wing', displayName: 'Matek F405-Wing', manufacturer: 'Matek' },
  143: { name: 'MatekF765-Wing', displayName: 'Matek F765-Wing', manufacturer: 'Matek' },
  1013: { name: 'MatekH743', displayName: 'Matek H743', manufacturer: 'Matek' },
  1054: { name: 'MatekF405-TE', displayName: 'Matek F405 TE', manufacturer: 'Matek' },
  1149: { name: 'MatekH7A3', displayName: 'Matek H7A3', manufacturer: 'Matek' },
  5501: { name: 'MatekH743SE', displayName: 'Matek H743 SE', manufacturer: 'Matek' },

  // Holybro Kakute
  122: { name: 'KakuteF4', displayName: 'Kakute F4', manufacturer: 'Holybro' },
  123: { name: 'KakuteF7', displayName: 'Kakute F7', manufacturer: 'Holybro' },
  145: { name: 'KakuteF7Mini', displayName: 'Kakute F7 Mini', manufacturer: 'Holybro' },
  1048: { name: 'KakuteH7', displayName: 'Kakute H7', manufacturer: 'Holybro' },
  1058: { name: 'KakuteH7Mini', displayName: 'Kakute H7 Mini', manufacturer: 'Holybro' },
  1105: { name: 'KakuteH7-Wing', displayName: 'Kakute H7 Wing', manufacturer: 'Holybro' },
  1030: { name: 'KakuteF4-Mini', displayName: 'Kakute F4 Mini', manufacturer: 'Holybro' },
  5406: { name: 'KakuteF4-Wing', displayName: 'Kakute F4 Wing', manufacturer: 'Holybro' },

  // SpeedyBee
  134: { name: 'SpeedyBeeF4', displayName: 'SpeedyBee F4', manufacturer: 'SpeedyBee' },
  1082: { name: 'SpeedyBeeF4V3', displayName: 'SpeedyBee F4 V3', manufacturer: 'SpeedyBee' },
  1106: { name: 'SpeedyBeeF405Wing', displayName: 'SpeedyBee F405 Wing', manufacturer: 'SpeedyBee' },
  1135: { name: 'SpeedyBeeF4Mini', displayName: 'SpeedyBee F4 Mini', manufacturer: 'SpeedyBee' },
  1136: { name: 'SpeedyBeeF4V4', displayName: 'SpeedyBee F4 V4', manufacturer: 'SpeedyBee' },
  5270: { name: 'SpeedyBeeF405WINGV2', displayName: 'SpeedyBee F405 Wing V2', manufacturer: 'SpeedyBee' },
  5271: { name: 'SpeedyBeeF405AIO', displayName: 'SpeedyBee F405 AIO', manufacturer: 'SpeedyBee' },

  // mRo
  136: { name: 'mRoX21', displayName: 'mRo X2.1', manufacturer: 'mRo' },
  141: { name: 'mRoControlZero', displayName: 'mRo Control Zero', manufacturer: 'mRo' },
  1017: { name: 'mRoPixracerPro', displayName: 'mRo Pixracer Pro', manufacturer: 'mRo' },
  1015: { name: 'mRoNexus', displayName: 'mRo Nexus', manufacturer: 'mRo' },
  1023: { name: 'mRoControlZeroH7', displayName: 'mRo Control Zero H7', manufacturer: 'mRo' },
  1101: { name: 'mRoControlOne', displayName: 'mRo Control One', manufacturer: 'mRo' },

  // CUAV
  1009: { name: 'CUAV-Nora', displayName: 'CUAV Nora', manufacturer: 'CUAV' },
  1010: { name: 'CUAV-X7Pro', displayName: 'CUAV X7 Pro', manufacturer: 'CUAV' },
  7000: { name: 'CUAV-7-Nano', displayName: 'CUAV 7 Nano', manufacturer: 'CUAV' },
  7001: { name: 'CUAV-V6X-V2', displayName: 'CUAV V6X V2', manufacturer: 'CUAV' },

  // Omnibus
  42: { name: 'OmnibusF4SD', displayName: 'Omnibus F4 SD', manufacturer: 'Airbot' },
  131: { name: 'OmnibusF4Pro', displayName: 'Omnibus F4 Pro', manufacturer: 'Airbot' },
  121: { name: 'OmnibusF7V2', displayName: 'Omnibus F7 V2', manufacturer: 'Airbot' },
  1002: { name: 'OmnibusF4', displayName: 'Omnibus F4', manufacturer: 'Airbot' },
  133: { name: 'OmnibusNanoV6', displayName: 'Omnibus Nano V6', manufacturer: 'Airbot' },

  // Flywoo
  1027: { name: 'FlywooF745', displayName: 'Flywoo F745', manufacturer: 'Flywoo' },
  1042: { name: 'FlywooF745Nano', displayName: 'Flywoo F745 Nano', manufacturer: 'Flywoo' },
  1099: { name: 'FlywooF405S-AIO', displayName: 'Flywoo F405S AIO', manufacturer: 'Flywoo' },
  1137: { name: 'FlywooF405Pro', displayName: 'Flywoo F405 Pro', manufacturer: 'Flywoo' },
  1180: { name: 'FlywooF405HD-AIOv2', displayName: 'Flywoo F405HD AIO V2', manufacturer: 'Flywoo' },
  1181: { name: 'FlywooH743Pro', displayName: 'Flywoo H743 Pro', manufacturer: 'Flywoo' },

  // iFlight
  1025: { name: 'BeastH7', displayName: 'iFlight Beast H7', manufacturer: 'iFlight' },
  1026: { name: 'BeastF7', displayName: 'iFlight Beast F7', manufacturer: 'iFlight' },
  1056: { name: 'BeastH7v2', displayName: 'iFlight Beast H7 V2', manufacturer: 'iFlight' },
  1057: { name: 'BeastF7v2', displayName: 'iFlight Beast F7 V2', manufacturer: 'iFlight' },

  // Durandal
  139: { name: 'Durandal', displayName: 'Durandal', manufacturer: 'Holybro' },

  // SPRacing
  1060: { name: 'SPRacingH7', displayName: 'SPRacing H7 Extreme', manufacturer: 'SPRacing' },
  1108: { name: 'SPRacingH7RF', displayName: 'SPRacing H7 RF', manufacturer: 'SPRacing' },

  // Mamba
  1019: { name: 'MambaF405', displayName: 'Mamba F405', manufacturer: 'Diatone' },
  1038: { name: 'MambaBasicF4', displayName: 'Mamba Basic F4', manufacturer: 'Diatone' },
  1073: { name: 'MambaH743-v4', displayName: 'Mamba H743 V4', manufacturer: 'Diatone' },

  // JHEMCU
  1059: { name: 'JHEMCU-GSF405A', displayName: 'JHEMCU GSF405A', manufacturer: 'JHEMCU' },
  1081: { name: 'JHEMCU-GF16F405', displayName: 'JHEMCU GF16 F405', manufacturer: 'JHEMCU' },
  1169: { name: 'JHEMCU-F405WING', displayName: 'JHEMCU F405 Wing', manufacturer: 'JHEMCU' },
  1411: { name: 'JHEMCU-H743HD', displayName: 'JHEMCU H743 HD', manufacturer: 'JHEMCU' },
  1412: { name: 'JHEMCU-F405PRO', displayName: 'JHEMCU F405 Pro', manufacturer: 'JHEMCU' },

  // BetaFPV
  1125: { name: 'BetaFPV-F405', displayName: 'BetaFPV F405', manufacturer: 'BetaFPV' },
  1175: { name: 'BetaFPV-F4-2-3S', displayName: 'BetaFPV F4 2-3S 20A', manufacturer: 'BetaFPV' },

  // Foxeer
  1089: { name: 'FoxeerH743', displayName: 'Foxeer H743', manufacturer: 'Foxeer' },
  1157: { name: 'FoxeerF405-V2', displayName: 'Foxeer F405 V2', manufacturer: 'Foxeer' },

  // QioTek
  1021: { name: 'QioTekZealotF427', displayName: 'QioTek Zealot F427', manufacturer: 'QioTek' },
  1036: { name: 'QioTekZealotH743', displayName: 'QioTek Zealot H743', manufacturer: 'QioTek' },
  1065: { name: 'QioTekAdeptF407', displayName: 'QioTek Adept F407', manufacturer: 'QioTek' },
  1126: { name: 'QioTekAdeptH743', displayName: 'QioTek Adept H743', manufacturer: 'QioTek' },

  // AtomRC
  1078: { name: 'AtomRCF405', displayName: 'AtomRC F405', manufacturer: 'AtomRC' },
  1143: { name: 'AtomRCF405Navi-DLX', displayName: 'AtomRC F405 Navi DLX', manufacturer: 'AtomRC' },

  // TMotor
  1138: { name: 'TMotorH7', displayName: 'T-Motor H7', manufacturer: 'T-Motor' },
  1192: { name: 'TMotorPacerH743', displayName: 'T-Motor Pacer H743', manufacturer: 'T-Motor' },

  // SkyStar
  1045: { name: 'SkystarsF405DJI', displayName: 'Skystars F405 DJI', manufacturer: 'Skystars' },
  1075: { name: 'SkystarsH7HD', displayName: 'Skystars H7 HD', manufacturer: 'Skystars' },
  1201: { name: 'SkystarsF405V2', displayName: 'Skystars F405 V2', manufacturer: 'Skystars' },

  // Blitz
  1117: { name: 'BlitzF7AIO', displayName: 'iFlight Blitz F7 AIO', manufacturer: 'iFlight' },
  1162: { name: 'BlitzH7Pro', displayName: 'iFlight Blitz H7 Pro', manufacturer: 'iFlight' },
  1163: { name: 'BlitzF7Mini', displayName: 'iFlight Blitz F7 Mini', manufacturer: 'iFlight' },
  1164: { name: 'BlitzF7', displayName: 'iFlight Blitz F7', manufacturer: 'iFlight' },
  1168: { name: 'BlitzH7Wing', displayName: 'iFlight Blitz H7 Wing', manufacturer: 'iFlight' },

  // MicoAir
  1139: { name: 'MicoAir405', displayName: 'MicoAir 405', manufacturer: 'MicoAir' },
  1150: { name: 'MicoAir405v2', displayName: 'MicoAir 405 V2', manufacturer: 'MicoAir' },
  1161: { name: 'MicoAir405Mini', displayName: 'MicoAir 405 Mini', manufacturer: 'MicoAir' },
  1166: { name: 'MicoAir743', displayName: 'MicoAir 743', manufacturer: 'MicoAir' },
  1176: { name: 'MicoAir743-AIO', displayName: 'MicoAir 743 AIO', manufacturer: 'MicoAir' },
  1179: { name: 'MicoAir743v2', displayName: 'MicoAir 743 V2', manufacturer: 'MicoAir' },
  1202: { name: 'MicoAir743-Lite', displayName: 'MicoAir 743 Lite', manufacturer: 'MicoAir' },

  // GEPRC
  1501: { name: 'GEPRCF745BTHD', displayName: 'GEPRC F745 BT HD', manufacturer: 'GEPRC' },
  1502: { name: 'GEPRC-Taker-H743', displayName: 'GEPRC Taker H743', manufacturer: 'GEPRC' },

  // HAKRC
  4200: { name: 'HAKRC-F405', displayName: 'HAKRC F405', manufacturer: 'HAKRC' },
  4201: { name: 'HAKRC-F405Wing', displayName: 'HAKRC F405 Wing', manufacturer: 'HAKRC' },

  // Revolution/Airbot
  124: { name: 'revo-mini', displayName: 'Revolution Mini', manufacturer: 'Airbot' },
  128: { name: 'AirbotF4', displayName: 'Airbot F4', manufacturer: 'Airbot' },

  // RadioLink
  1410: { name: 'RadiolinkPIX6', displayName: 'RadioLink PIX6', manufacturer: 'RadioLink' },
  1417: { name: 'RadiolinkF405', displayName: 'RadioLink F405', manufacturer: 'RadioLink' },

  // HeeWing
  1119: { name: 'HeeWing-F405', displayName: 'HeeWing F405', manufacturer: 'HeeWing' },
};

/**
 * Get board info from board version ID
 * The board_version from AUTOPILOT_VERSION has the type in upper 16 bits
 */
export function getBoardInfoFromVersion(boardVersion: number): BoardTypeInfo | null {
  // Board type is in upper 16 bits
  const boardTypeId = (boardVersion >> 16) & 0xFFFF;

  // Try with extracted ID first
  if (BOARD_TYPE_IDS[boardTypeId]) {
    return BOARD_TYPE_IDS[boardTypeId];
  }

  // Also try with full value (some boards use full 32-bit)
  if (BOARD_TYPE_IDS[boardVersion]) {
    return BOARD_TYPE_IDS[boardVersion];
  }

  return null;
}

/**
 * Find board in our database that matches the ArduPilot board name
 */
export function findMatchingBoardId(boardName: string): string | null {
  // Normalize for comparison
  const normalized = boardName.toLowerCase().replace(/[-_\s]/g, '');

  for (const [id, info] of Object.entries(BOARD_TYPE_IDS)) {
    const infoNormalized = info.name.toLowerCase().replace(/[-_\s]/g, '');
    if (infoNormalized === normalized || infoNormalized.includes(normalized) || normalized.includes(infoNormalized)) {
      return info.name;
    }
  }

  return null;
}
