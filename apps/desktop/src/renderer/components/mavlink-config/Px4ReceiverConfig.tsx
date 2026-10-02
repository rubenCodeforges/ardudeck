/**
 * Px4ReceiverConfig
 *
 * PX4 RC / receiver setup that mirrors the ArduPilot ReceiverTab UX (same cards,
 * icon boxes, live RC channel bars and Tailwind tokens) but bound to PX4
 * RC_MAP_* / RC{n}_* / COM_RC_IN_MODE parameters. Enum labels (channel maps,
 * input mode) resolve from the bundled PX4 metadata when present, with sensible
 * fallbacks.
 *
 * The live RC channel display reads the standard MAVLink RC_CHANNELS message,
 * which is firmware-agnostic, so the exact same bars used by the ArduPilot tab
 * apply here unchanged.
 *
 * ArduPilot exposes no PX4-style RC calibration command, so calibration here is
 * manual: min/max/trim/deadzone/reverse are editable param fields. Params absent
 * on the connected vehicle render disabled so the UI never crashes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Radio,
  Signal,
  SignalZero,
  Activity,
  AlertTriangle,
  Sliders,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useRcSignalStatus } from '../../hooks/useRcSignalStatus';
import { InfoCard } from '../ui/InfoCard';
import { useTranslation } from 'react-i18next';
import {
  PRIMARY_CHANNEL_COUNT,
  getMavlinkChannelNames,
  reorderChannelsWithRcmap,
} from '../../utils/rc-channel-constants';

// =============================================================================
// Live channel bars (identical visual language to the ArduPilot ReceiverTab)
// =============================================================================

const ChannelBar: React.FC<{
  value: number;
  isActive: boolean;
  name: string;
}> = ({ value, isActive, name }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={isActive ? 'text-green-400' : 'text-content-secondary'}>{name}</span>
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

const CompactChannelBar: React.FC<{
  value: number;
  isActive: boolean;
  name: string;
}> = ({ value, isActive, name }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${isActive ? 'text-green-400' : 'text-content-secondary'}`}>{name}</span>
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
// Constants / fallbacks
// =============================================================================

/** Function channel-map params: PX4 stores a 1-based physical channel (0 = unassigned). */
const FUNCTION_MAPS: { id: string; labelKey: string; hintKey: string }[] = [
  { id: 'RC_MAP_ROLL', labelKey: 'common:roll', hintKey: 'mavlink-config:px4ReceiverConfig.rollHint' },
  { id: 'RC_MAP_PITCH', labelKey: 'common:pitch', hintKey: 'mavlink-config:px4ReceiverConfig.pitchHint' },
  { id: 'RC_MAP_THROTTLE', labelKey: 'common:throttle', hintKey: 'mavlink-config:px4ReceiverConfig.throttleHint' },
  { id: 'RC_MAP_YAW', labelKey: 'common:yaw', hintKey: 'mavlink-config:px4ReceiverConfig.yawHint' },
];

/** Switch/aux maps. RC_MAP_FLTMODE is current PX4; RC_MAP_MODE_SW is the legacy name. */
const SWITCH_MAPS: { id: string; fallbackId?: string; labelKey: string; hintKey: string }[] = [
  { id: 'RC_MAP_FLTMODE', fallbackId: 'RC_MAP_MODE_SW', labelKey: 'mavlink-config:px4ReceiverConfig.flightMode', hintKey: 'mavlink-config:px4ReceiverConfig.flightModeHint' },
  { id: 'RC_MAP_RETURN_SW', labelKey: 'mavlink-config:px4ReceiverConfig.returnSwitch', hintKey: 'mavlink-config:px4ReceiverConfig.returnSwitchHint' },
  { id: 'RC_MAP_KILL_SW', labelKey: 'mavlink-config:px4ReceiverConfig.killSwitch', hintKey: 'mavlink-config:px4ReceiverConfig.killSwitchHint' },
  { id: 'RC_MAP_ARM_SW', labelKey: 'mavlink-config:px4ReceiverConfig.armSwitch', hintKey: 'mavlink-config:px4ReceiverConfig.armSwitchHint' },
  { id: 'RC_MAP_AUX1', labelKey: 'mavlink-config:px4ReceiverConfig.aux1', hintKey: 'mavlink-config:px4ReceiverConfig.aux1Hint' },
  { id: 'RC_MAP_AUX2', labelKey: 'mavlink-config:px4ReceiverConfig.aux2', hintKey: 'mavlink-config:px4ReceiverConfig.aux2Hint' },
];

const MAX_CHANNEL_MAP = 18;

const INPUT_MODE_FALLBACK_KEYS: Record<number, string> = {
  0: 'mavlink-config:px4ReceiverConfig.inputRcOnly',
  1: 'mavlink-config:px4ReceiverConfig.inputJoystickOnly',
  2: 'mavlink-config:px4ReceiverConfig.inputRcAndJoystick',
  3: 'mavlink-config:px4ReceiverConfig.inputDisabled',
};

// =============================================================================
// Channel-map dropdown (shared by function + switch maps)
// =============================================================================

const ChannelMapSelect: React.FC<{
  paramId: string;
  fallbackId?: string;
  label: string;
  hint: string;
}> = ({ paramId, fallbackId, label, hint }) => {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();

  // Resolve the active param id (current name, else legacy fallback).
  const activeId = parameters.has(paramId)
    ? paramId
    : fallbackId && parameters.has(fallbackId)
      ? fallbackId
      : paramId;
  const present = parameters.has(activeId);
  const value = Number(parameters.get(activeId)?.value ?? 0);

  const options = useMemo(() => {
    const opts: { value: number; label: string }[] = [{ value: 0, label: t('common:unassigned') }];
    for (let i = 1; i <= MAX_CHANNEL_MAP; i++) opts.push({ value: i, label: t('mavlink-config:px4ReceiverConfig.channelN', { n: i }) });
    return opts;
  }, [t]);

  return (
    <div className="space-y-1">
      <label className="text-xs text-content-secondary block">{label}</label>
      <select
        value={value}
        disabled={!present}
        onChange={(e) => setParameter(activeId, Number(e.target.value))}
        title={present ? hint : t('mavlink-config:px4ReceiverConfig.notPresentSuffix', { hint })}
        className="w-full bg-surface-raised text-content rounded-lg px-3 py-2 text-sm border focus:border-teal-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// =============================================================================
// Editable calibration field
// =============================================================================

const CalCell: React.FC<{
  paramId: string;
  fallback: number;
}> = ({ paramId, fallback }) => {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const present = parameters.has(paramId);
  const stored = Number(parameters.get(paramId)?.value ?? fallback);
  const [draft, setDraft] = useState<string>(String(stored));

  // Re-sync when the stored value changes (e.g. after a refresh).
  useEffect(() => {
    setDraft(String(stored));
  }, [stored]);

  const commit = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n !== stored) setParameter(paramId, n);
    else setDraft(String(stored));
  };

  return (
    <input
      type="number"
      value={draft}
      disabled={!present}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      title={present ? undefined : t('mavlink-config:px4ReceiverConfig.notPresent')}
      className="w-full bg-surface-raised text-content text-right font-mono rounded px-2 py-1 text-xs border focus:border-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
};

// =============================================================================
// Main component
// =============================================================================

const Px4ReceiverConfig: React.FC = () => {
  const { t } = useTranslation();
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const rcChannels = useTelemetryStore((s) => s.rcChannels);

  // RC_MAP_* describe which physical channel carries each primary function (1-based).
  const rcmap = useMemo(
    () => ({
      roll: Number(parameters.get('RC_MAP_ROLL')?.value ?? 1),
      pitch: Number(parameters.get('RC_MAP_PITCH')?.value ?? 2),
      throttle: Number(parameters.get('RC_MAP_THROTTLE')?.value ?? 3),
      yaw: Number(parameters.get('RC_MAP_YAW')?.value ?? 4),
    }),
    [parameters],
  );

  const physicalChannelNames = useMemo(() => getMavlinkChannelNames(rcmap), [rcmap]);
  const functionalChannelNames = useMemo(
    () => reorderChannelsWithRcmap(physicalChannelNames, rcmap),
    [physicalChannelNames, rcmap],
  );

  // --- Live signal status + active-channel detection (same logic as ArduPilot tab) ---
  const signalStatus = useRcSignalStatus();
  const [channelBaseline, setChannelBaseline] = useState<number[]>([]);
  const [activeChannels, setActiveChannels] = useState<boolean[]>(Array(18).fill(false));

  useEffect(() => {
    if (channelBaseline.length === 0 && rcChannels.channels.length > 0) {
      setChannelBaseline([...rcChannels.channels]);
      return;
    }
    if (channelBaseline.length > 0) {
      setActiveChannels(
        rcChannels.channels.map((ch, i) => Math.abs(ch - (channelBaseline[i] ?? 1500)) > 50),
      );
    }
  }, [rcChannels.channels, channelBaseline]);

  const functionalChannels = useMemo(
    () => reorderChannelsWithRcmap(rcChannels.channels, rcmap),
    [rcChannels.channels, rcmap],
  );
  const functionalActive = useMemo(
    () => reorderChannelsWithRcmap(activeChannels, rcmap),
    [activeChannels, rcmap],
  );

  const signalBadge =
    signalStatus === 'active'
      ? { text: t('common:active'), color: 'green' }
      : signalStatus === 'stale'
        ? { text: t('mavlink-config:px4ReceiverConfig.signalLost'), color: 'amber' }
        : { text: t('mavlink-config:px4ReceiverConfig.noSignal'), color: 'red' };

  // --- Input mode (COM_RC_IN_MODE) ---
  const inputModePresent = parameters.has('COM_RC_IN_MODE');
  const inputMode = Number(parameters.get('COM_RC_IN_MODE')?.value ?? 0);
  const inputModeMeta = getParameterMetadata('COM_RC_IN_MODE');
  const inputModeOptions = useMemo(() => {
    if (inputModeMeta?.values) {
      return Object.entries(inputModeMeta.values).map(([v, label]) => ({ value: Number(v), label }));
    }
    return Object.entries(INPUT_MODE_FALLBACK_KEYS).map(([v, key]) => ({ value: Number(v), label: t(key) }));
  }, [inputModeMeta, t]);

  // --- Calibration channel count: prefer RC_CHAN_CNT, then live chancount, clamp 4..18 ---
  const calChannelCount = useMemo(() => {
    const declared = Number(parameters.get('RC_CHAN_CNT')?.value ?? 0);
    const base = declared > 0 ? declared : rcChannels.chancount;
    return Math.min(18, Math.max(4, base || 8));
  }, [parameters, rcChannels.chancount]);

  return (
    <div className="p-6 space-y-6">
      {/* Input Mode Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:px4ReceiverConfig.inputModeTitle')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:px4ReceiverConfig.inputModeSubtitle')}</p>
          </div>
        </div>
        <InfoCard title={t('mavlink-config:px4ReceiverConfig.howThisWorks')} variant="help">
          {t('mavlink-config:px4ReceiverConfig.inputModeHelp')}
        </InfoCard>
        <div className="mt-4 max-w-sm">
          <label className="text-xs text-content-secondary mb-2 block">{t('mavlink-config:px4ReceiverConfig.inputSource')}</label>
          <select
            value={inputMode}
            disabled={!inputModePresent}
            onChange={(e) => setParameter('COM_RC_IN_MODE', Number(e.target.value))}
            className="w-full bg-surface-raised text-content rounded-lg px-3 py-2 text-sm border focus:border-teal-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {inputModeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live RC Channels Card (reuses the firmware-agnostic RC_CHANNELS display) */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-lg bg-${signalBadge.color}-500/20 flex items-center justify-center`}>
            {signalStatus === 'active' ? (
              <Signal className="w-5 h-5 text-green-400" />
            ) : signalStatus === 'stale' ? (
              <Activity className="w-5 h-5 text-amber-400" />
            ) : (
              <SignalZero className="w-5 h-5 text-red-400" />
            )}
          </div>
          <span className="flex-1 font-medium text-content">{t('mavlink-config:px4ReceiverConfig.liveRcChannels')}</span>
          <span className={`px-2 py-0.5 text-xs rounded-full bg-${signalBadge.color}-500/20 text-${signalBadge.color}-400`}>
            {signalBadge.text}
          </span>
        </div>
        {rcChannels.chancount > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-xs text-content-secondary">
              {rcChannels.rssi > 0 && <span>{t('mavlink-config:px4ReceiverConfig.rssi', { rssi: rcChannels.rssi })}</span>}
              <span>{t('mavlink-config:px4ReceiverConfig.channelCount', { count: rcChannels.chancount })}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {functionalChannels.slice(0, Math.min(rcChannels.chancount, PRIMARY_CHANNEL_COUNT)).map((value, i) => (
                <ChannelBar
                  key={i}
                  value={value}
                  isActive={functionalActive[i] ?? false}
                  name={functionalChannelNames[i] ?? `CH${i + 1}`}
                />
              ))}
            </div>

            {rcChannels.chancount > PRIMARY_CHANNEL_COUNT && (
              <>
                <div className="border-t border-subtle" />
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  {rcChannels.channels.slice(PRIMARY_CHANNEL_COUNT, rcChannels.chancount).map((value, i) => (
                    <CompactChannelBar
                      key={i + PRIMARY_CHANNEL_COUNT}
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
                <p className="text-sm font-medium text-amber-300">{t('mavlink-config:px4ReceiverConfig.noRcSignal')}</p>
                <p className="text-xs text-content-secondary mt-1">{t('mavlink-config:px4ReceiverConfig.checkThat')}</p>
                <ul className="text-xs text-content-secondary mt-1 space-y-0.5 list-disc list-inside">
                  <li>{t('mavlink-config:px4ReceiverConfig.checkPowered')}</li>
                  <li>{t('mavlink-config:px4ReceiverConfig.checkWired')}</li>
                  <li>{t('mavlink-config:px4ReceiverConfig.checkInputMode')}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Channel Mapping Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:px4ReceiverConfig.channelMapping')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:px4ReceiverConfig.channelMappingSubtitle')}</p>
          </div>
        </div>
        <InfoCard title={t('mavlink-config:px4ReceiverConfig.howThisWorks')} variant="help">
          {t('mavlink-config:px4ReceiverConfig.channelMappingHelp')}
        </InfoCard>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-2">{t('mavlink-config:px4ReceiverConfig.primarySticks')}</div>
          <div className="grid grid-cols-2 gap-4">
            {FUNCTION_MAPS.map((m) => (
              <ChannelMapSelect key={m.id} paramId={m.id} label={t(m.labelKey)} hint={t(m.hintKey)} />
            ))}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-2">{t('mavlink-config:px4ReceiverConfig.switchesAux')}</div>
          <div className="grid grid-cols-3 gap-4">
            {SWITCH_MAPS.map((m) => (
              <ChannelMapSelect key={m.id} paramId={m.id} fallbackId={m.fallbackId} label={t(m.labelKey)} hint={t(m.hintKey)} />
            ))}
          </div>
        </div>
      </div>

      {/* Calibration Card */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:px4ReceiverConfig.rcCalibration')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:px4ReceiverConfig.rcCalibrationSubtitle')}</p>
          </div>
        </div>
        <InfoCard title={t('mavlink-config:px4ReceiverConfig.howThisWorks')} variant="help">
          {t('mavlink-config:px4ReceiverConfig.rcCalibrationHelp')}
        </InfoCard>

        <div className="mt-4 rounded-lg border-subtle overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface text-content-secondary">
                <th className="px-3 py-2 text-left font-medium">{t('common:channel')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('common:min')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('mavlink-config:px4ReceiverConfig.trim')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('common:max')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('mavlink-config:px4ReceiverConfig.deadzone')}</th>
                <th className="px-3 py-2 text-center font-medium">{t('common:reverse')}</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: calChannelCount }, (_, idx) => {
                const n = idx + 1;
                const revPresent = parameters.has(`RC${n}_REV`);
                const reversed = Number(parameters.get(`RC${n}_REV`)?.value ?? 1) < 0;
                return (
                  <tr key={n} className="border-t border-subtle">
                    <td className="px-3 py-1.5 text-content">{physicalChannelNames[idx] ?? `CH${n}`}</td>
                    <td className="px-2 py-1.5"><CalCell paramId={`RC${n}_MIN`} fallback={1000} /></td>
                    <td className="px-2 py-1.5"><CalCell paramId={`RC${n}_TRIM`} fallback={1500} /></td>
                    <td className="px-2 py-1.5"><CalCell paramId={`RC${n}_MAX`} fallback={2000} /></td>
                    <td className="px-2 py-1.5"><CalCell paramId={`RC${n}_DZ`} fallback={0} /></td>
                    <td className="px-3 py-1.5 text-center">
                      <button
                        disabled={!revPresent}
                        onClick={() => setParameter(`RC${n}_REV`, reversed ? 1 : -1)}
                        title={revPresent ? t('mavlink-config:px4ReceiverConfig.toggleReverse') : t('mavlink-config:px4ReceiverConfig.notPresent')}
                        className={`px-2 py-0.5 rounded text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          reversed
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-surface-raised text-content-secondary hover:bg-surface-inset'
                        }`}
                      >
                        {reversed ? t('common:reversed') : t('common:normal')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-content-tertiary mt-2">
          {t('mavlink-config:px4ReceiverConfig.stagedNote')}
        </p>
      </div>
    </div>
  );
};

export default Px4ReceiverConfig;
