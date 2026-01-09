/**
 * Protocol Bridge
 *
 * Translates between FlightGear's generic UDP protocol and X-Plane's RREF protocol.
 * This allows iNav SITL (which expects X-Plane RREF format) to work with FlightGear.
 *
 * X-Plane RREF Protocol:
 * - SITL sends RREF registration requests to subscribe to datarefs
 * - X-Plane (bridge) responds with RREF packets containing the requested values
 * - SITL uses a client-side UDP pattern (ephemeral local port)
 *
 * Data flow:
 *   1. SITL sends RREF registration requests to bridge (port 49000)
 *   2. Bridge stores the requested datarefs and discovers SITL's ephemeral port
 *   3. FlightGear sends sensor data to bridge (port 5505)
 *   4. Bridge converts to RREF responses and sends to SITL's ephemeral port
 *   5. SITL processes the data and opens TCP port 5760 for MSP connection
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

// Default ports
const DEFAULT_FG_OUT_PORT = 5505;    // FlightGear → Bridge
const DEFAULT_FG_IN_PORT = 5506;     // Bridge → FlightGear
// Bridge binds to 49000 to act as X-Plane server
// SITL sends TO this port, and we reply to SITL's ephemeral port
const DEFAULT_XPLANE_SERVER_PORT = 49000;

export interface BridgeConfig {
  fgOutPort?: number;       // Port to receive from FlightGear
  fgInPort?: number;        // Port to send to FlightGear
  xplaneServerPort?: number; // Port to bind as X-Plane server (SITL sends here)
}

class ProtocolBridge {
  private fgReceiver: dgram.Socket | null = null;   // Receive from FlightGear
  private fgSender: dgram.Socket | null = null;     // Send to FlightGear
  private xplaneServer: dgram.Socket | null = null; // Act as X-Plane server (bind 49000)

  private config: Required<BridgeConfig> = {
    fgOutPort: DEFAULT_FG_OUT_PORT,
    fgInPort: DEFAULT_FG_IN_PORT,
    xplaneServerPort: DEFAULT_XPLANE_SERVER_PORT,
  };
  private running = false;
  private lastFgData: FlightGearSensorData | null = null;

  // SITL's address - discovered when we receive servo data from SITL
  private sitlAddress: { host: string; port: number } | null = null;

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
      xplaneServerPort: config.xplaneServerPort || DEFAULT_XPLANE_SERVER_PORT,
    };

    try {
      // Create UDP sockets
      this.fgReceiver = dgram.createSocket('udp4');
      this.fgSender = dgram.createSocket('udp4');
      this.xplaneServer = dgram.createSocket('udp4');

      // Set up FlightGear receiver (port 5505)
      this.fgReceiver.on('message', (msg, rinfo) => {
        if (!this.lastFgData) {
          console.log(`[Bridge] First packet from FlightGear! ${msg.length} bytes from ${rinfo.address}:${rinfo.port}`);
        }
        this.handleFlightGearData(msg);
      });

      this.fgReceiver.on('error', (err) => {
        console.error('[Bridge] FlightGear receiver error:', err);
      });

      // Set up X-Plane server (port 49000) - receives from SITL
      this.xplaneServer.on('message', (msg, rinfo) => {
        // Discover SITL's ephemeral port from incoming packets
        // Only log once when first connected
        if (!this.sitlAddress) {
          console.log(`[Bridge] SITL connected from ${rinfo.address}:${rinfo.port}`);
        }
        this.sitlAddress = { host: rinfo.address, port: rinfo.port };
        this.handleSitlData(msg);
      });

      this.xplaneServer.on('error', (err) => {
        console.error('[Bridge] X-Plane server error:', err);
      });

      // Bind FlightGear receiver to port 5505
      await new Promise<void>((resolve, reject) => {
        this.fgReceiver!.bind(this.config.fgOutPort, '0.0.0.0', () => {
          console.log(`[Bridge] Listening for FlightGear on port ${this.config.fgOutPort}`);
          resolve();
        });
        this.fgReceiver!.once('error', reject);
      });

      // Bind X-Plane server to port 49000 (act as X-Plane)
      await new Promise<void>((resolve, reject) => {
        this.xplaneServer!.bind(this.config.xplaneServerPort, '0.0.0.0', () => {
          console.log(`[Bridge] X-Plane server listening on port ${this.config.xplaneServerPort} (waiting for SITL)`);
          resolve();
        });
        this.xplaneServer!.once('error', reject);
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
    this.sitlAddress = null;
    this.registeredDrefs.clear();
    this.rrefPacketsReceived = 0;
    this.packetsSent = 0;
    this.lastFgData = null;
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
      closeSocket(this.xplaneServer),
    ]);

    this.fgReceiver = null;
    this.fgSender = null;
    this.xplaneServer = null;
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

    // Convert to X-Plane format and send to SITL (if connected)
    this.sendToSitl(data);
  }

  // Track registered datarefs from SITL
  private registeredDrefs: Map<number, string> = new Map();
  private rrefPacketsReceived = 0;

  /**
   * Handle incoming SITL data (RREF registration requests or servo outputs)
   */
  private handleSitlData(buffer: Buffer): void {
    if (buffer.length < 5) return;

    const header = buffer.toString('ascii', 0, 4);

    // RREF subscription request from SITL
    if (header === 'RREF') {
      this.handleRrefRequest(buffer);
      return;
    }

    // DREF write command from SITL (setting values like joystick, throttle)
    // Format: "DREF" + null + value(4 float) + dataref(500 bytes)
    if (header === 'DREF') {
      // SITL sends these to set control values - we can ignore them
      // (they would go to X-Plane to move controls, but we don't need them)
      return;
    }

    // Debug: log unknown packet types
    console.log(`[Bridge] Unknown packet from SITL: header="${header}", len=${buffer.length}, hex=${buffer.subarray(0, Math.min(20, buffer.length)).toString('hex')}`);
  }

  /**
   * Handle RREF subscription request from SITL
   * X-Plane RREF format: "RREF\0" (5 bytes) + freq(4 bytes) + index(4 bytes) + dataref_path(400 bytes) = 413 bytes
   */
  private handleRrefRequest(buffer: Buffer): void {
    if (buffer.length < 413) {
      console.log(`[Bridge] Short RREF request: ${buffer.length} bytes`);
      return;
    }

    // Format: "RREF" + null byte + freq(4) + index(4) + dataref(400)
    // Offsets: 0-3="RREF", 4=null, 5-8=freq, 9-12=index, 13-412=dataref
    const freq = buffer.readInt32LE(5);  // Frequency (Hz)
    const index = buffer.readInt32LE(9); // Index SITL wants us to use when sending back
    const datarefPath = buffer.toString('ascii', 13, 413).replace(/\0+$/, ''); // Null-terminated string

    this.rrefPacketsReceived++;

    // Log all GPS-related datarefs and first 30 registrations
    const isGpsRelated = datarefPath.includes('latitude') ||
                         datarefPath.includes('longitude') ||
                         datarefPath.includes('elevation') ||
                         datarefPath.includes('groundspeed') ||
                         datarefPath.includes('hpath');

    if (this.rrefPacketsReceived <= 30 || isGpsRelated) {
      const gpsTag = isGpsRelated ? ' [GPS]' : '';
      console.log(`[Bridge] RREF registration #${this.rrefPacketsReceived}: freq=${freq}Hz, index=${index}, dref="${datarefPath}"${gpsTag}`);
    }

    // Store the registration
    this.registeredDrefs.set(index, datarefPath);
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

  private packetsSent = 0;

  // Dataref name to FlightGear data mapping
  private getDatarefValue(dataref: string, data: FlightGearSensorData): number | null {
    // Map X-Plane datarefs to FlightGear data
    // These are the datarefs iNav SITL typically requests
    const mapping: Record<string, number> = {
      // Position
      'sim/flightmodel/position/latitude': data.latitude,
      'sim/flightmodel/position/longitude': data.longitude,
      'sim/flightmodel/position/elevation': data.altitudeMsl * 0.3048, // ft to meters
      'sim/flightmodel/position/y_agl': data.altitudeAgl * 0.3048, // ft to meters

      // Attitude
      'sim/flightmodel/position/phi': data.roll,      // roll deg
      'sim/flightmodel/position/theta': data.pitch,   // pitch deg
      'sim/flightmodel/position/psi': data.heading,   // heading deg
      'sim/flightmodel/position/true_psi': data.heading,
      'sim/flightmodel/position/mag_psi': data.heading,

      // Angular rates (deg/s to rad/s)
      'sim/flightmodel/position/P': data.rollRate * Math.PI / 180,
      'sim/flightmodel/position/Q': data.pitchRate * Math.PI / 180,
      'sim/flightmodel/position/R': data.yawRate * Math.PI / 180,

      // Velocities
      'sim/flightmodel/position/indicated_airspeed': data.airspeed * 0.514444, // kt to m/s
      'sim/flightmodel/position/true_airspeed': data.airspeed * 0.514444,
      'sim/flightmodel/position/groundspeed': data.groundspeed * 0.514444,
      'sim/flightmodel/position/vh_ind_fpm': data.verticalSpeed * 60, // fps to fpm
      'sim/flightmodel/position/vh_ind': data.verticalSpeed * 0.3048, // fps to m/s

      // Body velocities (fps to m/s)
      'sim/flightmodel/position/local_vx': data.uBody * 0.3048,
      'sim/flightmodel/position/local_vy': data.vBody * 0.3048,
      'sim/flightmodel/position/local_vz': data.wBody * 0.3048,

      // Accelerations in g units (X-Plane expects g, not m/s²!)
      // Note: Z-axis sign flipped - iNav expects positive for "up" (lift),
      // but FlightGear sends negative for upward acceleration
      'sim/flightmodel/forces/g_axil': data.accelX,
      'sim/flightmodel/forces/g_side': data.accelY,
      'sim/flightmodel/forces/g_nrml': -data.accelZ,

      // Flight path
      'sim/flightmodel/position/hpath': data.heading, // horizontal flight path (same as heading for now)

      // GPS status (fake GPS based on position data we have)
      'sim/cockpit/radios/gps_has_fix': 1, // Tell SITL we have GPS fix
      'sim/cockpit2/radios/indicators/gps_num_sats': 12, // Fake satellite count
      'sim/cockpit/radios/gps_dme_dist_m': 0, // No DME distance
      'sim/cockpit2/radios/indicators/gps_bearing_deg_mag': data.heading,

      // Environment
      'sim/weather/temperature_ambient_c': data.temperature,
      'sim/weather/barometer_sealevel_inhg': data.pressure,
      'sim/weather/barometer_current_inhg': data.pressure, // current barometer (same as sea level for now)

      // Simulation time
      'sim/time/total_running_time_sec': data.simTime,

      // Joystick/RC inputs - iNav SITL X-Plane interface
      // iNav SITL requests specific indices - provide all commonly requested ones
      // Values: -1.0 to 1.0 for axes
      'sim/joystick/has_joystick': 1, // Tell SITL a joystick is connected
      // Standard axes (indices 1-3)
      'sim/joystick/joy_mapped_axis_value[1]': virtualRCState.pitch,
      'sim/joystick/joy_mapped_axis_value[2]': virtualRCState.yaw,
      'sim/joystick/joy_mapped_axis_value[3]': virtualRCState.throttle,
      // iNav requests indices 57-61 for AUX channels
      'sim/joystick/joy_mapped_axis_value[57]': virtualRCState.roll,
      'sim/joystick/joy_mapped_axis_value[58]': virtualRCState.aux1,
      'sim/joystick/joy_mapped_axis_value[59]': virtualRCState.aux2,
      'sim/joystick/joy_mapped_axis_value[60]': virtualRCState.aux3,
      'sim/joystick/joy_mapped_axis_value[61]': virtualRCState.aux4,
    };

    return mapping[dataref] ?? null;
  }

  /**
   * Send data to iNav SITL in X-Plane RREF format
   * Sends to SITL's ephemeral port (discovered from incoming packets)
   */
  private sendToSitl(data: FlightGearSensorData): void {
    if (!this.xplaneServer || !this.running) return;

    // Wait for SITL to connect and register datarefs
    if (!this.sitlAddress || this.registeredDrefs.size === 0) {
      return;
    }

    // Build RREF response packet with all registered datarefs
    // Format: "RREF" + (index(4) + value(4))*
    const values: Array<{ index: number; value: number }> = [];

    for (const [index, dataref] of this.registeredDrefs) {
      const value = this.getDatarefValue(dataref, data);
      if (value !== null) {
        values.push({ index, value });
      }
    }

    this.packetsSent++;
    if (this.packetsSent === 1) {
      console.log(`[Bridge] Sending RREF to SITL at ${this.sitlAddress.host}:${this.sitlAddress.port}`);
      console.log(`[Bridge] Registered ${this.registeredDrefs.size} datarefs, sending ${values.length} values:`);
      for (const { index, value } of values) {
        const dref = this.registeredDrefs.get(index);
        console.log(`[Bridge]   index=${index}, dref="${dref}", value=${value}`);
      }
    }
    // Log GPS values every 300 packets (~30 seconds at 10Hz) for debugging
    if (this.packetsSent % 300 === 0) {
      const gpsValues = values.filter(({ index }) => {
        const dref = this.registeredDrefs.get(index);
        return dref && (dref.includes('latitude') || dref.includes('longitude') ||
                       dref.includes('elevation') || dref.includes('groundspeed') || dref.includes('hpath'));
      });
      if (gpsValues.length > 0) {
        console.log(`[Bridge] GPS values (packet ${this.packetsSent}):`);
        for (const { index, value } of gpsValues) {
          const dref = this.registeredDrefs.get(index);
          console.log(`[Bridge]   ${dref}: ${value}`);
        }
      } else {
        console.log(`[Bridge] WARNING: No GPS datarefs registered! GPS will not work.`);
      }
    }

    if (values.length === 0) return;

    // Send RREF response
    // iNav expects: "RREF" (4) + null (1) + pairs of (index 4 + float 4)
    // iNav parses starting at byte 5, so we need the null byte
    const buffer = Buffer.alloc(5 + values.length * 8);
    buffer.write('RREF', 0);
    buffer.writeUInt8(0, 4); // null byte after header

    let offset = 5;
    for (const { index, value } of values) {
      buffer.writeInt32LE(index, offset);
      buffer.writeFloatLE(value, offset + 4);
      offset += 8;
    }

    this.xplaneServer.send(buffer, this.sitlAddress.port, this.sitlAddress.host);
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

    this.fgSender.send(buffer, this.config.fgInPort, '127.0.0.1');
  }

  /**
   * Get last received FlightGear data (for debugging)
   */
  getLastData(): FlightGearSensorData | null {
    return this.lastFgData;
  }

  /**
   * Check if SITL is connected
   */
  isSitlConnected(): boolean {
    return this.sitlAddress !== null;
  }
}

// =============================================================================
// Virtual RC State
// =============================================================================

/**
 * Virtual RC channel values for SITL testing.
 * Values are -1.0 to +1.0 (maps to 1000-2000 PWM)
 * -1 = 1000 PWM, 0 = 1500 PWM, +1 = 2000 PWM
 */
export interface VirtualRCState {
  roll: number;      // -1 to +1
  pitch: number;     // -1 to +1
  yaw: number;       // -1 to +1
  throttle: number;  // -1 to +1 (but typically 0-1 for safety)
  aux1: number;      // -1 to +1
  aux2: number;      // -1 to +1
  aux3: number;      // -1 to +1
  aux4: number;      // -1 to +1 (ARM switch is typically here)
}

// Default RC state (all centered except throttle at minimum)
const defaultRCState: VirtualRCState = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: -1,  // Minimum for safety
  aux1: 0,
  aux2: 0,
  aux3: 0,
  aux4: 0,
};

// Global virtual RC state
let virtualRCState: VirtualRCState = { ...defaultRCState };

/**
 * Set virtual RC channel values
 * These will be sent to SITL via the bridge's joystick dataref mappings
 */
export function setVirtualRC(state: Partial<VirtualRCState>): void {
  virtualRCState = { ...virtualRCState, ...state };
  console.log('[Bridge] Virtual RC updated:', virtualRCState);
}

/**
 * Get current virtual RC state
 */
export function getVirtualRC(): VirtualRCState {
  return { ...virtualRCState };
}

/**
 * Reset virtual RC to defaults
 */
export function resetVirtualRC(): void {
  virtualRCState = { ...defaultRCState };
  console.log('[Bridge] Virtual RC reset to defaults');
}

/**
 * Convert normalized value (-1 to +1) to PWM (1000-2000)
 */
export function normalizedToPWM(value: number): number {
  return Math.round(1500 + (value * 500));
}

// Singleton instance
export const protocolBridge = new ProtocolBridge();
