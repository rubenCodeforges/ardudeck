/**
 * MAVLink Receiver Tab
 *
 * Receiver configuration for ArduPilot vehicles.
 * - RC protocol selection (RCIN_TYPE parameter)
 * - Live RC channel bars from RC_CHANNELS MAVLink message
 * - RC calibration reference (RC1_MIN/MAX/TRIM through RC8)
 *
 * Follows the flat card layout pattern used by PID/Rates tabs.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Radio, Signal, SignalZero, Activity, AlertTriangle, HelpCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { PRIMARY_CHANNEL_COUNT, getMavlinkChannelNames } from '../../utils/rc-channel-constants';

// =============================================================================
// Constants
// =============================================================================

/** ArduPilot RCIN_TYPE values */
const RCIN_PROTOCOLS: { value: number; label: string; description: string }[] = [
  { value: 0, label: 'All', description: 'Auto-detect all protocols' },
  { value: 1, label: 'PPM', description: 'PPM sum signal' },
  { value: 2, label: 'SBus', description: 'Futaba SBus (inverted serial)' },
  { value: 3, label: 'DSM/Spektrum', description: 'DSM2/DSMX satellite' },
  { value: 4, label: 'SUMD', description: 'Graupner SUMD' },
  { value: 5, label: 'SRXL', description: 'Multiplex SRXL' },
  { value: 7, label: 'SBus (NI)', description: 'SBus non-inverted' },
  { value: 9, label: 'CRSF/ELRS', description: 'TBS Crossfire / ExpressLRS' },
  { value: 10, label: 'ST24', description: 'Yuneec ST24' },
  { value: 11, label: 'FPORT', description: 'FrSky FPort' },
  { value: 12, label: 'FPORT2', description: 'FrSky FPort 2.0' },
  { value: 13, label: 'SRXL2', description: 'Spektrum SRXL2' },
  { value: 14, label: 'GHST', description: 'ImmersionRC Ghost' },
  { value: 15, label: 'DroneCAN', description: 'DroneCAN RC input' },
];

// =============================================================================
// Channel Bar Component (matches MSP ReceiverTab pattern)
// =============================================================================

const ChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  isActive: boolean;
  name: string;
}> = ({ value, isActive, name }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={isActive ? 'text-green-400' : 'text-zinc-400'}>
          {name}
        </span>
        <span className="text-zinc-500 font-mono">{value}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
        <div
          className={`absolute top-0 bottom-0 w-2 rounded-full transition-all ${
            isActive ? 'bg-green-500' : 'bg-zinc-600'
          }`}
          style={{ left: `calc(${percent}% - 4px)` }}
        />
      </div>
    </div>
  );
};

/** Compact channel bar for AUX/extra channels */
const CompactChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  isActive: boolean;
  name: string;
}> = ({ value, isActive, name }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${isActive ? 'text-green-400' : 'text-zinc-500'}`}>
          {name}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-700" />
        <div
          className={`absolute top-0 bottom-0 w-1.5 rounded-full transition-all ${
            isActive ? 'bg-green-500' : 'bg-zinc-600'
          }`}
          style={{ left: `calc(${percent}% - 3px)` }}
        />
      </div>
    </div>
  );
};

// =============================================================================
// Info Banner
// =============================================================================

function InfoBanner({ children, color = 'teal' }: { children: React.ReactNode; color?: string }) {
  const styles: Record<string, { bg: string; border: string; icon: string; label: string }> = {
    teal:  { bg: 'bg-teal-500/5',  border: 'border-teal-500/20',  icon: 'text-teal-400',  label: 'text-teal-300' },
    blue:  { bg: 'bg-blue-500/5',  border: 'border-blue-500/20',  icon: 'text-blue-400',  label: 'text-blue-300' },
    amber: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', icon: 'text-amber-400', label: 'text-amber-300' },
  };
  const s = styles[color] ?? styles.teal!;
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${s.bg} ${s.border} border`}>
      <HelpCircle className={`w-4 h-4 ${s.icon} shrink-0 mt-0.5`} />
      <p className="text-xs text-zinc-300 leading-relaxed">
        <span className={`font-semibold ${s.label}`}>How this works: </span>
        {children}
      </p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

const ReceiverTab: React.FC = () => {
  const { parameters, setParameter } = useParameterStore();
  const rcChannels = useTelemetryStore((s) => s.rcChannels);
  const lastRcChannels = useTelemetryStore((s) => s.lastRcChannels);

  // Build RCMAP-aware channel names from ArduPilot parameters
  const channelNames = useMemo(() => {
    const roll = (parameters.get('RCMAP_ROLL')?.value as number) ?? 1;
    const pitch = (parameters.get('RCMAP_PITCH')?.value as number) ?? 2;
    const throttle = (parameters.get('RCMAP_THROTTLE')?.value as number) ?? 3;
    const yaw = (parameters.get('RCMAP_YAW')?.value as number) ?? 4;
    return getMavlinkChannelNames({ roll, pitch, throttle, yaw });
  }, [parameters]);

  // Signal status based on last update time
  const [signalStatus, setSignalStatus] = useState<'none' | 'stale' | 'active'>('none');

  // Track channel movement for active indicator
  const [channelBaseline, setChannelBaseline] = useState<number[]>([]);
  const [activeChannels, setActiveChannels] = useState<boolean[]>(Array(18).fill(false));

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastRcChannels;
      if (lastRcChannels === 0 || rcChannels.chancount === 0) {
        setSignalStatus('none');
      } else if (elapsed > 2000) {
        setSignalStatus('stale');
      } else {
        setSignalStatus('active');
      }
    }, 250);
    return () => clearInterval(interval);
  }, [lastRcChannels, rcChannels.chancount]);

  // Track active channels
  useEffect(() => {
    if (channelBaseline.length === 0 && rcChannels.channels.length > 0) {
      setChannelBaseline([...rcChannels.channels]);
      return;
    }
    if (channelBaseline.length > 0) {
      const active = rcChannels.channels.map((ch, i) => {
        const base = channelBaseline[i] ?? 1500;
        return Math.abs(ch - base) > 50;
      });
      setActiveChannels(active);
    }
  }, [rcChannels.channels, channelBaseline]);

  // Current RC protocol
  const rcinType = parameters.get('RCIN_TYPE')?.value ?? 0;

  // RC calibration values - show up to chancount (max 16)
  const calChannelCount = Math.max(rcChannels.chancount, 8);
  const calData = useMemo(() => {
    const count = Math.min(calChannelCount, 16);
    const result: { min: number; max: number; trim: number }[] = [];
    for (let i = 1; i <= count; i++) {
      result.push({
        min: (parameters.get(`RC${i}_MIN`)?.value as number) ?? 1000,
        max: (parameters.get(`RC${i}_MAX`)?.value as number) ?? 2000,
        trim: (parameters.get(`RC${i}_TRIM`)?.value as number) ?? 1500,
      });
    }
    return result;
  }, [parameters, calChannelCount]);

  const signalBadge = signalStatus === 'active'
    ? { text: 'Active', color: 'green' }
    : signalStatus === 'stale'
    ? { text: 'Signal Lost', color: 'amber' }
    : { text: 'No Signal', color: 'red' };

  return (
    <div className="p-6 space-y-6">
      {/* RC Protocol Card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Receiver Protocol</h3>
            <p className="text-xs text-gray-500">Select the receiver protocol used by your RC receiver</p>
          </div>
        </div>
        <div className="space-y-4">
          <InfoBanner>
            Your transmitter sends stick commands to a receiver wired to your flight controller.
            Select the protocol that matches your receiver — check the label on your receiver if unsure. Auto-Detect works for most setups.
          </InfoBanner>
          {/* Quick select buttons */}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">Quick Select</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Auto-Detect', value: 0 },
                { label: 'CRSF / ELRS', value: 9 },
                { label: 'SBus', value: 2 },
                { label: 'DSM/Spektrum', value: 3 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setParameter('RCIN_TYPE', opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    Number(rcinType) === opt.value
                      ? 'bg-teal-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full dropdown */}
          <div>
            <label className="text-xs text-zinc-400 mb-2 block">All Protocols</label>
            <select
              value={Number(rcinType)}
              onChange={(e) => setParameter('RCIN_TYPE', Number(e.target.value))}
              className="w-full bg-zinc-800 text-zinc-200 rounded-lg px-3 py-2 text-sm border border-zinc-700 focus:border-teal-500 focus:outline-none"
            >
              {RCIN_PROTOCOLS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} - {p.description}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live RC Channels Card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg bg-${signalBadge.color}-500/20 flex items-center justify-center`}>
            {signalStatus === 'active'
              ? <Signal className="w-5 h-5 text-green-400" />
              : signalStatus === 'stale'
              ? <Activity className="w-5 h-5 text-amber-400" />
              : <SignalZero className="w-5 h-5 text-red-400" />}
          </div>
          <span className="flex-1 font-medium text-white">Live RC Channels</span>
          <span className={`px-2 py-0.5 text-xs rounded-full bg-${signalBadge.color}-500/20 text-${signalBadge.color}-400`}>
            {signalBadge.text}
          </span>
        </div>
        {rcChannels.chancount > 0 ? (
          <div className="space-y-4">
            {/* Info row */}
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {rcChannels.rssi > 0 && <span>RSSI: {rcChannels.rssi}</span>}
              <span>{rcChannels.chancount} channels</span>
            </div>

            {/* Primary sticks - 2 column grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {rcChannels.channels.slice(0, Math.min(rcChannels.chancount, PRIMARY_CHANNEL_COUNT)).map((value, i) => (
                <ChannelBar
                  key={i}
                  channelIndex={i}
                  value={value}
                  isActive={activeChannels[i] ?? false}
                  name={channelNames[i] ?? `CH${i + 1}`}
                />
              ))}
            </div>

            {/* AUX channels - compact 3-column grid */}
            {rcChannels.chancount > PRIMARY_CHANNEL_COUNT && (
              <>
                <div className="border-t border-zinc-700/50" />
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  {rcChannels.channels.slice(PRIMARY_CHANNEL_COUNT, rcChannels.chancount).map((value, i) => (
                    <CompactChannelBar
                      key={i + PRIMARY_CHANNEL_COUNT}
                      channelIndex={i + PRIMARY_CHANNEL_COUNT}
                      value={value}
                      isActive={activeChannels[i + PRIMARY_CHANNEL_COUNT] ?? false}
                      name={channelNames[i + PRIMARY_CHANNEL_COUNT] ?? `CH${i + PRIMARY_CHANNEL_COUNT + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">No RC signal detected</p>
                <p className="text-xs text-zinc-400 mt-1">Check that:</p>
                <ul className="text-xs text-zinc-400 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Receiver is powered and bound to transmitter</li>
                  <li>Correct SERIAL port has RCIN protocol set</li>
                  <li>RCIN_TYPE matches your receiver hardware</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RC Calibration Card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">RC Calibration</h3>
            <p className="text-xs text-gray-500">Current calibration values stored on the flight controller</p>
          </div>
        </div>
        <InfoBanner color="blue">
          These are the min/max/center values your flight controller learned during RC calibration. If your sticks don't reach full range or center is off, recalibrate in Mission Planner or via the RC_CAL parameters.
        </InfoBanner>
        <div className="mt-4 rounded-lg border border-gray-700/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-800/50 text-zinc-400">
                <th className="px-3 py-2 text-left font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Min</th>
                <th className="px-3 py-2 text-right font-medium">Trim</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {calData.map((cal, i) => (
                <tr key={i} className="border-t border-zinc-800/50">
                  <td className="px-3 py-1.5 text-zinc-300">{channelNames[i] ?? `CH${i + 1}`}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{cal.min}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{cal.trim}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-400">{cal.max}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReceiverTab;
