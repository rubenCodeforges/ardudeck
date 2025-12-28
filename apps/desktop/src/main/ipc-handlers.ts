/**
 * IPC Handlers for main process
 * Handles communication between renderer and main process
 */

import { ipcMain, BrowserWindow } from 'electron';
import Store from 'electron-store';
import {
  listSerialPorts,
  scanPorts,
  SerialTransport,
  TcpTransport,
  UdpTransport,
  type Transport,
  type SerialPortInfo,
  type ScanResult,
} from '@ardudeck/comms';
import { MAVLinkParser, type MAVLinkPacket } from '@ardudeck/mavlink-ts';
import { IPC_CHANNELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout, type LayoutStoreSchema } from '../shared/ipc-channels.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../shared/telemetry-types.js';
import { COPTER_MODES, PLANE_MODES } from '../shared/telemetry-types.js';

// Layout storage
const layoutStore = new Store<LayoutStoreSchema>({
  name: 'layouts',
  defaults: {
    activeLayout: 'default',
    layouts: {},
  },
});

let currentTransport: Transport | null = null;
let currentVehicleType = 0; // 1=plane, 2=copter, etc.
let mavlinkParser: MAVLinkParser | null = null;
let heartbeatTimeout: NodeJS.Timeout | null = null;
let logId = 0;
let connectionState: ConnectionState = {
  isConnected: false,
  packetsReceived: 0,
  packetsSent: 0,
};

// Autopilot type names (from MAV_AUTOPILOT enum)
const AUTOPILOT_NAMES: Record<number, string> = {
  0: 'Generic',
  3: 'ArduPilot',
  4: 'OpenPilot',
  8: 'Invalid',
  12: 'PX4',
};

// Vehicle type names (from MAV_TYPE enum)
const VEHICLE_NAMES: Record<number, string> = {
  0: 'Generic',
  1: 'Fixed Wing',
  2: 'Quadrotor',
  3: 'Coaxial',
  4: 'Helicopter',
  5: 'Antenna Tracker',
  6: 'GCS',
  7: 'Airship',
  8: 'Free Balloon',
  9: 'Rocket',
  10: 'Ground Rover',
  11: 'Surface Boat',
  12: 'Submarine',
  13: 'Hexarotor',
  14: 'Octorotor',
  15: 'Tricopter',
  16: 'Flapping Wing',
  17: 'Kite',
  18: 'Onboard Companion',
  19: 'VTOL Tailsitter Duo',
  20: 'VTOL Tailsitter Quad',
  21: 'VTOL Tiltrotor',
  22: 'VTOL Fixed-rotor',
  23: 'VTOL Tailsitter',
  24: 'VTOL Tiltwing',
  25: 'VTOL Reserved5',
  26: 'Gimbal',
  27: 'ADSB',
  28: 'Parafoil',
  29: 'Dodecarotor',
  30: 'Camera',
  31: 'Charging Station',
  32: 'FLARM',
  33: 'Servo',
  34: 'ODID',
  35: 'Decarotor',
  36: 'Battery',
  37: 'Parachute',
  38: 'Log',
  39: 'OSD',
  40: 'IMU',
  41: 'GPS',
  42: 'Winch',
};

// Safely send IPC message to window (checks if window is still valid)
function safeSend(mainWindow: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch {
    // Window was destroyed, ignore
  }
}

function sendLog(mainWindow: BrowserWindow, level: ConsoleLogEntry['level'], message: string, details?: string): void {
  const entry: ConsoleLogEntry = {
    id: ++logId,
    timestamp: Date.now(),
    level,
    message,
    details,
  };
  safeSend(mainWindow, IPC_CHANNELS.CONSOLE_LOG, entry);
}

// Helper functions to read values from MAVLink payload (little-endian)
function readInt16(payload: Uint8Array, offset: number): number {
  const val = payload[offset] | (payload[offset + 1] << 8);
  return val > 0x7FFF ? val - 0x10000 : val;
}

function readUint16(payload: Uint8Array, offset: number): number {
  return payload[offset] | (payload[offset + 1] << 8);
}

function readInt32(payload: Uint8Array, offset: number): number {
  const val = payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24);
  return val;
}

function readUint32(payload: Uint8Array, offset: number): number {
  return (payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24)) >>> 0;
}

function readFloat(payload: Uint8Array, offset: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint8(0, payload[offset]);
  view.setUint8(1, payload[offset + 1]);
  view.setUint8(2, payload[offset + 2]);
  view.setUint8(3, payload[offset + 3]);
  return view.getFloat32(0, true); // little-endian
}

// MAVLink message IDs
const MSG_HEARTBEAT = 0;
const MSG_SYS_STATUS = 1;
const MSG_GPS_RAW_INT = 24;
const MSG_ATTITUDE = 30;
const MSG_GLOBAL_POSITION_INT = 33;
const MSG_VFR_HUD = 74;

// Parse telemetry from MAVLink packet
// NOTE: MAVLink v2 orders payload fields by size (largest first for alignment)
function parseTelemetry(mainWindow: BrowserWindow, packet: MAVLinkPacket): void {
  const { msgid, payload } = packet;

  switch (msgid) {
    case MSG_HEARTBEAT: {
      // MAVLink wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), system_status(1), mavlink_version(1)
      const customMode = readUint32(payload, 0);
      const vehicleType = payload[4];
      const autopilotType = payload[5];
      const baseMode = payload[6];

      currentVehicleType = vehicleType;
      const armed = (baseMode & 0x80) !== 0; // MAV_MODE_FLAG_SAFETY_ARMED

      // Get mode name based on vehicle type
      let modeName = `Mode ${customMode}`;
      // Fixed wing and VTOL types use plane modes
      if (vehicleType === 1 || (vehicleType >= 19 && vehicleType <= 25)) {
        modeName = PLANE_MODES[customMode] || modeName;
      } else if (vehicleType === 2 || (vehicleType >= 13 && vehicleType <= 15) || vehicleType === 29 || vehicleType === 35) {
        // Rotorcraft types: quad, hex, octo, tri, dodeca, deca
        modeName = COPTER_MODES[customMode] || modeName;
      }

      const flight: FlightState = {
        mode: modeName,
        modeNum: customMode,
        armed,
        isFlying: armed && (baseMode & 0x04) !== 0, // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED as proxy
      };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'flight', data: flight });
      break;
    }

    case MSG_SYS_STATUS: {
      // Payload offset for battery: voltage_battery at offset 14 (uint16 mV), current_battery at 16 (int16 cA), battery_remaining at 30 (int8 %)
      const voltage = readUint16(payload, 14) / 1000; // mV to V
      const current = readInt16(payload, 16) / 100;   // cA to A
      const remaining = payload[30] === 255 ? -1 : payload[30]; // -1 if unknown

      const battery: BatteryData = { voltage, current, remaining };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'battery', data: battery });
      break;
    }

    case MSG_GPS_RAW_INT: {
      // MAVLink wire order: time_usec(8), lat(4), lon(4), alt(4), eph(2), epv(2), vel(2), cog(2), fix_type(1), satellites_visible(1)
      const lat = readInt32(payload, 8) / 1e7;
      const lon = readInt32(payload, 12) / 1e7;
      const alt = readInt32(payload, 16) / 1000; // mm to m
      const hdop = readUint16(payload, 20) / 100; // eph = hdop * 100
      const fixType = payload[28];
      const satellites = payload[29];

      const gps: GpsData = { fixType, satellites, hdop, lat, lon, alt };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'gps', data: gps });
      break;
    }

    case MSG_ATTITUDE: {
      // Payload: time_boot_ms(4), roll(4), pitch(4), yaw(4), rollspeed(4), pitchspeed(4), yawspeed(4)
      const roll = readFloat(payload, 4) * (180 / Math.PI);     // rad to deg
      const pitch = readFloat(payload, 8) * (180 / Math.PI);
      const yaw = readFloat(payload, 12) * (180 / Math.PI);
      const rollSpeed = readFloat(payload, 16) * (180 / Math.PI);
      const pitchSpeed = readFloat(payload, 20) * (180 / Math.PI);
      const yawSpeed = readFloat(payload, 24) * (180 / Math.PI);

      const attitude: AttitudeData = { roll, pitch, yaw, rollSpeed, pitchSpeed, yawSpeed };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'attitude', data: attitude });
      break;
    }

    case MSG_GLOBAL_POSITION_INT: {
      // Payload: time_boot_ms(4), lat(4), lon(4), alt(4), relative_alt(4), vx(2), vy(2), vz(2), hdg(2)
      const lat = readInt32(payload, 4) / 1e7;
      const lon = readInt32(payload, 8) / 1e7;
      const alt = readInt32(payload, 12) / 1000;        // mm to m
      const relativeAlt = readInt32(payload, 16) / 1000;
      const vx = readInt16(payload, 20) / 100;          // cm/s to m/s
      const vy = readInt16(payload, 22) / 100;
      const vz = readInt16(payload, 24) / 100;

      const position: PositionData = { lat, lon, alt, relativeAlt, vx, vy, vz };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'position', data: position });
      break;
    }

    case MSG_VFR_HUD: {
      // MAVLink wire order: airspeed(4), groundspeed(4), alt(4), climb(4), heading(2), throttle(2)
      const airspeed = readFloat(payload, 0);
      const groundspeed = readFloat(payload, 4);
      const alt = readFloat(payload, 8);
      const climb = readFloat(payload, 12);
      const heading = readInt16(payload, 16);
      const throttle = readUint16(payload, 18);

      const vfrHud: VfrHudData = { airspeed, groundspeed, heading, throttle, alt, climb };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'vfrHud', data: vfrHud });
      break;
    }
  }
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // List available serial ports
  ipcMain.handle(IPC_CHANNELS.COMMS_LIST_PORTS, async (): Promise<SerialPortInfo[]> => {
    return listSerialPorts();
  });

  // Scan ports for MAVLink devices
  ipcMain.handle(IPC_CHANNELS.COMMS_SCAN_PORTS, async (): Promise<ScanResult[]> => {
    return scanPorts({
      onProgress: (port, baudRate, status) => {
        safeSend(mainWindow, 'scan:progress', { port, baudRate, status });
      },
    });
  });

  // Connect to a device
  ipcMain.handle(IPC_CHANNELS.COMMS_CONNECT, async (_, options: ConnectOptions): Promise<boolean> => {
    // Clear any existing heartbeat timeout
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }

    // Disconnect existing connection
    if (currentTransport?.isOpen) {
      await currentTransport.close();
    }

    try {
      // Create appropriate transport
      let transportName = '';
      switch (options.type) {
        case 'serial':
          if (!options.port) throw new Error('Port required for serial connection');
          currentTransport = new SerialTransport(options.port, {
            baudRate: options.baudRate ?? 115200,
          });
          transportName = `${options.port} @ ${options.baudRate ?? 115200}`;
          break;
        case 'tcp':
          if (!options.host || !options.tcpPort) throw new Error('Host and port required for TCP');
          currentTransport = new TcpTransport({
            host: options.host,
            port: options.tcpPort,
          });
          transportName = `TCP ${options.host}:${options.tcpPort}`;
          break;
        case 'udp':
          currentTransport = new UdpTransport({
            localPort: options.udpPort ?? 14550,
          });
          transportName = `UDP :${options.udpPort ?? 14550}`;
          break;
      }

      sendLog(mainWindow, 'info', `Opening ${transportName}...`);

      // Create parser
      mavlinkParser = new MAVLinkParser();

      // Setup data handler
      currentTransport.on('data', async (data: Uint8Array) => {
        if (!mavlinkParser) return;

        for await (const packet of mavlinkParser.parse(data)) {
          connectionState.packetsReceived++;

          // Handle heartbeat (msgid 0)
          if (packet.msgid === 0) {
            // Parse heartbeat payload: type(1), autopilot(1), base_mode(1), custom_mode(4), system_status(1), mavlink_version(1)
            const vehicleType = packet.payload[0];
            const autopilotType = packet.payload[1];

            // First heartbeat - connection confirmed!
            if (connectionState.isWaitingForHeartbeat) {
              if (heartbeatTimeout) {
                clearTimeout(heartbeatTimeout);
                heartbeatTimeout = null;
              }

              connectionState.isWaitingForHeartbeat = false;
              connectionState.isConnected = true;
              connectionState.systemId = packet.sysid;
              connectionState.componentId = packet.compid;
              connectionState.autopilot = AUTOPILOT_NAMES[autopilotType] || `Unknown (${autopilotType})`;
              connectionState.vehicleType = VEHICLE_NAMES[vehicleType] || `Unknown (${vehicleType})`;

              sendLog(mainWindow, 'info', `Connected to ${connectionState.autopilot} ${connectionState.vehicleType}`, `System ID: ${packet.sysid}, Component ID: ${packet.compid}`);
              sendConnectionState(mainWindow);
            }
          }

          // Parse telemetry data from known message types
          parseTelemetry(mainWindow, packet);

          // Log packets (limit to not spam)
          if (connectionState.packetsReceived <= 10 || connectionState.packetsReceived % 100 === 0) {
            sendLog(mainWindow, 'packet', `MSG #${packet.msgid}`, `sysid=${packet.sysid} compid=${packet.compid} seq=${packet.seq} len=${packet.payload.length}`);
          }

          // Send packet to renderer
          safeSend(mainWindow, IPC_CHANNELS.MAVLINK_PACKET, {
            msgid: packet.msgid,
            sysid: packet.sysid,
            compid: packet.compid,
            seq: packet.seq,
            payload: Array.from(packet.payload),
          });

          // Update packet count periodically
          if (connectionState.packetsReceived % 50 === 0) {
            sendConnectionState(mainWindow);
          }
        }
      });

      currentTransport.on('error', (error: Error) => {
        console.error('Transport error:', error);
        sendLog(mainWindow, 'error', 'Transport error', error.message);
        safeSend(mainWindow, 'connection:error', error.message);
      });

      currentTransport.on('close', () => {
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
        connectionState.isConnected = false;
        connectionState.isWaitingForHeartbeat = false;
        sendLog(mainWindow, 'info', 'Connection closed');
        sendConnectionState(mainWindow);
      });

      // Open connection
      await currentTransport.open();
      sendLog(mainWindow, 'info', `Port opened, waiting for MAVLink heartbeat...`);

      // Set state to waiting for heartbeat (NOT connected yet)
      connectionState = {
        isConnected: false,
        isWaitingForHeartbeat: true,
        transport: transportName,
        packetsReceived: 0,
        packetsSent: 0,
      };
      sendConnectionState(mainWindow);

      // Set heartbeat timeout (5 seconds)
      heartbeatTimeout = setTimeout(() => {
        if (connectionState.isWaitingForHeartbeat) {
          sendLog(mainWindow, 'error', 'No MAVLink heartbeat received', 'Timeout after 5 seconds. Is this a MAVLink device?');
          connectionState.isWaitingForHeartbeat = false;
          sendConnectionState(mainWindow);
          // Close the transport
          currentTransport?.close();
        }
      }, 5000);

      return true;
    } catch (error) {
      console.error('Connection failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Connection failed', message);
      currentTransport = null;
      mavlinkParser = null;
      return false;
    }
  });

  // Disconnect
  ipcMain.handle(IPC_CHANNELS.COMMS_DISCONNECT, async (): Promise<void> => {
    if (currentTransport?.isOpen) {
      await currentTransport.close();
    }
    currentTransport = null;
    mavlinkParser = null;
    connectionState = {
      isConnected: false,
      packetsReceived: 0,
      packetsSent: 0,
    };
    sendConnectionState(mainWindow);
  });

  // Send MAVLink message
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SEND, async (_, payload: number[]): Promise<boolean> => {
    if (!currentTransport?.isOpen) {
      return false;
    }

    try {
      await currentTransport.write(new Uint8Array(payload));
      connectionState.packetsSent++;
      return true;
    } catch (error) {
      console.error('Send failed:', error);
      return false;
    }
  });

  // Layout management handlers
  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET_ALL, async (): Promise<Record<string, SavedLayout>> => {
    return layoutStore.get('layouts', {});
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET, async (_, name: string): Promise<SavedLayout | null> => {
    const layouts = layoutStore.get('layouts', {});
    return layouts[name] || null;
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_SAVE, async (_, name: string, data: unknown): Promise<void> => {
    const layouts = layoutStore.get('layouts', {});
    const now = Date.now();
    const existing = layouts[name];

    layouts[name] = {
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data,
    };

    layoutStore.set('layouts', layouts);
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_DELETE, async (_, name: string): Promise<void> => {
    const layouts = layoutStore.get('layouts', {});
    delete layouts[name];
    layoutStore.set('layouts', layouts);

    // If deleted layout was active, reset to default
    if (layoutStore.get('activeLayout') === name) {
      layoutStore.set('activeLayout', 'default');
    }
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_SET_ACTIVE, async (_, name: string): Promise<void> => {
    layoutStore.set('activeLayout', name);
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET_ACTIVE, async (): Promise<string> => {
    return layoutStore.get('activeLayout', 'default');
  });
}

function sendConnectionState(mainWindow: BrowserWindow): void {
  safeSend(mainWindow, IPC_CHANNELS.CONNECTION_STATE, connectionState);
}
