/**
 * MSP Ports Tab
 *
 * UART function assignment table for MSP boards (iNav/Betaflight).
 * Reads/writes serial config via MSP2_COMMON_CF_SERIAL_CONFIG.
 */

import React, { useEffect, useState } from 'react';
import { useReceiverStore, type SerialPort } from '../../stores/receiver-store';
import { useConnectionStore } from '../../stores/connection-store';
import {
  BOARD_UART_LABELS,
} from '../../../shared/board-uart-labels';
import {
  Cable,
  AlertTriangle,
  Usb,
  Cpu,
  HelpCircle,
} from 'lucide-react';

// =============================================================================
// Constants
// =============================================================================

const BAUD_RATES = [
  'AUTO', '1200', '2400', '4800', '9600', '19200', '38400',
  '57600', '115200', '230400', '250000', '460800', '921600',
];

/** Function bit positions */
const BIT = {
  MSP: 0,
  GPS: 1,
  TELEMETRY_FRSKY: 2,
  TELEMETRY_HOTT: 3,
  TELEMETRY_LTM: 4,
  TELEMETRY_SMARTPORT: 5,
  RX_SERIAL: 6,
  BLACKBOX: 7,
  TELEMETRY_MAVLINK: 8,
  TELEMETRY_IBUS: 9,
  RUNCAM_DEVICE_CONTROL: 10,
  TBS_SMARTAUDIO: 11,
  IRC_TRAMP: 12,
  OPFLOW: 14,
  RANGEFINDER: 16,
  VTX_FFPV: 17,
  ESC: 18,
  DJI_FPV: 21,
  SBUS_OUTPUT: 22,
  SMARTPORT_MASTER: 23,
  MSP_DISPLAYPORT: 25,
  GIMBAL: 26,
  HEADTRACKER: 27,
} as const;

const SENSOR_OPTIONS = [
  { label: 'None', mask: 0 },
  { label: 'GPS', bit: BIT.GPS },
  { label: 'Rangefinder', bit: BIT.RANGEFINDER },
  { label: 'Optic Flow', bit: BIT.OPFLOW },
];

const TELEMETRY_OPTIONS = [
  { label: 'None', mask: 0 },
  { label: 'FrSky', bit: BIT.TELEMETRY_FRSKY },
  { label: 'HOTT', bit: BIT.TELEMETRY_HOTT },
  { label: 'SmartPort', bit: BIT.TELEMETRY_SMARTPORT },
  { label: 'LTM', bit: BIT.TELEMETRY_LTM },
  { label: 'MAVLink', bit: BIT.TELEMETRY_MAVLINK },
  { label: 'iBUS', bit: BIT.TELEMETRY_IBUS },
];

const PERIPHERAL_OPTIONS = [
  { label: 'None', mask: 0 },
  { label: 'Blackbox', bit: BIT.BLACKBOX },
  { label: 'RunCam', bit: BIT.RUNCAM_DEVICE_CONTROL },
  { label: 'SmartAudio', bit: BIT.TBS_SMARTAUDIO },
  { label: 'IRC Tramp', bit: BIT.IRC_TRAMP },
  { label: 'DJI FPV', bit: BIT.DJI_FPV },
  { label: 'MSP Displayport', bit: BIT.MSP_DISPLAYPORT },
  { label: 'ESC', bit: BIT.ESC },
  { label: 'VTX FFPV', bit: BIT.VTX_FFPV },
  { label: 'SBUS Out', bit: BIT.SBUS_OUTPUT },
  { label: 'SmartPort Master', bit: BIT.SMARTPORT_MASTER },
  { label: 'Gimbal', bit: BIT.GIMBAL },
  { label: 'Headtracker', bit: BIT.HEADTRACKER },
];

// =============================================================================
// Helpers
// =============================================================================

function getPortName(identifier: number): string {
  if (identifier === 20) return 'USB VCP';
  if (identifier === 30) return 'SOFTSERIAL1';
  if (identifier === 31) return 'SOFTSERIAL2';
  if (identifier >= 0 && identifier <= 7) return `UART${identifier + 1}`;
  return `PORT${identifier}`;
}

function hasBit(mask: number, bit: number): boolean {
  return (mask & (1 << bit)) !== 0;
}

function setBit(mask: number, bit: number, on: boolean): number {
  if (on) return mask | (1 << bit);
  return mask & ~(1 << bit);
}

/** Get the active sensor from the mask (only one at a time) */
function getActiveSensor(mask: number): number {
  for (const opt of SENSOR_OPTIONS) {
    if ('bit' in opt && hasBit(mask, opt.bit as number)) return opt.bit as number;
  }
  return -1;
}

/** Get the active telemetry from the mask (only one at a time) */
function getActiveTelemetry(mask: number): number {
  for (const opt of TELEMETRY_OPTIONS) {
    if ('bit' in opt && hasBit(mask, opt.bit as number)) return opt.bit as number;
  }
  return -1;
}

/** Get the active peripheral from the mask */
function getActivePeripheral(mask: number): number {
  for (const opt of PERIPHERAL_OPTIONS) {
    if ('bit' in opt && hasBit(mask, opt.bit as number)) return opt.bit as number;
  }
  return -1;
}

/** Clear all bits for a category */
function clearCategoryBits(mask: number, options: Array<{ bit?: number }>): number {
  let result = mask;
  for (const opt of options) {
    if (opt.bit !== undefined) result = setBit(result, opt.bit, false);
  }
  return result;
}

// =============================================================================
// Port Row Component
// =============================================================================

interface PortRowProps {
  port: SerialPort;
  boardLabel?: string;
  isVcp: boolean;
  isSoftSerial: boolean;
  onUpdateFunction: (identifier: number, newMask: number) => void;
  onUpdateBaudrate: (identifier: number, category: 'msp' | 'sensors' | 'telemetry' | 'peripherals', baudIndex: number) => void;
}

function PortRow({ port, boardLabel, isVcp, isSoftSerial, onUpdateFunction, onUpdateBaudrate }: PortRowProps) {
  const portName = getPortName(port.identifier);
  const hasMsp = hasBit(port.functionMask, BIT.MSP);
  const hasRx = hasBit(port.functionMask, BIT.RX_SERIAL);
  const activeSensor = getActiveSensor(port.functionMask);
  const activeTelemetry = getActiveTelemetry(port.functionMask);
  const activePeripheral = getActivePeripheral(port.functionMask);

  const handleMspToggle = () => {
    if (isVcp) return; // Don't allow toggling MSP on VCP
    const newMask = setBit(port.functionMask, BIT.MSP, !hasMsp);
    onUpdateFunction(port.identifier, newMask);
  };

  const handleRxToggle = () => {
    const newMask = setBit(port.functionMask, BIT.RX_SERIAL, !hasRx);
    onUpdateFunction(port.identifier, newMask);
  };

  const handleSensorChange = (value: string) => {
    let newMask = clearCategoryBits(port.functionMask, SENSOR_OPTIONS);
    const bit = Number(value);
    if (bit >= 0) newMask = setBit(newMask, bit, true);
    onUpdateFunction(port.identifier, newMask);
  };

  const handleTelemetryChange = (value: string) => {
    let newMask = clearCategoryBits(port.functionMask, TELEMETRY_OPTIONS);
    const bit = Number(value);
    if (bit >= 0) newMask = setBit(newMask, bit, true);
    onUpdateFunction(port.identifier, newMask);
  };

  const handlePeripheralChange = (value: string) => {
    let newMask = clearCategoryBits(port.functionMask, PERIPHERAL_OPTIONS);
    const bit = Number(value);
    if (bit >= 0) newMask = setBit(newMask, bit, true);
    onUpdateFunction(port.identifier, newMask);
  };

  const selectStyle = 'bg-zinc-800 text-zinc-300 text-xs rounded px-1.5 py-1 border border-zinc-700 focus:border-blue-500 focus:outline-none w-full';

  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
      {/* Port name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isVcp ? (
            <Usb className="w-3.5 h-3.5 text-zinc-500" />
          ) : isSoftSerial ? (
            <Cpu className="w-3.5 h-3.5 text-amber-500" />
          ) : (
            <Cable className="w-3.5 h-3.5 text-zinc-500" />
          )}
          <div>
            <span className="text-sm text-zinc-200">{portName}</span>
            {boardLabel && (
              <p className="text-[10px] text-zinc-500 leading-tight">{boardLabel}</p>
            )}
          </div>
        </div>
      </td>

      {/* MSP */}
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={hasMsp}
          onChange={handleMspToggle}
          disabled={isVcp}
          className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
        />
      </td>

      {/* Sensors */}
      <td className="px-2 py-2.5">
        <select value={activeSensor} onChange={(e) => handleSensorChange(e.target.value)} className={selectStyle}>
          {SENSOR_OPTIONS.map((opt) => (
            <option key={opt.label} value={'bit' in opt ? opt.bit : -1}>{opt.label}</option>
          ))}
        </select>
      </td>

      {/* Telemetry */}
      <td className="px-2 py-2.5">
        <select value={activeTelemetry} onChange={(e) => handleTelemetryChange(e.target.value)} className={selectStyle}>
          {TELEMETRY_OPTIONS.map((opt) => (
            <option key={opt.label} value={'bit' in opt ? opt.bit : -1}>{opt.label}</option>
          ))}
        </select>
      </td>

      {/* RX */}
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={hasRx}
          onChange={handleRxToggle}
          className="rounded border-zinc-600 bg-zinc-800 text-green-500 focus:ring-green-500 focus:ring-offset-0"
        />
      </td>

      {/* Peripherals */}
      <td className="px-2 py-2.5">
        <select value={activePeripheral} onChange={(e) => handlePeripheralChange(e.target.value)} className={selectStyle}>
          {PERIPHERAL_OPTIONS.map((opt) => (
            <option key={opt.label} value={'bit' in opt ? opt.bit : -1}>{opt.label}</option>
          ))}
        </select>
      </td>

      {/* MSP Baud */}
      <td className="px-2 py-2.5">
        <select
          value={port.mspBaudrate}
          onChange={(e) => onUpdateBaudrate(port.identifier, 'msp', Number(e.target.value))}
          className={selectStyle}
        >
          {BAUD_RATES.map((rate, i) => (
            <option key={rate} value={i}>{rate}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface PortsTabProps {
  modified: boolean;
  setModified: (modified: boolean) => void;
}

export default function PortsTab({ modified, setModified }: PortsTabProps) {
  const connection = useConnectionStore((s) => s.connectionState);
  const {
    serialConfig,
    loadConfig,
    isLoading,
    updatePortFunction,
    updatePortBaudrate,
    hasChanges,
  } = useReceiverStore();

  const [showRxWarning, setShowRxWarning] = useState(false);

  const boardId = connection?.boardId ?? '';
  const boardLabels = BOARD_UART_LABELS[boardId] ?? {};

  useEffect(() => {
    if (!serialConfig) loadConfig();
  }, []);

  useEffect(() => {
    setModified(hasChanges());
  }, [serialConfig, hasChanges, setModified]);

  // Handle RX_SERIAL uniqueness: enabling on one port clears from others
  const handleUpdateFunction = (identifier: number, newMask: number) => {
    const RX_BIT = 1 << BIT.RX_SERIAL;
    const isSettingRx = (newMask & RX_BIT) !== 0;

    if (isSettingRx && serialConfig) {
      // Clear RX_SERIAL from all other ports
      for (const port of serialConfig.ports) {
        if (port.identifier !== identifier && (port.functionMask & RX_BIT)) {
          updatePortFunction(port.identifier, port.functionMask & ~RX_BIT);
        }
      }
    }

    updatePortFunction(identifier, newMask);
  };

  if (isLoading || !serialConfig) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        Loading port configuration...
      </div>
    );
  }

  // Sort: VCP first, then UARTs in order, then soft serial
  const sortedPorts = [...serialConfig.ports].sort((a, b) => {
    if (a.identifier === 20) return -1;
    if (b.identifier === 20) return 1;
    return a.identifier - b.identifier;
  });

  return (
    <div className="max-w-full space-y-4">
      {/* Port table card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cable className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">UART Port Configuration</h3>
            <p className="text-xs text-gray-500">Configure UART functions. Only one port can have Serial RX enabled. Save + reboot to apply.</p>
          </div>
        </div>
        {/* How this works banner */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border border-sky-500/20 mb-4">
          <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-300 leading-relaxed">
            <span className="font-semibold text-sky-300">How this works: </span>
            Each row is a physical UART connector on your board. Enable <span className="text-zinc-200">RX</span> on the UART your receiver is wired to.
            Set <span className="text-zinc-200">Sensors</span> for GPS or rangefinder, and <span className="text-zinc-200">Peripherals</span> for OSD or VTX control. Save and reboot to apply.
          </p>
        </div>
        <div className="rounded-lg border border-gray-700/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-800/50 text-zinc-400 text-xs">
                <th className="px-3 py-2.5 text-left font-medium w-40">Port</th>
                <th className="px-3 py-2.5 text-center font-medium w-16">MSP</th>
                <th className="px-2 py-2.5 text-left font-medium w-28">Sensors</th>
                <th className="px-2 py-2.5 text-left font-medium w-28">Telemetry</th>
                <th className="px-3 py-2.5 text-center font-medium w-16">RX</th>
                <th className="px-2 py-2.5 text-left font-medium w-32">Peripherals</th>
                <th className="px-2 py-2.5 text-left font-medium w-24">Baud</th>
              </tr>
            </thead>
            <tbody>
              {sortedPorts.map((port) => {
                const isVcp = port.identifier === 20;
                const isSoftSerial = port.identifier >= 30;
                return (
                  <PortRow
                    key={port.identifier}
                    port={port}
                    boardLabel={boardLabels[port.identifier]}
                    isVcp={isVcp}
                    isSoftSerial={isSoftSerial}
                    onUpdateFunction={handleUpdateFunction}
                    onUpdateBaudrate={updatePortBaudrate}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Common setup examples */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
        <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
          <p className="font-semibold text-blue-300">Common setups</p>
          <p>SBUS receiver: Enable <span className="text-zinc-200">RX</span> on the UART with the SBUS pad (usually has a built-in inverter)</p>
          <p>GPS module: Set <span className="text-zinc-200">Sensors → GPS</span> on the UART it's connected to, baud <span className="text-zinc-200">115200</span></p>
          <p>DJI goggles: Set <span className="text-zinc-200">Peripherals → MSP Displayport</span> on the DJI UART</p>
        </div>
      </div>

      {/* Soft serial warning */}
      {sortedPorts.some((p) => p.identifier >= 30) && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              Soft serial ports have limited bandwidth and are not suitable for high-speed protocols like CRSF or GPS.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
