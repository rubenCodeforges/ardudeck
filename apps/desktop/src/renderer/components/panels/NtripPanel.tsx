/**
 * RTK / NTRIP panel (issue #60): configure an NTRIP caster, stream RTCM
 * corrections, and watch them flow to the vehicle as GPS_RTCM_DATA. The
 * client itself lives in the main process; this panel is config + status.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import {
  DEFAULT_NTRIP_CONFIG,
  INITIAL_NTRIP_STATUS,
  type NtripConfig,
  type NtripMountpoint,
  type NtripStatus,
  type RtkSource,
} from '../../../shared/ntrip-types';
import type { SerialPortInfo } from '@ardudeck/comms';
import { PanelContainer, SectionTitle, StatRow } from './panel-utils';

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const STATE_LABEL_KEY: Record<NtripStatus['state'], string> = {
  disconnected: 'panels:ntripPanel.stateDisconnected',
  connecting: 'panels:ntripPanel.stateConnecting',
  connected: 'panels:ntripPanel.stateConnected',
  reconnecting: 'panels:ntripPanel.stateReconnecting',
  error: 'panels:ntripPanel.stateError',
};

const STATE_DOT: Record<NtripStatus['state'], string> = {
  disconnected: 'bg-gray-400',
  connecting: 'bg-yellow-400',
  connected: 'bg-emerald-400',
  reconnecting: 'bg-yellow-400',
  error: 'bg-red-400',
};

const INPUT_CLASS =
  'w-full rounded border border-default bg-surface-input px-2 py-1 text-xs text-content';

/** Persistent tiny label above an input, so filled fields stay identifiable. */
function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="text-[10px] text-content-secondary mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function rtcmTypesSummary(counts: Record<number, number>): string {
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (entries.length === 0) return '';
  return entries.map(([type, n]) => `${type} (${n})`).join(', ');
}

export function NtripPanel() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<NtripConfig>(DEFAULT_NTRIP_CONFIG);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<NtripStatus>(INITIAL_NTRIP_STATUS);
  const [mountpoints, setMountpoints] = useState<NtripMountpoint[]>([]);
  const [fetchingTable, setFetchingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const configRef = useRef(config);
  configRef.current = config;

  // Once the stream is up the settings are done their job: collapse them so
  // the panel is mostly live stats. Reopen on error so the fix is one click
  // away. Manual toggling still wins in between.
  const prevStateRef = useRef(status.state);
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = status.state;
    if (status.state === prev) return;
    if (status.state === 'connected') setSettingsOpen(false);
    if (status.state === 'error') setSettingsOpen(true);
  }, [status.state]);

  useEffect(() => {
    let mounted = true;
    void window.electronAPI.ntripGetConfig().then((c) => {
      if (!mounted) return;
      setConfig(c);
      if (c.source === 'serial') {
        void window.electronAPI.ntripListSerialPorts().then((p) => mounted && setSerialPorts(p));
      }
    });
    void window.electronAPI.ntripGetStatus().then((s) => mounted && setStatus(s));
    void window.electronAPI.getApiKey('ntrip').then((r) => mounted && setPassword(r.key));
    const unsubscribe = window.electronAPI.onNtripStatus((s) => mounted && setStatus(s));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const persist = (patch: Partial<NtripConfig>) => {
    const next = { ...configRef.current, ...patch };
    setConfig(next);
    void window.electronAPI.ntripSetConfig(next);
  };

  const refreshSerialPorts = async () => {
    setSerialPorts(await window.electronAPI.ntripListSerialPorts());
  };

  const savePassword = () => {
    void window.electronAPI.setApiKey('ntrip', password);
  };

  const busy = status.state === 'connecting' || status.state === 'connected' || status.state === 'reconnecting';

  const handleConnectToggle = async () => {
    if (busy) {
      await window.electronAPI.ntripDisconnect();
      return;
    }
    // Common mix-up guard: a mountpoint name pasted into the Host field. A
    // caster host always has a dot; a bare token matching the fetched
    // sourcetable is certainly the mountpoint.
    const host = configRef.current.host.trim();
    if (configRef.current.source !== 'serial' && host && !host.includes('.') && mountpoints.some((m) => m.name === host)) {
      setStatus((s) => ({
        ...s,
        state: 'error',
        error: t('panels:ntripPanel.mountpointInHost', { host }),
      }));
      return;
    }
    savePassword();
    const result = await window.electronAPI.ntripConnect();
    if (!result.success && result.error) {
      setStatus((s) => ({ ...s, state: 'error', error: result.error }));
    }
  };

  const handleFetchSourcetable = async () => {
    setFetchingTable(true);
    setTableError(null);
    savePassword();
    const result = await window.electronAPI.ntripGetSourcetable();
    setFetchingTable(false);
    if (result.success && result.mountpoints) {
      setMountpoints(result.mountpoints);
    } else {
      setMountpoints([]);
      setTableError(result.error ?? t('panels:ntripPanel.fetchFailed'));
    }
  };

  const errorText = status.state === 'error' || status.state === 'reconnecting' ? status.error : undefined;
  const typesSummary = rtcmTypesSummary(status.rtcmTypeCounts);

  return (
    <PanelContainer>
      <div className="space-y-4 max-w-md">
        {/* Status header */}
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${STATE_DOT[status.state]}`} />
          <span className="text-sm text-content">{t(STATE_LABEL_KEY[status.state])}</span>
          {status.owner && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-content-secondary whitespace-nowrap"
              data-tip={
                status.owner === 'orchestrator'
                  ? t('panels:ntripPanel.ownerOrchestratorTip')
                  : t('panels:ntripPanel.ownerDirectTip')
              }
            >
              {status.owner === 'orchestrator' ? t('panels:ntripPanel.ownerOrchestrator') : t('panels:ntripPanel.ownerDirect')}
            </span>
          )}
          {status.state === 'connected' && (
            <span className="text-xs text-content-tertiary font-mono">{formatBytes(status.dataRateBps)}/s</span>
          )}
          <button
            onClick={() => void handleConnectToggle()}
            className={`ml-auto px-3 py-1 rounded text-xs font-medium transition-colors ${
              busy
                ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25'
            }`}
          >
            {busy ? t('common:disconnect') : t('common:connect')}
          </button>
        </div>
        {errorText && <div className="text-xs text-red-400">{errorText}</div>}

        {/* Collapsible settings: header always visible, body folds away once connected */}
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center gap-1.5 text-left group"
        >
          <svg
            className={`w-3 h-3 text-content-tertiary transition-transform ${settingsOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[10px] font-medium text-content-secondary uppercase tracking-wider group-hover:text-content">
            {t('panels:ntripPanel.settings')}
          </span>
          {!settingsOpen && config.source === 'serial' && config.serialPath && (
            <span className="text-[11px] text-content-tertiary font-mono truncate">
              {config.serialPath} @ {config.serialBaud}
            </span>
          )}
          {!settingsOpen && config.source !== 'serial' && config.host && (
            <span className="text-[11px] text-content-tertiary font-mono truncate">
              {config.host}:{config.port}
              {config.mountpoint ? ` / ${config.mountpoint}` : ''}
            </span>
          )}
        </button>

        {settingsOpen && (<>
        {/* Corrections source */}
        <div>
          <SectionTitle>{t('panels:ntripPanel.source')}</SectionTitle>
          <div className="flex rounded overflow-hidden border border-default w-fit">
            {([
              { id: 'ntrip', label: t('panels:ntripPanel.sourceNtrip'), tip: t('panels:ntripPanel.sourceNtripTip') },
              { id: 'serial', label: t('panels:ntripPanel.sourceSerial'), tip: t('panels:ntripPanel.sourceSerialTip') },
            ] as Array<{ id: RtkSource; label: string; tip: string }>).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  persist({ source: s.id });
                  if (s.id === 'serial') void refreshSerialPorts();
                }}
                data-tip={s.tip}
                className={`px-2.5 py-1 text-xs transition-colors ${
                  (config.source ?? 'ntrip') === s.id
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-surface-input text-content-secondary hover:text-content'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {config.source === 'serial' && (
        <div>
          <SectionTitle>{t('panels:ntripPanel.baseStation')}</SectionTitle>
          <div className="flex gap-2 items-end">
            <Field label={t('panels:ntripPanel.serialPort')} className="flex-1">
              <select
                value={config.serialPath}
                onChange={(e) => persist({ serialPath: e.target.value })}
                className={`${INPUT_CLASS} font-mono`}
              >
                <option value="">{t('panels:ntripPanel.selectPort', { count: serialPorts.length })}</option>
                {/* Keep a vanished configured port selectable so the choice survives replug. */}
                {config.serialPath && !serialPorts.some((p) => p.path === config.serialPath) && (
                  <option value={config.serialPath}>{t('panels:ntripPanel.notPresent', { path: config.serialPath })}</option>
                )}
                {serialPorts.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.path}
                    {p.manufacturer ? ` - ${p.manufacturer}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('common:baud')} className="w-24">
              <select
                value={config.serialBaud}
                onChange={(e) => persist({ serialBaud: Number(e.target.value) })}
                className={INPUT_CLASS}
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </Field>
            <button
              onClick={() => void refreshSerialPorts()}
              data-tip={t('panels:ntripPanel.rescanTip')}
              className="px-2.5 py-1.5 rounded text-xs bg-surface-raised text-content-secondary hover:text-content transition-colors"
            >
              {t('common:rescan')}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-content-tertiary">
            {t('panels:ntripPanel.baseHint')}
          </p>
        </div>
        )}

        {config.source !== 'serial' && (<>
        {/* Caster config */}
        <div>
          <SectionTitle>{t('panels:ntripPanel.caster')}</SectionTitle>
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <Field label={t('panels:ntripPanel.host')} className="flex-1">
                <input
                  type="text"
                  placeholder={t('panels:ntripPanel.hostPlaceholder')}
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  onBlur={(e) => persist({ host: e.target.value.trim() })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t('common:port')} className="w-16">
                <DraftNumberInput
                  value={config.port}
                  min={1}
                  max={65535}
                  integer
                  onCommit={(v) => persist({ port: v })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t('common:protocol')} className="w-20">
                <select
                  value={config.protocol ?? 'auto'}
                  onChange={(e) => persist({ protocol: e.target.value as NtripConfig['protocol'] })}
                  data-tip={t('panels:ntripPanel.protocolTip')}
                  className={INPUT_CLASS}
                >
                  <option value="auto">{t('common:auto')}</option>
                  <option value="v1">v1</option>
                  <option value="v2">v2</option>
                </select>
              </Field>
              <label className="flex items-center gap-1.5 text-xs text-content-secondary whitespace-nowrap pb-1.5">
                <input
                  type="checkbox"
                  checked={config.useTls}
                  onChange={(e) => persist({ useTls: e.target.checked })}
                  className="accent-blue-500"
                />
                TLS
              </label>
            </div>
            <div className="flex gap-2">
              <Field label={t('panels:ntripPanel.username')} className="flex-1">
                <input
                  type="text"
                  placeholder={t('panels:ntripPanel.usernamePlaceholder')}
                  autoComplete="off"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  onBlur={(e) => persist({ username: e.target.value.trim() })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label={t('common:password')} className="flex-1">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={savePassword}
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
            <div className="flex gap-2 items-end">
              <Field label={t('panels:ntripPanel.mountpoint')} className="flex-1">
                <input
                  type="text"
                  placeholder={t('panels:ntripPanel.mountpointPlaceholder')}
                  value={config.mountpoint}
                  onChange={(e) => setConfig({ ...config, mountpoint: e.target.value })}
                  onBlur={(e) => persist({ mountpoint: e.target.value.trim() })}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>
              <button
                onClick={() => void handleFetchSourcetable()}
                disabled={fetchingTable || !config.host}
                data-tip={t('panels:ntripPanel.listTip')}
                className="px-2.5 py-1.5 rounded text-xs bg-surface-raised text-content-secondary hover:text-content transition-colors disabled:opacity-50"
              >
                {fetchingTable ? t('panels:ntripPanel.fetching') : t('panels:ntripPanel.list')}
              </button>
            </div>
            {tableError && <div className="text-xs text-red-400">{tableError}</div>}
            {mountpoints.length > 0 && (
              <select
                value={config.mountpoint}
                onChange={(e) => persist({ mountpoint: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">{t('panels:ntripPanel.selectMountpoint', { count: mountpoints.length })}</option>
                {mountpoints.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.format ? ` - ${m.format}` : ''}
                    {m.country ? ` (${m.country})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Position upload */}
        <div>
          <SectionTitle>{t('panels:ntripPanel.positionUpload')}</SectionTitle>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs text-content-secondary"
              data-tip={t('panels:ntripPanel.sendPositionTip')}
            >
              <input
                type="checkbox"
                checked={config.sendPosition}
                onChange={(e) => persist({ sendPosition: e.target.checked })}
                className="accent-blue-500"
              />
              {t('panels:ntripPanel.sendPosition')}
            </label>
            {config.sendPosition && (
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                {t('panels:ntripPanel.interval')}
                <DraftNumberInput
                  min={1}
                  max={30}
                  integer
                  value={config.ggaIntervalSec}
                  onCommit={(v) => persist({ ggaIntervalSec: v })}
                  className={`${INPUT_CLASS} w-14`}
                />
              </label>
            )}
          </div>
        </div>
        </>)}
        </>)}

        {/* Stream stats */}
        {(busy || status.bytesReceived > 0) && (
          <div>
            <SectionTitle>{t('panels:ntripPanel.corrections')}</SectionTitle>
            <div className="space-y-1">
              {status.mountpoint && <StatRow label={t('panels:ntripPanel.mountpoint')} value={status.mountpoint} />}
              <StatRow label={t('panels:ntripPanel.received')} value={formatBytes(status.bytesReceived)} />
              <StatRow label={t('panels:ntripPanel.dataRate')} value={`${formatBytes(status.dataRateBps)}/s`} />
              <StatRow
                label={status.owner === 'orchestrator' ? t('panels:ntripPanel.forwardedFleet') : t('panels:ntripPanel.forwardedVehicle')}
                value={status.rtcmForwarded}
              />
              {status.owner === 'orchestrator' &&
                status.perVehicleForwarded &&
                Object.keys(status.perVehicleForwarded).length > 0 && (
                  <StatRow label={t('panels:ntripPanel.vehiclesReceiving')} value={Object.keys(status.perVehicleForwarded).length} />
                )}
              {status.rtcmDropped > 0 && <StatRow label={t('panels:ntripPanel.dropped')} value={status.rtcmDropped} />}
              {status.basePosition && (
                <StatRow
                  label={t('panels:ntripPanel.basePosition')}
                  value={`${status.basePosition.lat.toFixed(7)}, ${status.basePosition.lon.toFixed(7)} (${status.basePosition.altM.toFixed(1)} m)`}
                />
              )}
              {status.source !== 'serial' && (
                <StatRow
                  label={t('panels:ntripPanel.ggaUpload')}
                  value={
                    status.ggaState === 'off'
                      ? t('common:off')
                      : status.ggaState === 'waiting-for-fix'
                        ? t('panels:ntripPanel.waitingForFix')
                        : t('panels:ntripPanel.sentCount', { count: status.ggaSentCount })
                  }
                />
              )}
              {typesSummary && (
                <div className="pt-1">
                  <div className="text-content-secondary text-xs mb-0.5">{t('panels:ntripPanel.rtcmMessages')}</div>
                  <div className="font-mono text-[11px] text-content-tertiary break-words">{typesSummary}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
