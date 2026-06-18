/**
 * MAVLink Receiver Tab
 *
 * Receiver configuration for ArduPilot vehicles.
 * - RC protocol selection (RC_PROTOCOLS bitmask parameter)
 * - Live RC channel bars from RC_CHANNELS MAVLink message
 * - RC calibration reference (RC1_MIN/MAX/TRIM through RC8)
 *
 * Follows the flat card layout pattern used by PID/Rates tabs.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Radio, Signal, SignalZero, Activity, AlertTriangle, HelpCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import Px4ReceiverConfig from './Px4ReceiverConfig';
import { PRIMARY_CHANNEL_COUNT, getMavlinkChannelNames, reorderChannelsWithRcmap } from '../../utils/rc-channel-constants';

// =============================================================================
// Constants
// =============================================================================

/** ArduPilot RC_PROTOCOLS bitmask values (bit positions → power of 2) */
const RC_PROTOCOL_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 0, label: 'Auto-Detect', description: 'Auto-detect all protocols (value 0)' },
  { value: 1, label: 'All', description: 'Enable all protocols' },
  { value: 2, label: 'PPM', description: 'PPM sum signal' },
  { value: 4, label: 'IBUS', description: 'FlySky IBUS' },
  { value: 8, label: 'SBus', description: 'Futaba SBus (inverted serial)' },
  { value: 16, label: 'SBus (NI)', description: 'SBus non-inverted' },
  { value: 32, label: 'DSM/Spektrum', description: 'DSM2/DSMX satellite' },
  { value: 64, label: 'SUMD', description: 'Graupner SUMD' },
  { value: 128, label: 'SRXL', description: 'Multiplex SRXL' },
  { value: 256, label: 'SRXL2', description: 'Spektrum SRXL2' },
  { value: 512, label: 'CRSF/ELRS', description: 'TBS Crossfire / ExpressLRS' },
  { value: 1024, label: 'ST24', description: 'Yuneec ST24' },
  { value: 2048, label: 'FPORT', description: 'FrSky FPort' },
  { value: 4096, label: 'FPORT2', description: 'FrSky FPort 2.0' },
  { value: 8192, label: 'FastSBUS', description: 'Fast SBus' },
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
        <span className={isActive ? 'text-green-400' : 'text-content-secondary'}>
          {name}
        </span>
        <span className="text-content-secondary font-mono">{value}</span>
      </div>
      <div className="h-2 bg-surface-inset rounded-full overflow-hidden relative">
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
        <span className={`text-[11px] ${isActive ? 'text-green-400' : 'text-content-secondary'}`}>
          {name}
        </span>
        <span className="text-[10px] text-content-tertiary font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-raised" />
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
  const showTips = useSettingsStore((s) => s.uiVisibility.showTips);
  if (!showTips) return null;

  const styles: Record<string, { bg: string; border: string; icon: string; label: string }> = {
    teal:  { bg: 'bg-teal-500/5',  border: 'border-teal-500/20',  icon: 'text-teal-400',  label: 'text-teal-300' },
    blue:  { bg: 'bg-blue-500/5',  border: 'border-blue-500/20',  icon: 'text-blue-400',  label: 'text-blue-300' },
    amber: { bg: 'bg-amber-500/5', border: 'border-amber-500/20', icon: 'text-amber-400', label: 'text-amber-300' },
  };
  const s = styles[color] ?? styles.teal!;
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${s.bg} ${s.border} border`}>
      <HelpCircle className={`w-4 h-4 ${s.icon} shrink-0 mt-0.5`} />
      <p className="text-xs text-content leading-relaxed">
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
  const firmware = useConnectionStore((s) => s.connectionState.firmware);

  // RCMAP parameters — which physical channel carries which function (1-based)
  const rcmap = useMemo(() => ({
    roll: (parameters.get('RCMAP_ROLL')?.value as number) ?? 1,
    pitch: (parameters.get('RCMAP_PITCH')?.value as number) ?? 2,
    throttle: (parameters.get('RCMAP_THROTTLE')?.value as number) ?? 3,
    yaw: (parameters.get('RCMAP_YAW')?.value as number) ?? 4,
  }), [parameters]);

  // Channel names in physical order (for calibration table)
  const physicalChannelNames = useMemo(() => {
    return getMavlinkChannelNames(rcmap);
  }, [rcmap]);

  // Functional channel names: Roll, Pitch, Throttle, Yaw, CH5, CH6, ...
  const functionalChannelNames = useMemo(() => {
    return reorderChannelsWithRcmap(physicalChannelNames, rcmap);
  }, [physicalChannelNames, rcmap]);

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

  // Reorder channels and active flags into functional order for display
  const functionalChannels = useMemo(
    () => reorderChannelsWithRcmap(rcChannels.channels, rcmap),
    [rcChannels.channels, rcmap],
  );
  const functionalActive = useMemo(
    () => reorderChannelsWithRcmap(activeChannels, rcmap),
    [activeChannels, rcmap],
  );

  // Current RC protocol bitmask
  const rcProtocols = parameters.get('RC_PROTOCOLS')?.value ?? 0;

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

  if (firmware === 'px4') {
    return <Px4ReceiverConfig />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* RC Protocol Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">Receiver Protocol</h3>
            <p className="text-xs text-content-secondary">Select the receiver protocol used by your RC receiver</p>
          </div>
        </div>
        <div className="space-y-4">
          <InfoBanner>
            Your transmitter sends stick commands to a receiver wired to your flight controller.
            Select the protocol that matches your receiver — check the label on your receiver if unsure. Auto-Detect works for most setups.
          </InfoBanner>
          {/* Quick select buttons */}
          <div>
            <label className="text-xs text-content-secondary mb-2 block">Quick Select</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Auto-Detect', value: 0 },
                { label: 'CRSF / ELRS', value: 512 },
                { label: 'SBus', value: 8 },
                { label: 'DSM/Spektrum', value: 32 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setParameter('RC_PROTOCOLS', opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm transition-all ${
                    Number(rcProtocols) === opt.value
                      ? 'bg-teal-600 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full dropdown */}
          <div>
            <label className="text-xs text-content-secondary mb-2 block">All Protocols</label>
            <select
              value={Number(rcProtocols)}
              onChange={(e) => setParameter('RC_PROTOCOLS', Number(e.target.value))}
              className="w-full bg-surface-raised text-content rounded-lg px-3 py-2 text-sm border focus:border-teal-500 focus:outline-none"
            >
              {RC_PROTOCOL_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} - {p.description}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Live RC Channels Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg bg-${signalBadge.color}-500/20 flex items-center justify-center`}>
            {signalStatus === 'active'
              ? <Signal className="w-5 h-5 text-green-400" />
              : signalStatus === 'stale'
              ? <Activity className="w-5 h-5 text-amber-400" />
              : <SignalZero className="w-5 h-5 text-red-400" />}
          </div>
          <span className="flex-1 font-medium text-content">Live RC Channels</span>
          <span className={`px-2 py-0.5 text-xs rounded-full bg-${signalBadge.color}-500/20 text-${signalBadge.color}-400`}>
            {signalBadge.text}
          </span>
        </div>
        {rcChannels.chancount > 0 ? (
          <div className="space-y-4">
            {/* Info row */}
            <div className="flex items-center gap-3 text-xs text-content-secondary">
              {rcChannels.rssi > 0 && <span>RSSI: {rcChannels.rssi}</span>}
              <span>{rcChannels.chancount} channels</span>
            </div>

            {/* Primary sticks - functional order (Roll, Pitch, Throttle, Yaw) */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {functionalChannels.slice(0, Math.min(rcChannels.chancount, PRIMARY_CHANNEL_COUNT)).map((value, i) => (
                <ChannelBar
                  key={i}
                  channelIndex={i}
                  value={value}
                  isActive={functionalActive[i] ?? false}
                  name={functionalChannelNames[i] ?? `CH${i + 1}`}
                />
              ))}
            </div>

            {/* AUX channels - compact 3-column grid (physical order) */}
            {rcChannels.chancount > PRIMARY_CHANNEL_COUNT && (
              <>
                <div className="border-t border-subtle" />
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  {rcChannels.channels.slice(PRIMARY_CHANNEL_COUNT, rcChannels.chancount).map((value, i) => (
                    <CompactChannelBar
                      key={i + PRIMARY_CHANNEL_COUNT}
                      channelIndex={i + PRIMARY_CHANNEL_COUNT}
                      value={value}
                      isActive={activeChannels[i + PRIMARY_CHANNEL_COUNT] ?? false}
                      name={physicalChannelNames[i + PRIMARY_CHANNEL_COUNT] ?? `CH${i + PRIMARY_CHANNEL_COUNT + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-500/10 border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">No RC signal detected</p>
                <p className="text-xs text-content-secondary mt-1">Check that:</p>
                <ul className="text-xs text-content-secondary mt-1 space-y-0.5 list-disc list-inside">
                  <li>Receiver is powered and bound to transmitter</li>
                  <li>Correct SERIAL port has RCIN protocol set</li>
                  <li>RC_PROTOCOLS matches your receiver hardware</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RC Calibration Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">RC Calibration</h3>
            <p className="text-xs text-content-secondary">Current calibration values stored on the flight controller</p>
          </div>
        </div>
        <InfoBanner color="blue">
          These are the min/max/center values your flight controller learned during RC calibration. If your sticks don't reach full range or center is off, recalibrate in Mission Planner or via the RC_CAL parameters.
        </InfoBanner>
        <div className="mt-4 rounded-lg border-subtle overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface text-content-secondary">
                <th className="px-3 py-2 text-left font-medium">Channel</th>
                <th className="px-3 py-2 text-right font-medium">Min</th>
                <th className="px-3 py-2 text-right font-medium">Trim</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {calData.map((cal, i) => (
                <tr key={i} className="border-t border-subtle">
                  <td className="px-3 py-1.5 text-content">{physicalChannelNames[i] ?? `CH${i + 1}`}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-content-secondary">{cal.min}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-content-secondary">{cal.trim}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-content-secondary">{cal.max}</td>
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
