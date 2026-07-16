/**
 * RTK / NTRIP panel (issue #60): configure an NTRIP caster, stream RTCM
 * corrections, and watch them flow to the vehicle as GPS_RTCM_DATA. The
 * client itself lives in the main process; this panel is config + status.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_NTRIP_CONFIG,
  INITIAL_NTRIP_STATUS,
  type NtripConfig,
  type NtripMountpoint,
  type NtripStatus,
} from '../../../shared/ntrip-types';
import { PanelContainer, SectionTitle, StatRow } from './panel-utils';

const STATE_LABEL: Record<NtripStatus['state'], string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Error',
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
  const [config, setConfig] = useState<NtripConfig>(DEFAULT_NTRIP_CONFIG);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<NtripStatus>(INITIAL_NTRIP_STATUS);
  const [mountpoints, setMountpoints] = useState<NtripMountpoint[]>([]);
  const [fetchingTable, setFetchingTable] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
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
    void window.electronAPI.ntripGetConfig().then((c) => mounted && setConfig(c));
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
    if (host && !host.includes('.') && mountpoints.some((m) => m.name === host)) {
      setStatus((s) => ({
        ...s,
        state: 'error',
        error: `"${host}" is a mountpoint, not a caster host. Put the caster server name in Host and "${host}" in Mountpoint.`,
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
      setTableError(result.error ?? 'Failed to fetch mountpoint list');
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
          <span className="text-sm text-content">{STATE_LABEL[status.state]}</span>
          {status.owner && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-content-secondary whitespace-nowrap"
              data-tip={
                status.owner === 'orchestrator'
                  ? 'The multi-vehicle engine runs the NTRIP client and injects corrections into every vehicle'
                  : 'This desktop runs the NTRIP client and injects into the connected vehicle'
              }
            >
              {status.owner === 'orchestrator' ? 'Via orchestrator (fleet)' : 'Direct link'}
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
            {busy ? 'Disconnect' : 'Connect'}
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
            Settings
          </span>
          {!settingsOpen && config.host && (
            <span className="text-[11px] text-content-tertiary font-mono truncate">
              {config.host}:{config.port}
              {config.mountpoint ? ` / ${config.mountpoint}` : ''}
            </span>
          )}
        </button>

        {settingsOpen && (<>
        {/* Caster config */}
        <div>
          <SectionTitle>Caster</SectionTitle>
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <Field label="Host" className="flex-1">
                <input
                  type="text"
                  placeholder="e.g. rtk2go.com"
                  value={config.host}
                  onChange={(e) => setConfig({ ...config, host: e.target.value })}
                  onBlur={(e) => persist({ host: e.target.value.trim() })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Port" className="w-16">
                <input
                  type="number"
                  value={config.port}
                  onChange={(e) => persist({ port: Math.max(1, Math.min(65535, Number(e.target.value) || 2101)) })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Protocol" className="w-20">
                <select
                  value={config.protocol ?? 'auto'}
                  onChange={(e) => persist({ protocol: e.target.value as NtripConfig['protocol'] })}
                  data-tip="NTRIP revision. Auto tries v2 and falls back to v1"
                  className={INPUT_CLASS}
                >
                  <option value="auto">Auto</option>
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
              <Field label="Username" className="flex-1">
                <input
                  type="text"
                  placeholder="Empty if anonymous"
                  autoComplete="off"
                  value={config.username}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  onBlur={(e) => persist({ username: e.target.value.trim() })}
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Password" className="flex-1">
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
              <Field label="Mountpoint" className="flex-1">
                <input
                  type="text"
                  placeholder="e.g. MOUNT1 (use List)"
                  value={config.mountpoint}
                  onChange={(e) => setConfig({ ...config, mountpoint: e.target.value })}
                  onBlur={(e) => persist({ mountpoint: e.target.value.trim() })}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>
              <button
                onClick={() => void handleFetchSourcetable()}
                disabled={fetchingTable || !config.host}
                data-tip="Fetch the caster's mountpoint list"
                className="px-2.5 py-1.5 rounded text-xs bg-surface-raised text-content-secondary hover:text-content transition-colors disabled:opacity-50"
              >
                {fetchingTable ? 'Fetching...' : 'List'}
              </button>
            </div>
            {tableError && <div className="text-xs text-red-400">{tableError}</div>}
            {mountpoints.length > 0 && (
              <select
                value={config.mountpoint}
                onChange={(e) => persist({ mountpoint: e.target.value })}
                className={INPUT_CLASS}
              >
                <option value="">Select a mountpoint ({mountpoints.length} found)</option>
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
          <SectionTitle>Position Upload</SectionTitle>
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs text-content-secondary"
              data-tip="Uploads the vehicle's GPS position as NMEA GGA. Required by VRS / network mountpoints."
            >
              <input
                type="checkbox"
                checked={config.sendPosition}
                onChange={(e) => persist({ sendPosition: e.target.checked })}
                className="accent-blue-500"
              />
              Send vehicle position (GGA)
            </label>
            {config.sendPosition && (
              <label className="flex items-center gap-1.5 text-xs text-content-secondary">
                Interval (s)
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={config.ggaIntervalSec}
                  onChange={(e) => persist({ ggaIntervalSec: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  className={`${INPUT_CLASS} w-14`}
                />
              </label>
            )}
          </div>
        </div>
        </>)}

        {/* Stream stats */}
        {(busy || status.bytesReceived > 0) && (
          <div>
            <SectionTitle>Corrections</SectionTitle>
            <div className="space-y-1">
              {status.mountpoint && <StatRow label="Mountpoint" value={status.mountpoint} />}
              <StatRow label="Received" value={formatBytes(status.bytesReceived)} />
              <StatRow label="Data rate" value={`${formatBytes(status.dataRateBps)}/s`} />
              <StatRow
                label={status.owner === 'orchestrator' ? 'Forwarded to fleet' : 'Forwarded to vehicle'}
                value={status.rtcmForwarded}
              />
              {status.owner === 'orchestrator' &&
                status.perVehicleForwarded &&
                Object.keys(status.perVehicleForwarded).length > 0 && (
                  <StatRow label="Vehicles receiving" value={Object.keys(status.perVehicleForwarded).length} />
                )}
              {status.rtcmDropped > 0 && <StatRow label="Dropped" value={status.rtcmDropped} />}
              <StatRow
                label="GGA upload"
                value={
                  status.ggaState === 'off'
                    ? 'Off'
                    : status.ggaState === 'waiting-for-fix'
                      ? 'Waiting for fix'
                      : `Sent ${status.ggaSentCount}`
                }
              />
              {typesSummary && (
                <div className="pt-1">
                  <div className="text-content-secondary text-xs mb-0.5">RTCM messages</div>
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
