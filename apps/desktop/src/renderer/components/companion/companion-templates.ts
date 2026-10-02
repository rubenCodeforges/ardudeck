/**
 * Companion board templates — pre-configured firmware/software for popular boards.
 * Each template includes board info, use case, flash method, and setup instructions.
 */

export type BoardFamily = 'esp32' | 'raspberry-pi' | 'jetson' | 'orange-pi';
export type FlashMethod = 'serial' | 'image' | 'script';

export interface CompanionTemplate {
  id: string;
  nameKey: string;
  descriptionKey: string;
  board: BoardFamily;
  boardVariants: string[]; // e.g. ['ESP32', 'ESP32-S3', 'ESP32-C3']
  category: string;
  flashMethod: FlashMethod;
  firmwareUrl?: string; // URL to download firmware binary
  installCommand?: string; // One-liner install script
  imageUrl?: string; // URL to download SD card image
  featureKeys: string[];
  requirementKeys: string[];
  projectUrl?: string; // Link to upstream project
  projectName?: string; // Name of upstream project
}

// ── Board family metadata ──────────────────────────────────────

export const BOARD_FAMILIES: Record<BoardFamily, {
  name: string;
  descriptionKey: string;
  icon: string; // SVG path for the board icon
}> = {
  'esp32': {
    name: 'ESP32',
    descriptionKey: 'companion:boards.esp32.description',
    icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  },
  'raspberry-pi': {
    name: 'Raspberry Pi', // i18n-exempt: brand
    descriptionKey: 'companion:boards.raspberryPi.description',
    icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  },
  'jetson': {
    name: 'NVIDIA Jetson',
    descriptionKey: 'companion:boards.jetson.description',
    icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  },
  'orange-pi': {
    name: 'Orange Pi', // i18n-exempt: brand
    descriptionKey: 'companion:boards.orangePi.description',
    icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  },
};

// ── Category styling ───────────────────────────────────────────

/** Display key per category id (the id doubles as the CATEGORY_STYLE key). */
export const CATEGORY_LABEL_KEY: Record<string, string> = {
  Telemetry: 'companion:category.telemetry',
  Video: 'companion:category.video',
  Autonomy: 'companion:category.autonomy',
  'Full Stack': 'companion:category.fullStack', // i18n-exempt: id
  RTK: 'companion:category.rtk',
};

export const CATEGORY_STYLE: Record<string, { accent: string; bg: string; text: string; badge: string }> = {
  Telemetry: {
    accent: 'border-t-blue-500/70',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  Video: {
    accent: 'border-t-purple-500/70',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  },
  Autonomy: {
    accent: 'border-t-emerald-500/70',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  'Full Stack': { // i18n-exempt: id
    accent: 'border-t-amber-500/70',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  RTK: {
    accent: 'border-t-cyan-500/70',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
};

export const FALLBACK_STYLE = {
  accent: 'border-t-gray-500/70',
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  badge: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

// ── Templates ──────────────────────────────────────────────────

export const COMPANION_TEMPLATES: CompanionTemplate[] = [
  // ── ESP32 Templates ──────────────────────────────────────────
  {
    id: 'dronebridge-wifi',
    nameKey: 'companion:templates.dronebridgeWifi.name',
    descriptionKey: 'companion:templates.dronebridgeWifi.description',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'],
    category: 'Telemetry',
    flashMethod: 'serial',
    featureKeys: ['companion:templates.dronebridgeWifi.feature1', 'companion:templates.dronebridgeWifi.feature2', 'companion:templates.dronebridgeWifi.feature3', 'companion:templates.dronebridgeWifi.feature4', 'companion:templates.dronebridgeWifi.feature5'],
    requirementKeys: ['companion:templates.dronebridgeWifi.requirement1', 'companion:templates.dronebridgeWifi.requirement2', 'companion:templates.dronebridgeWifi.requirement3'],
    projectUrl: 'https://github.com/DroneBridge/ESP32',
    projectName: 'DroneBridge for ESP32',
  },
  {
    id: 'dronebridge-espnow',
    nameKey: 'companion:templates.dronebridgeEspnow.name',
    descriptionKey: 'companion:templates.dronebridgeEspnow.description',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3'],
    category: 'Telemetry',
    flashMethod: 'serial',
    featureKeys: ['companion:templates.dronebridgeEspnow.feature1', 'companion:templates.dronebridgeEspnow.feature2', 'companion:templates.dronebridgeEspnow.feature3', 'companion:templates.dronebridgeEspnow.feature4', 'companion:templates.dronebridgeEspnow.feature5'],
    requirementKeys: ['companion:templates.dronebridgeEspnow.requirement1', 'companion:templates.dronebridgeEspnow.requirement2', 'companion:templates.dronebridgeEspnow.requirement3'],
    projectUrl: 'https://github.com/DroneBridge/ESP32',
    projectName: 'DroneBridge for ESP32',
  },
  {
    id: 'esp32-mavlink-bridge',
    nameKey: 'companion:templates.esp32MavlinkBridge.name',
    descriptionKey: 'companion:templates.esp32MavlinkBridge.description',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S3', 'ESP32-C3'],
    category: 'Telemetry',
    flashMethod: 'serial',
    featureKeys: ['companion:templates.esp32MavlinkBridge.feature1', 'companion:templates.esp32MavlinkBridge.feature2', 'companion:templates.esp32MavlinkBridge.feature3', 'companion:templates.esp32MavlinkBridge.feature4'],
    requirementKeys: ['companion:templates.esp32MavlinkBridge.requirement1', 'companion:templates.esp32MavlinkBridge.requirement2', 'companion:templates.esp32MavlinkBridge.requirement3'],
    projectName: 'mavesp8266 (ESP32 fork)',
  },
  {
    id: 'esp32-xbee-ntrip',
    nameKey: 'companion:templates.esp32XbeeNtrip.name',
    descriptionKey: 'companion:templates.esp32XbeeNtrip.description',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S3'],
    category: 'RTK',
    flashMethod: 'serial',
    featureKeys: ['companion:templates.esp32XbeeNtrip.feature1', 'companion:templates.esp32XbeeNtrip.feature2', 'companion:templates.esp32XbeeNtrip.feature3', 'companion:templates.esp32XbeeNtrip.feature4', 'companion:templates.esp32XbeeNtrip.feature5'],
    requirementKeys: ['companion:templates.esp32XbeeNtrip.requirement1', 'companion:templates.esp32XbeeNtrip.requirement2', 'companion:templates.esp32XbeeNtrip.requirement3'],
    projectUrl: 'https://github.com/nebkat/esp32-xbee',
    projectName: 'ESP32 XBee',
  },

  // ── Raspberry Pi Templates ───────────────────────────────────
  {
    id: 'pi-telemetry-bridge',
    nameKey: 'companion:templates.piTelemetryBridge.name',
    descriptionKey: 'companion:templates.piTelemetryBridge.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Telemetry',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-telemetry.sh | bash',
    featureKeys: ['companion:templates.piTelemetryBridge.feature1', 'companion:templates.piTelemetryBridge.feature2', 'companion:templates.piTelemetryBridge.feature3', 'companion:templates.piTelemetryBridge.feature4', 'companion:templates.piTelemetryBridge.feature5'],
    requirementKeys: ['companion:templates.piTelemetryBridge.requirement1', 'companion:templates.piTelemetryBridge.requirement2', 'companion:templates.piTelemetryBridge.requirement3', 'companion:templates.piTelemetryBridge.requirement4'],
    projectName: 'mavlink-router + hostapd',
  },
  {
    id: 'pi-video-telemetry',
    nameKey: 'companion:templates.piVideoTelemetry.name',
    descriptionKey: 'companion:templates.piVideoTelemetry.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi 4', 'Pi 5'],
    category: 'Video',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-video.sh | bash',
    featureKeys: ['companion:templates.piVideoTelemetry.feature1', 'companion:templates.piVideoTelemetry.feature2', 'companion:templates.piVideoTelemetry.feature3', 'companion:templates.piVideoTelemetry.feature4', 'companion:templates.piVideoTelemetry.feature5', 'companion:templates.piVideoTelemetry.feature6'],
    requirementKeys: ['companion:templates.piVideoTelemetry.requirement1', 'companion:templates.piVideoTelemetry.requirement2', 'companion:templates.piVideoTelemetry.requirement3', 'companion:templates.piVideoTelemetry.requirement4', 'companion:templates.piVideoTelemetry.requirement5'],
    projectName: 'GStreamer + mavlink-router',
  },
  {
    id: 'rpanion-server',
    nameKey: 'companion:templates.rpanionServer.name',
    descriptionKey: 'companion:templates.rpanionServer.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Full Stack', // i18n-exempt: id, shown via CATEGORY_LABEL_KEY
    flashMethod: 'image',
    imageUrl: 'https://github.com/stephendade/Rpanion-server/releases',
    featureKeys: ['companion:templates.rpanionServer.feature1', 'companion:templates.rpanionServer.feature2', 'companion:templates.rpanionServer.feature3', 'companion:templates.rpanionServer.feature4', 'companion:templates.rpanionServer.feature5', 'companion:templates.rpanionServer.feature6'],
    requirementKeys: ['companion:templates.rpanionServer.requirement1', 'companion:templates.rpanionServer.requirement2', 'companion:templates.rpanionServer.requirement3', 'companion:templates.rpanionServer.requirement4'],
    projectUrl: 'https://github.com/stephendade/Rpanion-server',
    projectName: 'Rpanion Server', // i18n-exempt: brand
  },
  {
    id: 'blueos',
    nameKey: 'companion:templates.blueos.name',
    descriptionKey: 'companion:templates.blueos.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Full Stack', // i18n-exempt: id, shown via CATEGORY_LABEL_KEY
    flashMethod: 'image',
    imageUrl: 'https://github.com/bluerobotics/BlueOS/releases',
    featureKeys: ['companion:templates.blueos.feature1', 'companion:templates.blueos.feature2', 'companion:templates.blueos.feature3', 'companion:templates.blueos.feature4', 'companion:templates.blueos.feature5', 'companion:templates.blueos.feature6', 'companion:templates.blueos.feature7'],
    requirementKeys: ['companion:templates.blueos.requirement1', 'companion:templates.blueos.requirement2', 'companion:templates.blueos.requirement3', 'companion:templates.blueos.requirement4'],
    projectUrl: 'https://github.com/bluerobotics/BlueOS',
    projectName: 'BlueOS by Blue Robotics',
  },
  {
    id: 'pi-mavsdk-autonomy',
    nameKey: 'companion:templates.piMavsdkAutonomy.name',
    descriptionKey: 'companion:templates.piMavsdkAutonomy.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi 4', 'Pi 5'],
    category: 'Autonomy',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-autonomy.sh | bash',
    featureKeys: ['companion:templates.piMavsdkAutonomy.feature1', 'companion:templates.piMavsdkAutonomy.feature2', 'companion:templates.piMavsdkAutonomy.feature3', 'companion:templates.piMavsdkAutonomy.feature4', 'companion:templates.piMavsdkAutonomy.feature5', 'companion:templates.piMavsdkAutonomy.feature6'],
    requirementKeys: ['companion:templates.piMavsdkAutonomy.requirement1', 'companion:templates.piMavsdkAutonomy.requirement2', 'companion:templates.piMavsdkAutonomy.requirement3', 'companion:templates.piMavsdkAutonomy.requirement4'],
    projectName: 'MAVSDK + mavlink-router',
  },
  {
    id: 'openhd-air',
    nameKey: 'companion:templates.openhdAir.name',
    descriptionKey: 'companion:templates.openhdAir.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4'],
    category: 'Video',
    flashMethod: 'image',
    featureKeys: ['companion:templates.openhdAir.feature1', 'companion:templates.openhdAir.feature2', 'companion:templates.openhdAir.feature3', 'companion:templates.openhdAir.feature4', 'companion:templates.openhdAir.feature5', 'companion:templates.openhdAir.feature6'],
    requirementKeys: ['companion:templates.openhdAir.requirement1', 'companion:templates.openhdAir.requirement2', 'companion:templates.openhdAir.requirement3', 'companion:templates.openhdAir.requirement4'],
    projectUrl: 'https://github.com/OpenHD/OpenHD',
    projectName: 'OpenHD',
  },
  {
    id: 'pi-str2str-base',
    nameKey: 'companion:templates.piStr2strBase.name',
    descriptionKey: 'companion:templates.piStr2strBase.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'RTK',
    flashMethod: 'script',
    installCommand: 'sudo apt install -y build-essential git && git clone https://github.com/rtklibexplorer/RTKLIB && make -C RTKLIB/app/consapp/str2str/gcc',
    featureKeys: ['companion:templates.piStr2strBase.feature1', 'companion:templates.piStr2strBase.feature2', 'companion:templates.piStr2strBase.feature3', 'companion:templates.piStr2strBase.feature4', 'companion:templates.piStr2strBase.feature5'],
    requirementKeys: ['companion:templates.piStr2strBase.requirement1', 'companion:templates.piStr2strBase.requirement2', 'companion:templates.piStr2strBase.requirement3'],
    projectUrl: 'https://github.com/rtklibexplorer/RTKLIB',
    projectName: 'RTKLIB demo5 (str2str)',
  },
  {
    id: 'pi-mavproxy-ntrip',
    nameKey: 'companion:templates.piMavproxyNtrip.name',
    descriptionKey: 'companion:templates.piMavproxyNtrip.description',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'RTK',
    flashMethod: 'script',
    installCommand: 'pip3 install MAVProxy',
    featureKeys: ['companion:templates.piMavproxyNtrip.feature1', 'companion:templates.piMavproxyNtrip.feature2', 'companion:templates.piMavproxyNtrip.feature3', 'companion:templates.piMavproxyNtrip.feature4', 'companion:templates.piMavproxyNtrip.feature5'],
    requirementKeys: ['companion:templates.piMavproxyNtrip.requirement1', 'companion:templates.piMavproxyNtrip.requirement2', 'companion:templates.piMavproxyNtrip.requirement3'],
    projectUrl: 'https://github.com/ArduPilot/MAVProxy',
    projectName: 'MAVProxy ntrip module',
  },

  // ── Jetson Templates ─────────────────────────────────────────
  {
    id: 'jetson-cv-companion',
    nameKey: 'companion:templates.jetsonCvCompanion.name',
    descriptionKey: 'companion:templates.jetsonCvCompanion.description',
    board: 'jetson',
    boardVariants: ['Jetson Nano', 'Orin Nano'], // i18n-exempt: brand
    category: 'Autonomy',
    flashMethod: 'script',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/jetson-cv.sh | bash',
    featureKeys: ['companion:templates.jetsonCvCompanion.feature1', 'companion:templates.jetsonCvCompanion.feature2', 'companion:templates.jetsonCvCompanion.feature3', 'companion:templates.jetsonCvCompanion.feature4', 'companion:templates.jetsonCvCompanion.feature5', 'companion:templates.jetsonCvCompanion.feature6'],
    requirementKeys: ['companion:templates.jetsonCvCompanion.requirement1', 'companion:templates.jetsonCvCompanion.requirement2', 'companion:templates.jetsonCvCompanion.requirement3', 'companion:templates.jetsonCvCompanion.requirement4'],
    projectName: 'MAVSDK + TensorRT',
  },
];
