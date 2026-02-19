/**
 * MAVLink Serial Ports Tab
 *
 * Friendly UI over ArduPilot SERIAL0-7_PROTOCOL and SERIAL0-7_BAUD parameters.
 * Presents serial port configuration in a table layout.
 * Follows the flat card layout pattern used by PID/Rates tabs.
 */

import React, { useMemo } from 'react';
import { Cable, Usb, AlertTriangle, HelpCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';

// =============================================================================
// Constants
// =============================================================================

/** ArduPilot serial protocol options */
const SERIAL_PROTOCOLS: { value: number; label: string }[] = [
  { value: -1, label: 'None' },
  { value: 1, label: 'MAVLink1' },
  { value: 2, label: 'MAVLink2' },
  { value: 4, label: 'SBus Out' },
  { value: 5, label: 'GPS' },
  { value: 7, label: 'Alexmos Gimbal' },
  { value: 8, label: 'SToRM32 Gimbal' },
  { value: 9, label: 'Rangefinder' },
  { value: 10, label: 'FrSky SPort' },
  { value: 11, label: 'Lidar360' },
  { value: 12, label: 'Beacon' },
  { value: 13, label: 'Volz Servo' },
  { value: 14, label: 'SBus Out' },
  { value: 15, label: 'ESC Telemetry' },
  { value: 16, label: 'Devo Telemetry' },
  { value: 17, label: 'OpticalFlow' },
  { value: 18, label: 'RobotisServo' },
  { value: 19, label: 'NMEAOutput' },
  { value: 20, label: 'WindVane' },
  { value: 21, label: 'SLCAN' },
  { value: 22, label: 'RCIN' },
  { value: 23, label: 'MegaSquirt' },
  { value: 24, label: 'DJI FPV' },
  { value: 25, label: 'SmartAudio' },
  { value: 26, label: 'DroneCAN' },
  { value: 28, label: 'Scripting' },
  { value: 29, label: 'CrossFire MAVLink' },
  { value: 30, label: 'Generator' },
  { value: 31, label: 'Winch' },
  { value: 32, label: 'MSP' },
  { value: 33, label: 'DisplayPort' },
  { value: 34, label: 'MAVLink HL' },
  { value: 35, label: 'IRC Tramp' },
  { value: 36, label: 'DDS XRCE' },
  { value: 37, label: 'IMUOUT' },
  { value: 38, label: 'RCIN' },
];

/** ArduPilot baud rate encoding (stored as baud/1 for exact or baud/1000 for common) */
const BAUD_RATES: { value: number; label: string }[] = [
  { value: 1, label: '1200' },
  { value: 2, label: '2400' },
  { value: 4, label: '4800' },
  { value: 9, label: '9600' },
  { value: 19, label: '19200' },
  { value: 38, label: '38400' },
  { value: 57, label: '57600' },
  { value: 111, label: '111100' },
  { value: 115, label: '115200' },
  { value: 230, label: '230400' },
  { value: 256, label: '256000' },
  { value: 460, label: '460800' },
  { value: 500, label: '500000' },
  { value: 921, label: '921600' },
  { value: 1500, label: '1500000' },
  { value: 2000, label: '2000000' },
];

/** Default labels for serial ports */
const PORT_LABELS: Record<number, string> = {
  0: 'USB',
  1: 'TELEM1',
  2: 'TELEM2',
  3: 'GPS1',
  4: 'GPS2',
  5: 'Serial5',
  6: 'Serial6',
  7: 'Serial7',
};

// =============================================================================
// Port Row Component
// =============================================================================

function PortRow({ index }: { index: number }) {
  const { parameters, setParameter } = useParameterStore();
  const protocolParam = `SERIAL${index}_PROTOCOL`;
  const baudParam = `SERIAL${index}_BAUD`;

  const protocol = parameters.get(protocolParam)?.value ?? -1;
  const baud = parameters.get(baudParam)?.value ?? 115;
  const label = PORT_LABELS[index] ?? `Serial${index}`;
  const isUsb = index === 0;

  const isRcin = Number(protocol) === 22 || Number(protocol) === 38;
  const isMavlink = Number(protocol) === 1 || Number(protocol) === 2;

  const selectStyle = 'bg-zinc-800 text-zinc-300 text-xs rounded px-1.5 py-1 border border-zinc-700 focus:border-blue-500 focus:outline-none w-full';

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
      {/* Port name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isUsb ? (
            <Usb className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <Cable className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <div>
            <span className="text-sm text-zinc-200">SERIAL{index}</span>
            <p className="text-[10px] text-zinc-500 leading-tight">{label}</p>
          </div>
        </div>
      </td>

      {/* Protocol */}
      <td className="px-2 py-2.5">
        <select
          value={Number(protocol)}
          onChange={(e) => setParameter(protocolParam, Number(e.target.value))}
          className={selectStyle}
        >
          {SERIAL_PROTOCOLS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </td>

      {/* Baud */}
      <td className="px-2 py-2.5">
        <select
          value={Number(baud)}
          onChange={(e) => setParameter(baudParam, Number(e.target.value))}
          className={selectStyle}
        >
          {BAUD_RATES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </td>

      {/* Status indicator */}
      <td className="px-3 py-2.5 text-center">
        {isRcin && (
          <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-green-500/10 text-green-400 border border-green-500/30 rounded">
            RC Input
          </span>
        )}
        {isMavlink && (
          <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded">
            MAVLink
          </span>
        )}
      </td>
    </tr>
  );
}

// =============================================================================
// Main Component
// =============================================================================

const SerialPortsTab: React.FC = () => {
  const { parameters } = useParameterStore();

  // Determine how many serial ports exist by checking parameters
  const portCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i <= 7; i++) {
      if (parameters.has(`SERIAL${i}_PROTOCOL`)) {
        count = i + 1;
      }
    }
    return Math.max(count, 1); // At least USB
  }, [parameters]);

  // Check if any port has RCIN protocol
  const hasRcin = useMemo(() => {
    for (let i = 0; i < portCount; i++) {
      const proto = parameters.get(`SERIAL${i}_PROTOCOL`)?.value;
      if (Number(proto) === 22 || Number(proto) === 38) return true;
    }
    return false;
  }, [parameters, portCount]);

  return (
    <div className="p-6 space-y-6">
      {/* Port table card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cable className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Serial Port Configuration</h3>
            <p className="text-xs text-gray-500">Configure protocols and baud rates. Changes require Write to Flash + reboot.</p>
          </div>
        </div>
        {/* How this works banner */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border border-sky-500/20 mb-4">
          <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-sky-300">How this works: </span>
            Each row is a serial port on your flight controller. Set the protocol to match what's physically wired to that port — like <span className="text-zinc-200">RCIN</span> for your receiver or <span className="text-zinc-200">GPS</span> for a GPS module.
          </p>
        </div>
        <div className="rounded-lg border border-gray-700/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800/50 text-zinc-400 text-xs">
                <th className="px-3 py-2.5 text-left font-medium w-36">Port</th>
                <th className="px-2 py-2.5 text-left font-medium w-44">Protocol</th>
                <th className="px-2 py-2.5 text-left font-medium w-32">Baud Rate</th>
                <th className="px-3 py-2.5 text-center font-medium w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: portCount }, (_, i) => (
                <PortRow key={i} index={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Common setup examples */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
          <p className="font-semibold text-blue-300">Common setups</p>
          <p>ELRS/CRSF receiver: Set one port to <span className="text-zinc-200">RCIN</span> at <span className="text-zinc-200">115200</span> baud</p>
          <p>GPS module: Set to <span className="text-zinc-200">GPS</span> protocol at <span className="text-zinc-200">115200</span> or <span className="text-zinc-200">230400</span> baud</p>
          <p>Telemetry radio: Usually <span className="text-zinc-200">MAVLink2</span> at <span className="text-zinc-200">57600</span> baud on TELEM1</p>
        </div>
      </div>

      {/* No RCIN warning */}
      {!hasRcin && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              No serial port is configured for RC Input (RCIN protocol). Your receiver will not work
              unless a port is set to RCIN or the receiver is connected via DroneCAN/PPM.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SerialPortsTab;
