/**
 * MAVLink Serial Ports Tab
 *
 * Friendly UI over ArduPilot SERIAL0-7_PROTOCOL and SERIAL0-7_BAUD parameters.
 * Presents serial port configuration in a table layout.
 * Follows the flat card layout pattern used by PID/Rates tabs.
 */

import React, { useMemo } from 'react';

/** Prefer the i18n key; falls back to the literal. */
function spText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import { Cable, Usb, AlertTriangle, HelpCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';

// =============================================================================
// Constants
// =============================================================================

/** ArduPilot serial protocol options (from AP_SerialManager.h) */
const SERIAL_PROTOCOLS: { value: number; label: string }[] = [
  { value: -1, label: 'None' },
  { value: 1, label: 'MAVLink1' },
  { value: 2, label: 'MAVLink2' },
  { value: 3, label: 'FrSky D' },
  { value: 4, label: 'FrSky SPort' },
  { value: 5, label: 'GPS' },
  { value: 7, label: 'Alexmos Gimbal' },
  { value: 8, label: 'SToRM32 Gimbal' },
  { value: 9, label: 'Rangefinder' },
  { value: 10, label: 'FrSky Passthrough' },
  { value: 11, label: 'Lidar360' },
  { value: 13, label: 'Beacon' },
  { value: 14, label: 'Volz Servo' },
  { value: 15, label: 'SBus Out' },
  { value: 16, label: 'ESC Telemetry' },
  { value: 17, label: 'Devo Telemetry' },
  { value: 18, label: 'OpticalFlow' },
  { value: 19, label: 'Robotis Servo' },
  { value: 20, label: 'NMEA Output' },
  { value: 21, label: 'WindVane' },
  { value: 22, label: 'SLCAN' },
  { value: 23, label: 'RCIN' },
  { value: 24, label: 'MegaSquirt EFI' },
  { value: 25, label: 'LTM Telemetry' },
  { value: 26, label: 'RunCam' },
  { value: 27, label: 'HoTT Telemetry' },
  { value: 28, label: 'Scripting' },
  { value: 29, label: 'Crossfire (CRSF)' },
  { value: 30, label: 'Generator' },
  { value: 31, label: 'Winch' },
  { value: 32, label: 'MSP' },
  { value: 33, label: 'DJI FPV OSD' },
  { value: 34, label: 'AirSpeed' },
  { value: 35, label: 'ADSB' },
  { value: 36, label: 'AHRS' },
  { value: 37, label: 'SmartAudio' },
  { value: 38, label: 'FETtec OneWire' },
  { value: 39, label: 'Torqeedo' },
  { value: 40, label: 'AIS' },
  { value: 41, label: 'CoDevESC' },
  { value: 42, label: 'MSP DisplayPort' },
  { value: 43, label: 'MAVLink HL' },
  { value: 44, label: 'IRC Tramp' },
  { value: 45, label: 'DDS XRCE' },
  { value: 46, label: 'IMUOUT' },
  { value: 48, label: 'PPP' },
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
// PX4 serial configuration
// =============================================================================

/**
 * PX4 has no SERIALn_PROTOCOL. Physical ports carry SER_<port>_BAUD params and
 * functions claim a port through *_CONFIG params (MAV_0_CONFIG, GPS_1_CONFIG,
 * RC_PORT_CONFIG, ...) whose enum values are port codes from PX4's serial
 * framework: 6=UART 6, 101-104=TELEM 1-4, 201-203=GPS 1-3, 300=Radio
 * Controller, 301=Wifi Port.
 */
const PX4_PORT_CODES: Record<string, number> = {
  TEL1: 101, TEL2: 102, TEL3: 103, TEL4: 104,
  GPS1: 201, GPS2: 202, GPS3: 203,
  RC: 300, WIFI: 301, URT6: 6,
};

const PX4_PORT_LABELS: Record<string, string> = {
  TEL1: 'TELEM 1', TEL2: 'TELEM 2', TEL3: 'TELEM 3', TEL4: 'TELEM 4',
  GPS1: 'GPS 1', GPS2: 'GPS 2', GPS3: 'GPS 3',
  RC: 'RC Port', WIFI: 'Wifi Port', URT6: 'UART 6',
};

const PX4_FALLBACK_BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 500000, 921600, 1000000, 1500000, 2000000, 3000000];

const Px4SerialPortsConfig: React.FC = () => {
  const { t } = useTranslation('serialPorts');
  const { parameters, setParameter, getParameterMetadata, getDescription } = useParameterStore();
  const showTips = useSettingsStore((s) => s.uiVisibility.showTips);

  const selectStyle = 'bg-surface-raised text-content text-xs rounded px-1.5 py-1 border border-subtle focus:border-blue-500 focus:outline-none w-full';

  // Physical ports: every SER_<port>_BAUD param the vehicle reports
  const ports = useMemo(() => {
    const out: Array<{ suffix: string; baudParam: string; code: number | undefined }> = [];
    for (const id of parameters.keys()) {
      const m = /^SER_(.+)_BAUD$/.exec(id);
      if (m && m[1]) out.push({ suffix: m[1], baudParam: id, code: PX4_PORT_CODES[m[1]] });
    }
    return out.sort((a, b) => a.suffix.localeCompare(b.suffix));
  }, [parameters]);

  // Function assignments: *_CONFIG params whose enum maps onto serial port codes
  const configParams = useMemo(() => {
    const out: string[] = [];
    for (const id of parameters.keys()) {
      if (!/_CONFIG$/.test(id)) continue;
      const values = getParameterMetadata(id)?.values;
      if (values && (101 in values || 201 in values || 300 in values || 6 in values)) out.push(id);
    }
    return out.sort();
  }, [parameters, getParameterMetadata]);

  const portLabelForCode = (code: number): string => {
    const entry = Object.entries(PX4_PORT_CODES).find(([, c]) => c === code);
    return entry ? (PX4_PORT_LABELS[entry[0]] ?? entry[0]) : `Port ${code}`;
  };

  if (ports.length === 0 && configParams.length === 0) {
    return (
      <div className="p-6">
        <div className="p-8 text-center text-content-secondary text-sm space-y-1">
          <p>{t('serialPorts.noConfigurablePorts')}</p>
          <p className="text-xs text-content-tertiary">
            {parameters.size === 0
              ? 'Fetch parameters first.'
              : 'PX4 generates serial port parameters per board. Simulators (SITL) have no physical UARTs, so none exist; connect real hardware to configure its ports.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Physical ports card */}
      {ports.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <Cable className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="font-medium text-content">{t('serialPorts.configHeading')}</h3>
              <p className="text-xs text-content-secondary">{t('serialPorts.px4ConfigHint')}</p>
            </div>
          </div>
          {showTips && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border-sky-500/20 mb-4">
              <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <p className="text-xs text-content leading-relaxed">
                <span className="font-semibold text-sky-300">{t('serialPorts.howItWorks')}</span>
                PX4 assigns functions to ports, not protocols. Pick which port each function uses in
                the table below; set the port's baud rate here to match the connected device.
              </p>
            </div>
          )}
          <div className="rounded-lg border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-content-secondary text-xs">
                  <th className="px-3 py-2.5 text-left font-medium w-36">{t('serialPorts.col.port')}</th>
                  <th className="px-2 py-2.5 text-left font-medium w-32">{t('serialPorts.col.baud-rate')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('serialPorts.col.assigned-functions')}</th>
                </tr>
              </thead>
              <tbody>
                {ports.map((port) => {
                  const baud = parameters.get(port.baudParam)?.value ?? 57600;
                  const meta = getParameterMetadata(port.baudParam)?.values;
                  const baudOptions = meta && Object.keys(meta).length > 0
                    ? Object.entries(meta).map(([v, label]) => ({ value: Number(v), label }))
                    : PX4_FALLBACK_BAUDS.map((b) => ({ value: b, label: String(b) }));
                  if (!baudOptions.some((o) => o.value === Number(baud))) {
                    baudOptions.push({ value: Number(baud), label: String(baud) });
                  }
                  baudOptions.sort((a, b) => a.value - b.value);
                  const assigned = port.code === undefined
                    ? []
                    : configParams.filter((id) => Number(parameters.get(id)?.value) === port.code);
                  return (
                    <tr key={port.baudParam} className="border-b border-subtle hover:bg-surface-overlay-subtle">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Cable className="w-3.5 h-3.5 text-content-secondary" />
                          <div>
                            <span className="text-sm text-content">{PX4_PORT_LABELS[port.suffix] ?? port.suffix}</span>
                            <p className="text-[10px] text-content-secondary leading-tight">{port.baudParam}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <select
                          value={Number(baud)}
                          onChange={(e) => setParameter(port.baudParam, Number(e.target.value))}
                          className={selectStyle}
                        >
                          {baudOptions.map((b) => (
                            <option key={b.value} value={b.value}>{b.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        {assigned.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {assigned.map((id) => (
                              <span key={id} className="inline-flex px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 rounded">
                                {id.replace(/_CONFIG$/, '')}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-content-tertiary">{t('serialPorts.unassigned')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Function assignment card */}
      {configParams.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Usb className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-content">{t('serialPorts.portAssignments')}</h3>
              <p className="text-xs text-content-secondary">{t('serialPorts.portAssignmentsHint')}</p>
            </div>
          </div>
          <div className="rounded-lg border-subtle overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-content-secondary text-xs">
                  <th className="px-3 py-2.5 text-left font-medium w-64">{t('serialPorts.col.function')}</th>
                  <th className="px-2 py-2.5 text-left font-medium w-48">{t('serialPorts.col.port')}</th>
                  <th className="px-3 py-2.5 text-left font-medium">{t('serialPorts.col.description')}</th>
                </tr>
              </thead>
              <tbody>
                {configParams.map((id) => {
                  const value = Number(parameters.get(id)?.value ?? 0);
                  const values = getParameterMetadata(id)?.values ?? {};
                  const options = Object.entries(values)
                    .map(([v, label]) => ({ value: Number(v), label }))
                    .sort((a, b) => a.value - b.value);
                  if (!options.some((o) => o.value === value)) {
                    options.push({ value, label: portLabelForCode(value) });
                  }
                  return (
                    <tr key={id} className="border-b border-subtle hover:bg-surface-overlay-subtle">
                      <td className="px-3 py-2.5 font-mono text-xs text-content">{id}</td>
                      <td className="px-2 py-2.5">
                        <select
                          value={value}
                          onChange={(e) => setParameter(id, Number(e.target.value))}
                          className={selectStyle}
                        >
                          {options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-content-secondary">{getDescription(id)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reboot note */}
      <div className="p-3 rounded-lg bg-amber-500/10 border-amber-500/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Serial configuration takes effect after saving with Save All Changes and rebooting the flight controller.
          </p>
        </div>
      </div>
    </div>
  );
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

  const isRcin = Number(protocol) === 23;
  const isMavlink = Number(protocol) === 1 || Number(protocol) === 2;

  const selectStyle = 'bg-surface-raised text-content text-xs rounded px-1.5 py-1 border border-subtle focus:border-blue-500 focus:outline-none w-full';

  return (
    <tr className="border-b border-subtle hover:bg-surface-overlay-subtle">
      {/* Port name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {isUsb ? (
            <Usb className="w-3.5 h-3.5 text-content-secondary" />
          ) : (
            <Cable className="w-3.5 h-3.5 text-content-secondary" />
          )}
          <div>
            <span className="text-sm text-content">SERIAL{index}</span>
            <p className="text-[10px] text-content-secondary leading-tight">{label}</p>
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
          <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-green-500/10 text-green-400 border-green-500/30 rounded">
            RC Input
          </span>
        )}
        {isMavlink && (
          <span className="inline-flex px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30 rounded">
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

const ArduPilotSerialPorts: React.FC = () => {
  const { t } = useTranslation('serialPorts');
  const { parameters } = useParameterStore();
  const showTips = useSettingsStore((s) => s.uiVisibility.showTips);

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
      if (Number(proto) === 23) return true;
    }
    return false;
  }, [parameters, portCount]);

  return (
    <div className="p-6 space-y-6">
      {/* Port table card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Cable className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('serialPorts.configHeading')}</h3>
            <p className="text-xs text-content-secondary">{t('serialPorts.ardupilotConfigHint')}</p>
          </div>
        </div>
        {/* How this works banner */}
        {showTips && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-sky-500/5 border-sky-500/20 mb-4">
            <HelpCircle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <p className="text-xs text-content leading-relaxed">
              <span className="font-semibold text-sky-300">{t('serialPorts.howItWorks')}</span>
              {t('serialPorts.protocolHint1')} <span className="text-content">RCIN</span> {t('serialPorts.protocolHint2')} <span className="text-content">GPS</span> {t('serialPorts.protocolHint3')}
            </p>
          </div>
        )}
        <div className="rounded-lg border-subtle overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-content-secondary text-xs">
                <th className="px-3 py-2.5 text-left font-medium w-36">{t('serialPorts.col.port')}</th>
                <th className="px-2 py-2.5 text-left font-medium w-44">{t('serialPorts.col.protocol')}</th>
                <th className="px-2 py-2.5 text-left font-medium w-32">{t('serialPorts.col.baud-rate')}</th>
                <th className="px-3 py-2.5 text-center font-medium w-24">{t('serialPorts.col.status')}</th>
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
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-blue-500/5 border-blue-500/20">
        <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-content leading-relaxed space-y-1">
          <p className="font-semibold text-blue-300">{t('serialPorts.commonSetups')}</p>
          <p>{t('serialPorts.setupElrs1')} <span className="text-content">RCIN</span> {t('serialPorts.setupElrs2')} <span className="text-content">115200</span> {t('serialPorts.setupElrs3')}</p>
          <p>{t('serialPorts.setupGps1')} <span className="text-content">GPS</span> {t('serialPorts.setupGps2')} <span className="text-content">115200</span> {t('serialPorts.setupGps3')} <span className="text-content">230400</span> {t('serialPorts.setupGps4')}</p>
          <p>{t('serialPorts.setupRadio1')} <span className="text-content">MAVLink2</span> {t('serialPorts.setupRadio2')} <span className="text-content">57600</span> {t('serialPorts.setupRadio3')}</p>
        </div>
      </div>

      {/* No RCIN warning */}
      {!hasRcin && (
        <div className="p-3 rounded-lg bg-amber-500/10 border-amber-500/20">
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

const SerialPortsTab: React.FC = () => {
  const { t } = useTranslation('serialPorts');
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  return firmware === 'px4' ? <Px4SerialPortsConfig /> : <ArduPilotSerialPorts />;
};

export default SerialPortsTab;
