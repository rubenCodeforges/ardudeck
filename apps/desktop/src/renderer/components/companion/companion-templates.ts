/**
 * Companion board templates — pre-configured firmware/software for popular boards.
 * Each template includes board info, use case, flash method, and setup instructions.
 */

export type BoardFamily = 'esp32' | 'raspberry-pi' | 'jetson' | 'orange-pi';
export type FlashMethod = 'serial' | 'image' | 'script';

export interface CompanionTemplate {
  id: string;
  name: string;
  description: string;
  board: BoardFamily;
  boardVariants: string[]; // e.g. ['ESP32', 'ESP32-S3', 'ESP32-C3']
  category: string;
  flashMethod: FlashMethod;
  firmwareUrl?: string; // URL to download firmware binary
  installCommand?: string; // One-liner install script
  imageUrl?: string; // URL to download SD card image
  features: string[];
  requirements: string[];
  projectUrl?: string; // Link to upstream project
  projectName?: string; // Name of upstream project
}

// ── Board family metadata ──────────────────────────────────────

export const BOARD_FAMILIES: Record<BoardFamily, {
  name: string;
  description: string;
  icon: string; // SVG path for the board icon
}> = {
  'esp32': {
    name: 'ESP32',
    description: 'Lightweight microcontroller for telemetry bridges and sensor hubs',
    icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  },
  'raspberry-pi': {
    name: 'Raspberry Pi',
    description: 'Full companion computer for video, autonomy, and advanced features',
    icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  },
  'jetson': {
    name: 'NVIDIA Jetson',
    description: 'GPU-accelerated companion for AI, computer vision, and SLAM',
    icon: 'M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18',
  },
  'orange-pi': {
    name: 'Orange Pi',
    description: 'Budget-friendly Pi alternative with similar capabilities',
    icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  },
};

// ── Category styling ───────────────────────────────────────────

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
  'Full Stack': {
    accent: 'border-t-amber-500/70',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
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
    name: 'DroneBridge WiFi Telemetry',
    description: 'Replace SiK radio with WiFi telemetry. Connect QGroundControl, Mission Planner, or ArduDeck wirelessly.',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3', 'ESP32-C6'],
    category: 'Telemetry',
    flashMethod: 'serial',
    features: ['WiFi AP + Station mode', 'MAVLink transparent bridge', 'UDP/TCP telemetry', 'Web configuration UI', 'AES-256 encryption'],
    requirements: ['ESP32 dev board', 'UART connection to FC (TX/RX/GND)', '3.3V or 5V power'],
    projectUrl: 'https://github.com/DroneBridge/ESP32',
    projectName: 'DroneBridge for ESP32',
  },
  {
    id: 'dronebridge-espnow',
    name: 'DroneBridge ESP-NOW Long Range',
    description: 'Connectionless encrypted telemetry up to 1km range. Requires ESP32 on both air and ground side.',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S2', 'ESP32-S3', 'ESP32-C3'],
    category: 'Telemetry',
    flashMethod: 'serial',
    features: ['ESP-NOW protocol (no WiFi association)', 'Up to 1km range with ext. antenna', 'AES-GCM encryption', 'Low latency', 'No router needed'],
    requirements: ['2x ESP32 boards (air + ground)', 'External antenna recommended', 'UART connection to FC'],
    projectUrl: 'https://github.com/DroneBridge/ESP32',
    projectName: 'DroneBridge for ESP32',
  },
  {
    id: 'esp32-mavlink-bridge',
    name: 'MAVLink WiFi Bridge (Minimal)',
    description: 'Lightweight serial-to-WiFi bridge. Minimal firmware for simple telemetry forwarding over UDP.',
    board: 'esp32',
    boardVariants: ['ESP32', 'ESP32-S3', 'ESP32-C3'],
    category: 'Telemetry',
    flashMethod: 'serial',
    features: ['WiFi AP mode', 'Serial-to-UDP bridge', 'Auto-baud detection', 'Minimal resource usage'],
    requirements: ['ESP32 dev board', 'UART connection to FC', '3.3V or 5V power'],
    projectName: 'mavesp8266 (ESP32 fork)',
  },

  // ── Raspberry Pi Templates ───────────────────────────────────
  {
    id: 'pi-telemetry-bridge',
    name: 'Telemetry Bridge',
    description: 'MAVLink router + WiFi AP. Connects ground stations wirelessly without a telemetry radio.',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Telemetry',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-telemetry.sh | bash',
    features: ['mavlink-router daemon', 'WiFi access point', 'Multiple GCS connections', 'ArduDeck Agent pre-installed', 'Auto-start on boot'],
    requirements: ['Raspberry Pi with WiFi', 'MicroSD card (8GB+)', 'UART or USB connection to FC', '5V 3A BEC'],
    projectName: 'mavlink-router + hostapd',
  },
  {
    id: 'pi-video-telemetry',
    name: 'Video + Telemetry',
    description: 'Camera streaming with GStreamer + MAVLink routing. Low-latency H.264 video over WiFi.',
    board: 'raspberry-pi',
    boardVariants: ['Pi 4', 'Pi 5'],
    category: 'Video',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-video.sh | bash',
    features: ['Pi Camera H.264 streaming', 'GStreamer RTSP/UDP pipeline', 'MAVLink routing', 'WiFi AP', 'ArduDeck Agent', 'Web preview'],
    requirements: ['Raspberry Pi 4 or 5', 'Pi Camera Module (v2/v3/HQ)', 'MicroSD card (16GB+)', 'UART or USB to FC', '5V 3A BEC'],
    projectName: 'GStreamer + mavlink-router',
  },
  {
    id: 'rpanion-server',
    name: 'Rpanion Server',
    description: 'Full-featured companion with web UI. Telemetry routing, video streaming, NTRIP, and network management.',
    board: 'raspberry-pi',
    boardVariants: ['Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Full Stack',
    flashMethod: 'image',
    imageUrl: 'https://github.com/stephendade/Rpanion-server/releases',
    features: ['Web-based config UI', 'MAVLink routing', 'Video streaming', 'NTRIP client (RTK GPS)', 'Flight controller management', 'Network config'],
    requirements: ['Raspberry Pi 3B+ or later', 'MicroSD card (16GB+)', 'UART or USB to FC', '5V 3A BEC'],
    projectUrl: 'https://github.com/stephendade/Rpanion-server',
    projectName: 'Rpanion Server',
  },
  {
    id: 'blueos',
    name: 'BlueOS',
    description: 'Docker-based companion OS with extension store. Full vehicle management, video, and third-party extensions.',
    board: 'raspberry-pi',
    boardVariants: ['Pi 3B+', 'Pi 4', 'Pi 5'],
    category: 'Full Stack',
    flashMethod: 'image',
    imageUrl: 'https://github.com/bluerobotics/BlueOS/releases',
    features: ['Docker container architecture', 'Extension marketplace', 'MAVLink routing', 'Video streaming', 'Web UI', 'OTA updates', 'Log management'],
    requirements: ['Raspberry Pi 3B+ or later', 'MicroSD card (16GB+)', 'UART or USB to FC', '5V 3A BEC'],
    projectUrl: 'https://github.com/bluerobotics/BlueOS',
    projectName: 'BlueOS by Blue Robotics',
  },
  {
    id: 'pi-mavsdk-autonomy',
    name: 'Autonomous Mission Runner',
    description: 'Python environment with MAVSDK for onboard autonomous missions. Run scripts without a GCS link.',
    board: 'raspberry-pi',
    boardVariants: ['Pi 4', 'Pi 5'],
    category: 'Autonomy',
    flashMethod: 'image',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/pi-autonomy.sh | bash',
    features: ['MAVSDK Python', 'MAVLink routing', 'Mission script examples', 'Geofence integration', 'ArduDeck Agent', 'Auto-start on boot'],
    requirements: ['Raspberry Pi 4 or 5', 'MicroSD card (16GB+)', 'UART or USB to FC', '5V 3A BEC'],
    projectName: 'MAVSDK + mavlink-router',
  },
  {
    id: 'openhd-air',
    name: 'OpenHD Air Unit',
    description: 'Digital FPV system — HD video + telemetry + RC over WiFi broadcast. Up to 50km range.',
    board: 'raspberry-pi',
    boardVariants: ['Pi Zero 2 W', 'Pi 3B+', 'Pi 4'],
    category: 'Video',
    flashMethod: 'image',
    features: ['HD video streaming (H.264/H.265)', 'Integrated telemetry overlay', 'RC control link', 'Up to 50km range', 'Dual-band support', 'Recording'],
    requirements: ['Raspberry Pi (air + ground)', 'Compatible WiFi adapter (RTL8812AU)', 'Pi Camera', 'MicroSD card (16GB+)'],
    projectUrl: 'https://github.com/OpenHD/OpenHD',
    projectName: 'OpenHD',
  },

  // ── Jetson Templates ─────────────────────────────────────────
  {
    id: 'jetson-cv-companion',
    name: 'Computer Vision Companion',
    description: 'GPU-accelerated object detection and tracking with YOLO. Real-time obstacle avoidance and target following.',
    board: 'jetson',
    boardVariants: ['Jetson Nano', 'Orin Nano'],
    category: 'Autonomy',
    flashMethod: 'script',
    installCommand: 'curl -fsSL https://ardudeck.com/companion/jetson-cv.sh | bash',
    features: ['YOLO object detection (GPU)', 'MAVSDK integration', 'MAVLink routing', 'Camera pipeline', 'ArduDeck Agent', 'ROS2 optional'],
    requirements: ['NVIDIA Jetson Nano or Orin Nano', 'JetPack SDK installed', 'USB camera or CSI camera', 'UART or USB to FC'],
    projectName: 'MAVSDK + TensorRT',
  },
];
