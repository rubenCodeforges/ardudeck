/**
 * Protocol Bridge
 *
 * Translates between FlightGear's generic UDP protocol and X-Plane's UDP protocol.
 * This allows iNav SITL (which expects X-Plane format) to work with FlightGear.
 *
 * Data flow:
 *   FlightGear (port 5505) → Bridge → iNav SITL (X-Plane format)
 *   iNav SITL (servo outputs) → Bridge → FlightGear (port 5506)
 */

import dgram from 'dgram';

// FlightGear output packet structure (matches ardudeck-out.xml)
// 22 doubles = 176 bytes
interface FlightGearSensorData {
  latitude: number;         // deg
  longitude: number;        // deg
  altitudeMsl: number;      // ft
  altitudeAgl: number;      // ft
  roll: number;             // deg
  pitch: number;            // deg
  heading: number;          // deg
  rollRate: number;         // deg/s
  pitchRate: number;        // deg/s
  yawRate: number;          // deg/s
  airspeed: number;         // kt
  groundspeed: number;      // kt
  verticalSpeed: number;    // fps
  uBody: number;            // fps
  vBody: number;            // fps
  wBody: number;            // fps
  accelX: number;           // g
  accelY: number;           // g
  accelZ: number;           // g
  temperature: number;      // degC
  pressure: number;         // inHg
  simTime: number;          // sec
}

// FlightGear input packet structure (matches ardudeck-in.xml)
// 8 doubles = 64 bytes
interface FlightGearControlData {
  aileron: number;          // -1 to +1
  elevator: number;         // -1 to +1
  rudder: number;           // -1 to +1
  throttle: number;         // 0 to 1
  flaps: number;            // 0 to 1
  speedbrake: number;       // 0 to 1
  gearDown: number;         // 0 or 1
  brakePark: number;        // 0 or 1
}

// X-Plane DATA packet indices used by iNav SITL
const XPLANE_INDEX = {
  SPEEDS: 3,        // Airspeed data
  PITCH_ROLL_HEADING: 17,  // Attitude
  LAT_LON_ALT: 20,  // Position
  LOC_VEL_DIST: 21, // Location and velocity
};

// Default ports
const DEFAULT_FG_OUT_PORT = 5505;    // FlightGear → Bridge
const DEFAULT_FG_IN_PORT = 5506;     // Bridge → FlightGear
const DEFAULT_SITL_SIM_PORT = 49000; // Bridge → iNav SITL (X-Plane format)

export interface BridgeConfig {
  fgOutPort?: number;       // Port to receive from FlightGear
  fgInPort?: number;        // Port to send to FlightGear
  sitlHost?: string;        // iNav SITL host
  sitlSimPort?: number;     // iNav SITL simulator port
}

class ProtocolBridge {
  private fgReceiver: dgram.Socket | null = null;   // Receive from FlightGear
  private fgSender: dgram.Socket | null = null;     // Send to FlightGear
  private sitlSender: dgram.Socket | null = null;   // Send to iNav SITL

  private config: BridgeConfig = {};
  private running = false;
  private lastFgData: FlightGearSensorData | null = null;

  /**
   * Check if bridge is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Start the protocol bridge
   */
  async start(config: BridgeConfig = {}): Promise<{ success: boolean; error?: string }> {
    if (this.running) {
      return { success: false, error: 'Bridge is already running' };
    }

    this.config = {
      fgOutPort: config.fgOutPort || DEFAULT_FG_OUT_PORT,
      fgInPort: config.fgInPort || DEFAULT_FG_IN_PORT,
      sitlHost: config.sitlHost || '127.0.0.1',
      sitlSimPort: config.sitlSimPort || DEFAULT_SITL_SIM_PORT,
    };

    try {
      // Create UDP sockets
      this.fgReceiver = dgram.createSocket('udp4');
      this.fgSender = dgram.createSocket('udp4');
      this.sitlSender = dgram.createSocket('udp4');

      // Set up FlightGear receiver
      this.fgReceiver.on('message', (msg, rinfo) => {
        this.handleFlightGearData(msg);
      });

      this.fgReceiver.on('error', (err) => {
        console.error('[Bridge] FlightGear receiver error:', err);
      });

      // Bind to receive from FlightGear
      await new Promise<void>((resolve, reject) => {
        this.fgReceiver!.bind(this.config.fgOutPort, '127.0.0.1', () => {
          console.log(`[Bridge] Listening for FlightGear on port ${this.config.fgOutPort}`);
          resolve();
        });
        this.fgReceiver!.once('error', reject);
      });

      this.running = true;
      console.log('[Bridge] Protocol bridge started');
      return { success: true };
    } catch (err) {
      await this.cleanup();
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Stop the protocol bridge
   */
  async stop(): Promise<void> {
    console.log('[Bridge] Stopping...');
    this.running = false;
    await this.cleanup();
    console.log('[Bridge] Stopped');
  }

  /**
   * Clean up sockets
   */
  private async cleanup(): Promise<void> {
    const closeSocket = (socket: dgram.Socket | null): Promise<void> => {
      return new Promise((resolve) => {
        if (socket) {
          socket.close(() => resolve());
        } else {
          resolve();
        }
      });
    };

    await Promise.all([
      closeSocket(this.fgReceiver),
      closeSocket(this.fgSender),
      closeSocket(this.sitlSender),
    ]);

    this.fgReceiver = null;
    this.fgSender = null;
    this.sitlSender = null;
  }

  /**
   * Handle incoming FlightGear data packet
   */
  private handleFlightGearData(buffer: Buffer): void {
    // Parse FlightGear binary data (22 doubles)
    if (buffer.length < 176) {
      console.warn('[Bridge] Received incomplete FlightGear packet:', buffer.length);
      return;
    }

    const data = this.parseFlightGearPacket(buffer);
    this.lastFgData = data;

    // Convert to X-Plane format and send to SITL
    this.sendToSitl(data);
  }

  /**
   * Parse FlightGear binary packet
   */
  private parseFlightGearPacket(buffer: Buffer): FlightGearSensorData {
    let offset = 0;
    const readDouble = (): number => {
      const val = buffer.readDoubleLE(offset);
      offset += 8;
      return val;
    };

    return {
      latitude: readDouble(),
      longitude: readDouble(),
      altitudeMsl: readDouble(),
      altitudeAgl: readDouble(),
      roll: readDouble(),
      pitch: readDouble(),
      heading: readDouble(),
      rollRate: readDouble(),
      pitchRate: readDouble(),
      yawRate: readDouble(),
      airspeed: readDouble(),
      groundspeed: readDouble(),
      verticalSpeed: readDouble(),
      uBody: readDouble(),
      vBody: readDouble(),
      wBody: readDouble(),
      accelX: readDouble(),
      accelY: readDouble(),
      accelZ: readDouble(),
      temperature: readDouble(),
      pressure: readDouble(),
      simTime: readDouble(),
    };
  }

  /**
   * Send data to iNav SITL in X-Plane format
   */
  private sendToSitl(data: FlightGearSensorData): void {
    if (!this.sitlSender || !this.running) return;

    // iNav SITL expects X-Plane DATA packets
    // Each packet: "DATA" (4 bytes) + index (4 bytes) + 8 floats (32 bytes) = 40 bytes

    // Send attitude data (Index 17)
    this.sendXPlaneDataPacket(XPLANE_INDEX.PITCH_ROLL_HEADING, [
      data.pitch,           // pitch deg
      data.roll,            // roll deg
      data.heading,         // heading deg (true)
      data.heading,         // heading deg (magnetic, approximation)
      0, 0, 0, 0,           // unused
    ]);

    // Send position data (Index 20)
    this.sendXPlaneDataPacket(XPLANE_INDEX.LAT_LON_ALT, [
      data.latitude,        // lat deg
      data.longitude,       // lon deg
      data.altitudeMsl,     // alt MSL ft
      data.altitudeAgl,     // alt AGL ft
      0,                    // on runway
      data.altitudeMsl,     // alt indicated
      0,                    // lat south
      0,                    // lon west
    ]);

    // Send speed data (Index 3)
    this.sendXPlaneDataPacket(XPLANE_INDEX.SPEEDS, [
      data.airspeed,        // KIAS
      data.airspeed,        // KEAS (approximation)
      data.airspeed,        // KTAS (approximation)
      data.groundspeed,     // KTGS
      0, 0, 0, 0,           // unused
    ]);

    // Send velocity data (Index 21)
    this.sendXPlaneDataPacket(XPLANE_INDEX.LOC_VEL_DIST, [
      0, 0, 0,              // x, y, z (local coords - not used)
      data.uBody * 0.3048,  // vX m/s (convert fps)
      data.vBody * 0.3048,  // vY m/s
      data.wBody * 0.3048,  // vZ m/s
      0, 0,                 // dist, unused
    ]);
  }

  /**
   * Build and send X-Plane DATA packet
   */
  private sendXPlaneDataPacket(index: number, values: number[]): void {
    if (!this.sitlSender) return;

    // X-Plane DATA packet: "DATA" + 4-byte index + 8 floats
    const buffer = Buffer.alloc(41); // "DATA\0" (5) + index (4) + 8 floats (32) = 41

    // Header: "DATA\0"
    buffer.write('DATA', 0);
    buffer.writeUInt8(0, 4);

    // Index (4 bytes)
    buffer.writeInt32LE(index, 5);

    // 8 float values
    for (let i = 0; i < 8; i++) {
      buffer.writeFloatLE(values[i] || 0, 9 + i * 4);
    }

    this.sitlSender.send(buffer, this.config.sitlSimPort!, this.config.sitlHost!);
  }

  /**
   * Send control data to FlightGear
   * Called when iNav SITL sends servo outputs
   */
  sendToFlightGear(controls: FlightGearControlData): void {
    if (!this.fgSender || !this.running) return;

    // Build binary packet (8 doubles = 64 bytes)
    const buffer = Buffer.alloc(64);
    let offset = 0;

    const writeDouble = (val: number): void => {
      buffer.writeDoubleLE(val, offset);
      offset += 8;
    };

    writeDouble(controls.aileron);
    writeDouble(controls.elevator);
    writeDouble(controls.rudder);
    writeDouble(controls.throttle);
    writeDouble(controls.flaps);
    writeDouble(controls.speedbrake);
    writeDouble(controls.gearDown);
    writeDouble(controls.brakePark);

    this.fgSender.send(buffer, this.config.fgInPort!, '127.0.0.1');
  }

  /**
   * Get last received FlightGear data (for debugging)
   */
  getLastData(): FlightGearSensorData | null {
    return this.lastFgData;
  }
}

// Singleton instance
export const protocolBridge = new ProtocolBridge();
