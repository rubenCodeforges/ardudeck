/**
 * MSP Receiver Tab
 *
 * Receiver protocol, live RC channels, channel mapping, and deadband config.
 * Used by both iNav and Betaflight boards.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { pendingDraft, usePendingWritesStore } from '../../stores/msp-pending-writes-store';
import { useReceiverStore } from '../../stores/receiver-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import {
  Radio,
  ChevronDown,
  Signal,
  SignalZero,
  AlertTriangle,
  Shuffle,
  CircleDot,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { PRIMARY_CHANNEL_COUNT, getChannelName } from '../../utils/rc-channel-constants';
import {
  INAV_RECEIVER_TYPES,
  INAV_QUICK_SELECT,
  BF_QUICK_SELECT,
  BF_PROVIDERS,
  PROTOCOL_HINTS,
  BF_PROTOCOL_HINTS,
} from '../../utils/receiver-constants';

// =============================================================================
// Receiver Protocol Options
// =============================================================================

/**
 * RC_MAP byte encoding: rcMapLetters = ['A','E','R','T']
 * RC_MAP[i] = position of rcMapLetters[i] in the channel string.
 * AETR string → A=pos0, E=pos1, T=pos2, R=pos3 → map[0]=0,map[1]=1,map[2]=3,map[3]=2
 */
// RX_MAP only covers the 4 stick channels: A(ileron), E(levator), R(udder), T(hrottle).
// AUX channels are never remapped — the FC always returns exactly 4 bytes for MSP_RX_MAP.
const RX_MAP_PRESETS: Array<{ label: string; labelKey?: string; desc: string; descKey?: string; map: number[] }> = [
  { label: 'AETR (Default)', labelKey: 'parameters:receiverTab.presetAetrDefault', desc: 'FrSky, Futaba, Hitec, ELRS, FlySky', map: [0, 1, 3, 2] }, // i18n-exempt
  { label: 'TAER', desc: 'Spektrum, JR, Graupner', map: [1, 2, 3, 0] }, // i18n-exempt
  { label: 'RETA', desc: 'Rare / legacy radios', descKey: 'parameters:receiverTab.presetRetaDesc', map: [3, 1, 0, 2] }, // i18n-exempt
];

// =============================================================================
// Section Component (collapsible)
// =============================================================================

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  color: string;
  defaultOpen?: boolean;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}

// Tailwind can't resolve dynamic class names like `bg-${color}-500/20` — they get purged at build time.
// Map every color to its full static class strings so the JIT compiler sees them.
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500/20', green: 'bg-green-500/20', red: 'bg-red-500/20',
  purple: 'bg-purple-500/20', orange: 'bg-orange-500/20', amber: 'bg-amber-500/20',
  teal: 'bg-teal-500/20', sky: 'bg-sky-500/20',
};
const COLOR_BADGE_BG: Record<string, string> = {
  blue: 'bg-blue-500/20', green: 'bg-green-500/20', red: 'bg-red-500/20',
  purple: 'bg-purple-500/20', orange: 'bg-orange-500/20', amber: 'bg-amber-500/20',
  teal: 'bg-teal-500/20', sky: 'bg-sky-500/20',
};
const COLOR_BADGE_TEXT: Record<string, string> = {
  blue: 'text-blue-400', green: 'text-green-400', red: 'text-red-400',
  purple: 'text-purple-400', orange: 'text-orange-400', amber: 'text-amber-400',
  teal: 'text-teal-400', sky: 'text-sky-400',
};

function Section({ title, icon, color, defaultOpen = false, badge, badgeColor, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bc = badgeColor || color;

  return (
    <div className="bg-surface rounded-xl border-subtle p-5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3"
      >
        <div className={`w-10 h-10 rounded-lg ${COLOR_BG[color] ?? 'bg-zinc-500/20'} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="flex-1 text-left font-medium text-content">{title}</span>
        {badge && (
          <span className={`px-2 py-0.5 text-xs rounded-full ${COLOR_BADGE_BG[bc] ?? 'bg-zinc-500/20'} ${COLOR_BADGE_TEXT[bc] ?? 'text-content-secondary'}`}>
            {badge}
          </span>
        )}
        <ChevronDown
          className={`w-5 h-5 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="mt-5">
          {children}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Info Banner - contextual help for new users
// =============================================================================

const BANNER_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  blue:   { bg: 'bg-blue-500/5',   border: 'border-blue-500/20',   icon: 'text-blue-400',   label: 'text-blue-300' },
  purple: { bg: 'bg-purple-500/5', border: 'border-purple-500/20', icon: 'text-purple-400', label: 'text-purple-300' },
  orange: { bg: 'bg-orange-500/5', border: 'border-orange-500/20', icon: 'text-orange-400', label: 'text-orange-300' },
  amber:  { bg: 'bg-amber-500/5',  border: 'border-amber-500/20',  icon: 'text-amber-400',  label: 'text-amber-300' },
  green:  { bg: 'bg-green-500/5',  border: 'border-green-500/20',  icon: 'text-green-400',  label: 'text-green-300' },
  teal:   { bg: 'bg-teal-500/5',   border: 'border-teal-500/20',   icon: 'text-teal-400',   label: 'text-teal-300' },
};

function InfoBanner({ children, color = 'blue' }: { children: React.ReactNode; color?: string }) {
  const { t } = useTranslation();
  const showTips = useSettingsStore((s) => s.uiVisibility.showTips);
  if (!showTips) return null;

  const s = BANNER_STYLES[color] ?? BANNER_STYLES.blue!;
  return (
    <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl ${s.bg} ${s.border} border`}>
      <HelpCircle className={`w-4 h-4 ${s.icon} shrink-0 mt-0.5`} />
      <p className="text-xs text-content leading-relaxed">
        <span className={`font-semibold ${s.label}`}>{t('parameters:receiverTab.howThisWorks')} </span>
        {children}
      </p>
    </div>
  );
}

// =============================================================================
// Channel Bar
// =============================================================================

const ChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  isActive: boolean;
}> = ({ channelIndex, value, isActive }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  const name = getChannelName(channelIndex, 'msp');

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

/** Compact channel bar for AUX channels - thinner with smaller text */
const CompactChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  isActive: boolean;
  protocol: 'msp' | 'mavlink';
}> = ({ channelIndex, value, isActive, protocol }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  const name = getChannelName(channelIndex, protocol);

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
// Channel Map Drag Row
// =============================================================================

function ChannelMapDragRow({ rxMap, setRxMap }: { rxMap: number[]; setRxMap: (map: number[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag image to avoid default ghost
    const el = e.currentTarget as HTMLElement;
    e.dataTransfer.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    // Swap the two positions
    const newMap = [...rxMap];
    const temp = newMap[dragIdx]!;
    newMap[dragIdx] = newMap[dropIdx]!;
    newMap[dropIdx] = temp;
    setRxMap(newMap);
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex gap-2">
      {rxMap.map((ch, i) => {
        const isDragging = dragIdx === i;
        const isOver = overIdx === i && dragIdx !== i;
        return (
          <div
            key={i}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            onDragLeave={() => setOverIdx(null)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-center text-xs cursor-grab active:cursor-grabbing select-none transition-all ${
              isDragging
                ? 'bg-purple-600/30 text-purple-300 border-purple-500/50 opacity-50'
                : isOver
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 scale-105'
                : 'bg-surface-raised text-content border-transparent hover:border'
            }`}
          >
            {getChannelName(ch, 'msp')}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface ReceiverTabProps {
  isInav: boolean;
  onNavigateToTab?: (tabId: string) => void;
}

const PENDING_ID = 'receiver-protocol';

interface ReceiverProtocolDraft {
  isInav: boolean;
  receiverType: string | null;
  originalReceiverType: string | null;
  inavProvider: string | null;
  originalInavProvider: string | null;
  bfProvider: number | null;
  originalBfProvider: number | null;
}

async function writeReceiverProtocol(d: ReceiverProtocolDraft): Promise<boolean> {
  if (!d.isInav) {
    return d.bfProvider === null || d.bfProvider === d.originalBfProvider
      ? true
      : window.electronAPI.mspSetRxConfig(d.bfProvider);
  }
  const settings: Record<string, string> = {};
  if (d.receiverType && d.receiverType !== d.originalReceiverType) settings.receiver_type = d.receiverType;
  if (d.inavProvider && d.inavProvider !== d.originalInavProvider) settings.serialrx_provider = d.inavProvider;
  return Object.keys(settings).length === 0 ? true : window.electronAPI.mspSetSettings(settings);
}

export default function ReceiverTab({ isInav, onNavigateToTab }: ReceiverTabProps) {
  const { t } = useTranslation();
  const protocolDraft = pendingDraft<ReceiverProtocolDraft>(PENDING_ID);
  const connection = useConnectionStore((s) => s.connectionState);

  // Hot path (10Hz) — only channels + signal status
  const channels = useReceiverStore((s) => s.channels);
  const signalStatus = useReceiverStore((s) => s.signalStatus);

  // Cold path — config data (changes rarely)
  const rxMap = useReceiverStore((s) => s.rxMap);
  const deadband = useReceiverStore((s) => s.deadband);
  const yawDeadband = useReceiverStore((s) => s.yawDeadband);
  const altHoldDeadband = useReceiverStore((s) => s.altHoldDeadband);
  const deadbandThrottle = useReceiverStore((s) => s.deadbandThrottle);
  const isLoading = useReceiverStore((s) => s.isLoading);
  const configLoaded = useReceiverStore((s) => s.configLoaded);
  const setRxMap = useReceiverStore((s) => s.setRxMap);
  const setDeadband = useReceiverStore((s) => s.setDeadband);
  const setYawDeadband = useReceiverStore((s) => s.setYawDeadband);
  const setAltHoldDeadband = useReceiverStore((s) => s.setAltHoldDeadband);
  const setDeadbandThrottle = useReceiverStore((s) => s.setDeadbandThrottle);
  const hasChanges = useReceiverStore((s) => s.hasChanges);
  const loadConfig = useReceiverStore((s) => s.loadConfig);
  const startPolling = useReceiverStore((s) => s.startPolling);
  const stopPolling = useReceiverStore((s) => s.stopPolling);
  const serialConfig = useReceiverStore((s) => s.serialConfig);
  // INAV switches the receiver off at boot when no UART carries Serial RX (function bit 6)
  const noSerialRxPort = !!serialConfig && !serialConfig.ports.some((p) => (p.functionMask & (1 << 6)) !== 0);

  // iNav receiver type (via Settings API)
  const [receiverType, setReceiverType] = useState<string | null>(protocolDraft?.receiverType ?? null);
  const [originalReceiverType, setOriginalReceiverType] = useState<string | null>(protocolDraft?.originalReceiverType ?? null);

  // BF serialrx_provider (via RX Config)
  const [bfProvider, setBfProvider] = useState<number | null>(protocolDraft?.bfProvider ?? null);
  const [originalBfProvider, setOriginalBfProvider] = useState<number | null>(protocolDraft?.originalBfProvider ?? null);

  // iNav serialrx_provider name
  const [inavSerialrxProvider, setInavSerialrxProvider] = useState<string | null>(protocolDraft?.inavProvider ?? null);
  const [originalInavProvider, setOriginalInavProvider] = useState<string | null>(protocolDraft?.originalInavProvider ?? null);

  // Track if receiver settings loaded from board
  const [receiverSettingsLoaded, setReceiverSettingsLoaded] = useState(!!protocolDraft);

  // Track which channels are active — baseline captured on first data, then compared
  const [channelBaseline, setChannelBaseline] = useState<number[]>([]);

  // MSP_RC is already in Roll, Pitch, Yaw, Throttle order: the firmware applies the RX map.
  const displayChannels = channels;

  // Memoize active channel detection (no state update cascade)
  const activeChannels = React.useMemo(() => {
    if (channelBaseline.length === 0) return Array(16).fill(false) as boolean[];
    return displayChannels.map((ch, i) => {
      const base = channelBaseline[i] ?? 1500;
      return Math.abs(ch - base) > 50;
    });
  }, [displayChannels, channelBaseline]);

  // Load on mount
  useEffect(() => {
    // The store is shared with Ports: reloading would discard their unsaved port edits
    if (!useReceiverStore.getState().hasChanges()) loadConfig();
    // unsaved protocol edits from before a tab switch stay on screen
    if (!pendingDraft(PENDING_ID)) loadReceiverSettings();
    startPolling();
    return () => stopPolling();
  }, []);

  // Capture baseline on first RC data (in logical order)
  useEffect(() => {
    if (channelBaseline.length === 0 && displayChannels.length > 0) {
      setChannelBaseline([...displayChannels]);
    }
  }, [channels, channelBaseline]);

  // Receiver type and serial protocol are their own pending write; the store covers map and deadbands
  useEffect(() => {
    const changed =
      (receiverType !== null && originalReceiverType !== null && receiverType !== originalReceiverType) ||
      (bfProvider !== null && originalBfProvider !== null && bfProvider !== originalBfProvider) ||
      (inavSerialrxProvider !== null && originalInavProvider !== null && inavSerialrxProvider !== originalInavProvider);
    const store = usePendingWritesStore.getState();
    if (!changed) {
      store.drop(PENDING_ID);
      return;
    }
    store.put<ReceiverProtocolDraft>(PENDING_ID, {
      label: t('parameters:receiverTab.pendingLabel'),
      draft: {
        isInav, receiverType, originalReceiverType, inavProvider: inavSerialrxProvider, originalInavProvider,
        bfProvider, originalBfProvider,
      },
      write: writeReceiverProtocol,
      needsReboot: true,
    });
  }, [t, isInav, receiverType, originalReceiverType, bfProvider, originalBfProvider, inavSerialrxProvider, originalInavProvider]);

  const loadReceiverSettings = useCallback(async () => {
    // Use MSP_RX_CONFIG (44) for both iNav and BF — reliable standard MSP command.
    // Do NOT use the Settings API (MSP2_COMMON_SETTING_INFO) — it's unreliable and times out.
    try {
      const rxConfig = await window.electronAPI?.mspGetRxConfig();
      if (!rxConfig) return;

      // serialrx_provider (byte 0) — present on both iNav and BF
      const providerName = rxConfig.serialrxProviderName?.toUpperCase();
      if (isInav) {
        if (providerName) {
          setInavSerialrxProvider(providerName);
          setOriginalInavProvider(providerName);
        }
        // receiver_type (byte 23) — iNav only
        if (rxConfig.receiverTypeName != null) {
          setReceiverType(rxConfig.receiverTypeName);
          setOriginalReceiverType(rxConfig.receiverTypeName);
        }
      } else {
        setBfProvider(rxConfig.serialrxProvider);
        setOriginalBfProvider(rxConfig.serialrxProvider);
      }
      setReceiverSettingsLoaded(true);
    } catch {
      // MSP_RX_CONFIG not available
    }
  }, [isInav]);

  const getSignalBadge = () => {
    switch (signalStatus) {
      case 'active':
        return { text: t('common:active'), color: 'green' };
      case 'stale':
        return { text: t('parameters:receiverTab.signalLost'), color: 'amber' };
      case 'none':
      default:
        return { text: t('parameters:receiverTab.noSignal'), color: 'red' };
    }
  };

  const signalBadge = getSignalBadge();

  return (
    <div className="max-w-full space-y-4">
      {/* Receiver Protocol */}
      <Section
        title={t('common:receiverProtocol')}
        icon={<Radio className="w-5 h-5 text-blue-400" />}
        color="blue"
        defaultOpen={true}
      >
        <div className="mt-4 space-y-4">
          <InfoBanner>
            {t('parameters:receiverTab.protocolHint')}
          </InfoBanner>
          {isInav ? (
            <>
              {/* iNav: receiver_type */}
              <div>
                <label className="text-xs text-content-secondary mb-2 block">{t('parameters:receiverTab.receiverType')}</label>
                {receiverType === null && !receiverSettingsLoaded ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised border-subtle">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-xs text-content-secondary">{t('parameters:receiverTab.readingFromBoard')}</span>
                  </div>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {INAV_RECEIVER_TYPES.map((rt) => (
                      <button
                        key={rt.value}
                        onClick={() => setReceiverType(rt.value)}
                        className={`px-4 py-2 rounded-lg text-sm transition-all ${
                          receiverType === rt.value
                            ? 'bg-blue-600 text-white'
                            : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                        }`}
                      >
                        {rt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* iNav: serialrx_provider quick select */}
              {receiverType === 'SERIAL' && noSerialRxPort && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-300">{t('parameters:receiverTab.noSerialRxTitle')}</p>
                    <p className="mt-0.5 text-content-secondary">
                      {t('parameters:receiverTab.noSerialRxBody')}
                    </p>
                    {onNavigateToTab && (
                      <button onClick={() => onNavigateToTab('ports')} className="mt-1.5 text-blue-400 underline hover:text-blue-300">
                        {t('parameters:receiverTab.openPorts')}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {receiverType === 'SERIAL' && (
                <div>
                  <label className="text-xs text-content-secondary mb-2 block">{t('parameters:receiverTab.serialRxProtocol')}</label>
                  {inavSerialrxProvider === null && !receiverSettingsLoaded ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised border-subtle">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-xs text-content-secondary">{t('parameters:receiverTab.readingFromBoard')}</span>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {INAV_QUICK_SELECT.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setInavSerialrxProvider(p.value)}
                          className={`px-4 py-2 rounded-lg text-sm transition-all ${
                            inavSerialrxProvider === p.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {inavSerialrxProvider && PROTOCOL_HINTS[inavSerialrxProvider] && (
                    <div className="mt-3">
                      <InfoBanner>{PROTOCOL_HINTS[inavSerialrxProvider]}</InfoBanner>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Betaflight: serialrx_provider */}
              {bfProvider === null && !receiverSettingsLoaded ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-raised border-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-xs text-content-secondary">{t('parameters:receiverTab.readingFromBoard')}</span>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-content-secondary mb-2 block">{t('parameters:receiverTab.quickSelect')}</label>
                    <div className="flex gap-2 flex-wrap">
                      {BF_QUICK_SELECT.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setBfProvider(p.value)}
                          className={`px-4 py-2 rounded-lg text-sm transition-all ${
                            bfProvider === p.value
                              ? 'bg-blue-600 text-white'
                              : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-content-secondary mb-2 block">{t('common:allProtocols')}</label>
                    <select
                      value={bfProvider ?? ''}
                      onChange={(e) => setBfProvider(Number(e.target.value))}
                      className="w-full bg-surface-raised text-content rounded-lg px-3 py-2 text-sm border focus:border-blue-500 focus:outline-none"
                    >
                      {bfProvider === null && <option value="">{t('parameters:receiverTab.selectProtocol')}</option>}
                      {BF_PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {bfProvider != null && BF_PROTOCOL_HINTS[bfProvider] && (
                    <InfoBanner color={bfProvider === 15 ? 'amber' : 'blue'}>
                      {BF_PROTOCOL_HINTS[bfProvider]}
                    </InfoBanner>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Section>

      {/* Live RC Channels */}
      <Section
        title={t('parameters:receiverTab.liveRcChannels')}
        icon={
          signalStatus === 'active'
            ? <Signal className="w-5 h-5 text-green-400" />
            : <SignalZero className="w-5 h-5 text-red-400" />
        }
        color={signalStatus === 'active' ? 'green' : 'red'}
        defaultOpen={true}
        badge={signalBadge.text}
        badgeColor={signalBadge.color}
      >
        <div className="mt-4 space-y-4">
          {/* Primary sticks - 2 column grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {displayChannels.slice(0, PRIMARY_CHANNEL_COUNT).map((value, i) => (
              <ChannelBar
                key={i}
                channelIndex={i}
                value={value}
                isActive={activeChannels[i] ?? false}
              />
            ))}
          </div>

          {/* AUX channels - compact 3-column grid */}
          {displayChannels.length > PRIMARY_CHANNEL_COUNT && (
            <>
              <div className="border-t border-subtle" />
              <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                {displayChannels.slice(PRIMARY_CHANNEL_COUNT).map((value, i) => (
                  <CompactChannelBar
                    key={i + PRIMARY_CHANNEL_COUNT}
                    channelIndex={i + PRIMARY_CHANNEL_COUNT}
                    value={value}
                    isActive={activeChannels[i + PRIMARY_CHANNEL_COUNT] ?? false}
                    protocol="msp"
                  />
                ))}
              </div>
            </>
          )}

          {/* No signal diagnostic */}
          {signalStatus === 'none' && !isLoading && (
            <div className="p-4 rounded-xl bg-amber-500/10 border-amber-500/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-300">{t('parameters:receiverTab.noRcSignal')}</p>
                  <p className="text-xs text-content-secondary mt-1">{t('parameters:receiverTab.checkThat')}</p>
                  <ul className="text-xs text-content-secondary mt-1 space-y-0.5 list-disc list-inside">
                    <li>{t('parameters:receiverTab.checkPowered')}</li>
                    <li>{t('parameters:receiverTab.checkUart')}</li>
                    <li>{t('parameters:receiverTab.checkProtocol')}</li>
                  </ul>
                  {onNavigateToTab && (
                    <button
                      onClick={() => onNavigateToTab('ports')}
                      className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      {t('parameters:receiverTab.openPortsConfig')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* Channel Mapping */}
      <Section
        title={t('parameters:receiverTab.channelMapping')}
        icon={<Shuffle className="w-5 h-5 text-purple-400" />}
        color="purple"
      >
        <div className="mt-4 space-y-4">
          <InfoBanner color="purple">
            {t('parameters:receiverTab.channelMappingHint')}
          </InfoBanner>
          <div>
            {/* Current mapping status */}
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-surface-raised border-subtle">
              {isLoading ? (
                <span className="text-xs text-content-secondary">{t('parameters:receiverTab.loadingMapping')}</span>
              ) : (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full ${configLoaded ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <span className="text-xs text-content-secondary">
                    {configLoaded ? t('parameters:receiverTab.boardMapping') : t('parameters:receiverTab.defaultNotLoaded')}
                  </span>
                  <span className="text-xs font-medium text-content">
                    {(() => {
                      const match = RX_MAP_PRESETS.find((p) =>
                        rxMap.length >= 4 &&
                        rxMap[0] === p.map[0] && rxMap[1] === p.map[1] &&
                        rxMap[2] === p.map[2] && rxMap[3] === p.map[3]
                      );
                      return match ? (match.labelKey ? t(match.labelKey) : match.label) : t('parameters:receiverTab.customMap', { map: rxMap.slice(0, 4).join(', ') });
                    })()}
                  </span>
                </>
              )}
            </div>

            <label className="text-xs text-content-secondary mb-2 block">{t('parameters:receiverTab.changeToPreset')}</label>
            <div className="flex gap-2 flex-wrap">
              {RX_MAP_PRESETS.map((preset) => {
                const isSelected = rxMap.length >= 4 &&
                  rxMap[0] === preset.map[0] && rxMap[1] === preset.map[1] &&
                  rxMap[2] === preset.map[2] && rxMap[3] === preset.map[3];
                return (
                  <button
                    key={preset.label}
                    onClick={() => setRxMap(preset.map)}
                    className={`px-3 py-2 rounded-lg text-xs transition-all text-left ${
                      isSelected
                        ? 'bg-purple-600 text-white ring-1 ring-purple-400'
                        : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    <div className="font-medium">{preset.labelKey ? t(preset.labelKey) : preset.label}</div>
                    <div className={`text-[10px] ${isSelected ? 'text-purple-200' : 'text-content-secondary'}`}>{preset.descKey ? t(preset.descKey) : preset.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs text-content-secondary mb-2 block">{t('parameters:receiverTab.customOrder')}</label>
            <ChannelMapDragRow rxMap={rxMap} setRxMap={setRxMap} />
          </div>
        </div>
      </Section>

      {/* Deadband */}
      <Section
        title={t('parameters:receiverTab.deadband')}
        icon={<CircleDot className="w-5 h-5 text-orange-400" />}
        color="orange"
      >
        <div className="mt-4 space-y-4">
          <InfoBanner color="orange">
            {t('parameters:receiverTab.deadbandHint')}
          </InfoBanner>
          <DraggableSlider
            label={t('parameters:receiverTab.stickDeadband')}
            value={deadband}
            onChange={setDeadband}
            min={0}
            max={100}
          />
          <DraggableSlider
            label={t('parameters:receiverTab.yawDeadband')}
            value={yawDeadband}
            onChange={setYawDeadband}
            min={0}
            max={100}
          />
          <DraggableSlider
            label={t('parameters:receiverTab.altHoldDeadband')}
            value={altHoldDeadband}
            onChange={setAltHoldDeadband}
            min={0}
            max={250}
          />
          <DraggableSlider
            label={t('parameters:receiverTab.throttleDeadband')}
            value={deadbandThrottle}
            onChange={setDeadbandThrottle}
            min={0}
            max={250}
          />
        </div>
      </Section>
    </div>
  );
}
